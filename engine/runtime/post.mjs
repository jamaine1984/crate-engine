import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {GTAOPass} from 'three/addons/postprocessing/GTAOPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {BokehPass} from 'three/addons/postprocessing/BokehPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';

/* Colour grade + vignette, applied after tone mapping (display space). */
export const GRADE_SHADER={
 name:'CrateGradeShader',
 uniforms:{tDiffuse:{value:null},saturation:{value:0},contrast:{value:0},warmth:{value:0},vignette:{value:0}},
 vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
 fragmentShader:`uniform sampler2D tDiffuse;uniform float saturation,contrast,warmth,vignette;varying vec2 vUv;
void main(){vec4 c=texture2D(tDiffuse,vUv);vec3 col=c.rgb;
col+=vec3(.07,.025,-.07)*warmth;
float l=dot(col,vec3(.2126,.7152,.0722));col=mix(vec3(l),col,1.0+saturation);
col=(col-.5)*(1.0+contrast)+.5;
float v=smoothstep(.85,.25,length(vUv-.5)*1.25);col*=mix(1.0,v,vignette);
gl_FragColor=vec4(clamp(col,0.0,1.0),c.a);}`
};

/** Which passes a settings object needs. Low quality renders straight to the screen. */
export function postPlan(settings){
 if(settings.quality==='low')return {composer:false,ao:false,dof:false,bloom:false,grade:false};
 const high=settings.quality==='high',grade=settings.vignette>0||settings.saturation!==0||settings.contrast!==0||settings.warmth!==0;
 const plan={ao:high,dof:high&&settings.dof>0,bloom:settings.bloom>0,grade};
 plan.composer=plan.ao||plan.dof||plan.bloom||plan.grade||high;
 return plan;
}

/* The depth buffer has too little precision far from the camera (near .05, far 3000), so ambient occlusion turns distant ground and sky into black speckle. It only matters up close, so fade it out with distance. */
export function fadeAoWithDistance(pass){
 const material=pass.gtaoMaterial,marker='ao = pow(ao, scale);';
 if(material.fragmentShader.includes(marker))material.fragmentShader=material.fragmentShader.replace(marker,marker+' ao = mix(ao, 1.0, smoothstep(30.0, 90.0, -viewPos.z));');
}

export function createPost(THREE,{renderer,scene,camera,root}){
 let composer=null,key='',passes={},width=1,height=1,ratio=1,focusFrame=0,focus=10;
 const ray=new THREE.Raycaster(),centre=new THREE.Vector2(0,0);ray.firstHitOnly=true;
 function destroy(){for(const pass of composer?.passes||[])pass.dispose?.();composer?.renderTarget1.dispose();composer?.renderTarget2.dispose();composer?.dispose();composer=null;passes={};}
 function build(plan){
  destroy();if(!plan.composer)return;
  const target=new THREE.WebGLRenderTarget(width*ratio,height*ratio,{type:THREE.HalfFloatType,samples:4});
  composer=new EffectComposer(renderer,target);composer.setPixelRatio(ratio);composer.setSize(width,height);
  composer.addPass(new RenderPass(scene,camera));
  if(plan.ao){passes.ao=new GTAOPass(scene,camera,width,height);passes.ao.updateGtaoMaterial({radius:.7,distanceExponent:1,thickness:1,scale:1,samples:8});fadeAoWithDistance(passes.ao);composer.addPass(passes.ao);}
  if(plan.dof){passes.dof=new BokehPass(scene,camera,{focus:10,aperture:.002,maxblur:.008});composer.addPass(passes.dof);}
  if(plan.bloom){/* HDR threshold: a daylight sky is 1–4 in linear units, so only the sun, glowing materials and hot highlights bloom. */passes.bloom=new UnrealBloomPass(new THREE.Vector2(width,height),.5,.4,6);composer.addPass(passes.bloom);}
  composer.addPass(new OutputPass());
  if(plan.grade){passes.grade=new ShaderPass(GRADE_SHADER);composer.addPass(passes.grade);}
 }
 function configure(settings){
  const plan=postPlan(settings),next=JSON.stringify(plan);if(next!==key){key=next;build(plan);}
  if(passes.bloom){passes.bloom.strength=settings.bloom*.6;passes.bloom.radius=.35+settings.bloom*.1;}
  if(passes.dof){passes.dof.uniforms.aperture.value=settings.dof*.004;passes.dof.uniforms.maxblur.value=.004+settings.dof*.01;}
  if(passes.grade)for(const name of ['saturation','contrast','warmth','vignette'])passes.grade.uniforms[name].value=settings[name];
  return plan;
 }
 function autoFocus(){
  if(!passes.dof||focusFrame++%8)return;
  ray.setFromCamera(centre,camera);const hit=ray.intersectObjects(root.children,true)[0];
  const target=hit?hit.distance:60;focus+=(target-focus)*.5;passes.dof.uniforms.focus.value=focus;
 }
 return {
  configure,
  get active(){return !!composer;},
  get ao(){return passes.ao||null;},
  get composer(){return composer;},
  setSize(w,h){width=w;height=h;composer?.setSize(w,h);},
  setPixelRatio(value){ratio=value;composer?.setPixelRatio(value);},
  render(){autoFocus();composer.render();},
  dispose:destroy
 };
}
