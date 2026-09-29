/* Animated ocean/lake water for plane objects that carry a `water` component.
   Four Gerstner waves displace a dense grid in the vertex shader (with analytic normals),
   and the fragment shader adds fine ripples, a deep/shallow colour blend, sky reflection at
   grazing angles and foam on wave crests. Everything is drawn by three.js's standard PBR
   material, so the sun, shadows, fog and tone mapping keep working. */
export const WATER_DEFAULTS=Object.freeze({waveHeight:.6,waveLength:24,speed:1,choppiness:.5,opacity:.86,deepColor:'#0a4d6e',foam:true});
export const WATER_SEGMENTS=320;

const COMMON=`
uniform float uTime;
uniform float uHeight;
uniform float uLength;
uniform float uChoppy;
uniform float uSpeed;
varying vec2 vWaterXZ;
varying float vCrest;
varying vec3 vWaterWorld;
vec3 gDisp;
vec3 gNormal;
float gCrest;
void gerstnerWaves(vec2 p){
 // direction angle, amplitude share, wavelength share
 vec3 W[4];
 W[0]=vec3(0.15,1.00,1.00);
 W[1]=vec3(0.95,0.62,0.68);
 W[2]=vec3(-0.75,0.42,0.47);
 W[3]=vec3(2.05,0.24,0.36);
 vec3 d=vec3(0.0);
 vec3 n=vec3(0.0,1.0,0.0);
 float crest=0.0;
 for(int i=0;i<4;i++){
  float L=max(uLength*W[i].z,1.0);
  float k=6.2831853/L;
  float c=sqrt(9.81/k)*uSpeed;
  vec2 dir=vec2(cos(W[i].x),sin(W[i].x));
  float a=uHeight*W[i].y*0.5;
  float f=k*dot(dir,p)-c*k*uTime;
  float q=uChoppy/(k*max(uHeight,0.05)*4.0);
  q=min(q,1.0);
  float s=sin(f),co=cos(f);
  d.x+=q*a*dir.x*co;
  d.z+=q*a*dir.y*co;
  d.y+=a*s;
  n.x-=dir.x*k*a*co;
  n.z-=dir.y*k*a*co;
  n.y-=q*k*a*s;
  crest+=s*W[i].y;
 }
 gDisp=d;
 gNormal=normalize(n);
 gCrest=crest/2.28;
}
`;

const VERTEX_NORMAL=`
vec2 waterP=(modelMatrix*vec4(position,1.0)).xz;
gerstnerWaves(waterP);
vWaterXZ=waterP;
vCrest=gCrest;
vec3 objectNormal=vec3(0.0,1.0,0.0);
`;

const VERTEX_POSITION=`
vec3 transformed=vec3(position);
vec3 waterScale=vec3(length(modelMatrix[0].xyz),length(modelMatrix[1].xyz),length(modelMatrix[2].xyz));
transformed+=gDisp/waterScale;
vWaterWorld=(modelMatrix*vec4(transformed,1.0)).xyz;
`;

const VERTEX_NORMAL_OUT=`
#include <defaultnormal_vertex>
transformedNormal=normalize(mat3(viewMatrix)*gNormal);
`;

const FRAGMENT_COMMON=`
uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uSky;
uniform float uOpacity;
uniform float uFoam;
uniform float uFX;
uniform float uReflectOn;
uniform sampler2D uRefract;
uniform sampler2D uDepth;
uniform sampler2D uReflect;
uniform mat4 uTexMatrix;
uniform vec2 uRes;
uniform float uNear;
uniform float uFar;
uniform float uClarity;
varying vec2 vWaterXZ;
varying float vCrest;
varying vec3 vWaterWorld;
float waterViewZ(float d){return (uNear*uFar)/((uFar-uNear)*d-uFar);}
float hash21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash21(i),hash21(i+vec2(1.0,0.0)),f.x),mix(hash21(i+vec2(0.0,1.0)),hash21(i+vec2(1.0,1.0)),f.x),f.y);}
`;

const FRAGMENT_SHADE=`
#include <normal_fragment_maps>
{
 vec2 q=vWaterXZ;
 float t=uTime;
 vec2 g=vec2(0.0);
 g+=vec2(cos(q.x*1.7+q.y*0.6+t*1.3)*1.7,cos(q.x*1.7+q.y*0.6+t*1.3)*0.6);
 g+=vec2(cos(q.x*-0.9+q.y*2.3-t*1.1)*-0.9,cos(q.x*-0.9+q.y*2.3-t*1.1)*2.3);
 g+=vec2(cos(q.x*3.1-q.y*1.9+t*1.9)*3.1,cos(q.x*3.1-q.y*1.9+t*1.9)*-1.9)*0.5;
 vec3 ripple=(viewMatrix*vec4(-g.x*0.018,0.0,-g.y*0.018,0.0)).xyz;
 normal=normalize(normal+ripple);
 vec3 V=normalize(vViewPosition);
 float fres=pow(1.0-clamp(dot(V,normal),0.0,1.0),4.0);
 float n1=vnoise(q*0.9+vec2(t*0.25,-t*0.18)),n2=vnoise(q*2.6-vec2(t*0.4,t*0.3));
 float foam=uFoam*smoothstep(0.62,0.95,vCrest+(n1-0.5)*0.35+(n2-0.5)*0.2);
 if(uFX>0.5){
  // Screen-space water: refraction + depth absorption + planar reflection + shoreline foam.
  vec2 suv=gl_FragCoord.xy/uRes;
  float waterZ=vViewPosition.z;
  float sceneZ=-waterViewZ(texture2D(uDepth,suv).x);
  float thick=max(sceneZ-waterZ,0.0);
  vec3 viewDirW=normalize(vWaterWorld-cameraPosition);
  float vdepth=thick*max(abs(viewDirW.y),0.08);
  vec2 ruv=suv+normal.xy*0.045*clamp(vdepth,0.0,1.0);
  float z2=-waterViewZ(texture2D(uDepth,ruv).x);
  if(z2<waterZ)ruv=suv;
  vec3 refr=texture2D(uRefract,ruv).rgb;
  vec3 absorb=exp(-vdepth*vec3(0.62,0.24,0.2)*uClarity);
  float light=clamp(dot(uSky,vec3(0.299,0.587,0.114)),0.05,2.0);
  vec3 scatter=mix(diffuseColor.rgb,uDeep,smoothstep(0.0,7.0,vdepth))*light*0.5;
  vec3 body=refr*absorb+scatter*(1.0-absorb.g);
  vec3 refl=uSky;
  if(uReflectOn>0.5){vec4 rp=uTexMatrix*vec4(vWaterWorld,1.0);vec2 rs=rp.xy/rp.w+normal.xy*0.05;refl=texture2D(uReflect,rs).rgb;}
  float NdV=clamp(dot(V,normal),0.0,1.0);
  float F=0.02+0.98*pow(1.0-NdV,5.0);
  vec3 col=mix(body,refl,F*0.92);
  float shore=1.0-smoothstep(0.0,0.1+0.18*n1,vdepth);
  float bands=smoothstep(0.55,0.95,0.5+0.5*sin(vdepth*22.0-t*1.8+n2*5.0))*(1.0-smoothstep(0.0,0.55,vdepth));
  float lace=smoothstep(0.45,0.75,vnoise(q*6.0+vec2(t*0.6,-t*0.5))*0.6+n2*0.5);
  float sfoam=uFoam*clamp(shore*0.7*lace+bands*0.45*lace,0.0,1.0);
  float allFoam=clamp(foam*0.8+sfoam,0.0,1.0);
  diffuseColor.rgb=vec3(0.9)*allFoam;
  diffuseColor.a=1.0;
  totalEmissiveRadiance+=col*(1.0-allFoam);
 }else{
  float depthMix=clamp(0.45+vCrest*0.35,0.0,1.0);
  vec3 body=mix(uDeep,diffuseColor.rgb,depthMix);
  body=mix(body,vec3(0.94,0.98,1.0),foam*0.85);
  diffuseColor.rgb=body;
  diffuseColor.a=clamp(mix(uOpacity*0.78,1.0,fres)+foam*0.4,0.0,1.0);
  totalEmissiveRadiance+=uSky*fres*0.55;
 }
}
`;

function hexToColor(THREE,hex,fallback){try{return new THREE.Color(/^#[a-fA-F0-9]{6}$/.test(hex)?hex:fallback);}catch{return new THREE.Color(fallback);}}

/** Returns a Mesh whose material animates with `uniforms.uTime`. Call updateWaterTime() from the render loop. */
export function createWaterMesh(THREE,entity,fx=null){
 const settings={...WATER_DEFAULTS,...(entity.components?.water||{})};
 const geometry=new THREE.PlaneGeometry(1,1,WATER_SEGMENTS,WATER_SEGMENTS);geometry.rotateX(-Math.PI/2);
 const uniforms={
  uTime:{value:0},uHeight:{value:settings.waveHeight},uLength:{value:settings.waveLength},uChoppy:{value:settings.choppiness},uSpeed:{value:settings.speed},
  uDeep:{value:hexToColor(THREE,settings.deepColor,WATER_DEFAULTS.deepColor)},uSky:{value:new THREE.Color('#bfe3ff')},uOpacity:{value:settings.opacity},uFoam:{value:settings.foam===false?0:1},uClarity:{value:1},
  ...(fx?fx.uniforms:{uFX:{value:0},uReflectOn:{value:0},uRefract:{value:null},uDepth:{value:null},uReflect:{value:null},uTexMatrix:{value:new THREE.Matrix4()},uRes:{value:new THREE.Vector2(1,1)},uNear:{value:.1},uFar:{value:1000}})
 };
 const material=new THREE.MeshStandardMaterial({color:entity.material?.color||'#2fbcc9',metalness:0,roughness:Math.max(.03,Math.min(.5,entity.material?.roughness??.06)),transparent:true,envMapIntensity:1.1});
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,uniforms);
  shader.vertexShader=shader.vertexShader
   .replace('#include <common>','#include <common>\n'+COMMON)
   .replace('#include <beginnormal_vertex>',VERTEX_NORMAL)
   .replace('#include <begin_vertex>',VERTEX_POSITION)
   .replace('#include <defaultnormal_vertex>',VERTEX_NORMAL_OUT);
  shader.fragmentShader=shader.fragmentShader
   .replace('#include <common>','#include <common>\n'+FRAGMENT_COMMON)
   .replace('#include <normal_fragment_maps>',FRAGMENT_SHADE);
 };
 material.customProgramCacheKey=()=>'crate-water-v2';
 material.envMapIntensity=fx?.35:1.1;
 const mesh=new THREE.Mesh(geometry,material);
 mesh.userData.water={uniforms};
 mesh.frustumCulled=false;
 return mesh;
}
export function isWaterObject(object){return !!object?.userData?.water;}
export function updateWaterTime(object,seconds,skyColor){
 const uniforms=object?.userData?.water?.uniforms;if(!uniforms)return;
 uniforms.uTime.value=seconds;if(skyColor)uniforms.uSky.value.copy(skyColor);
}
