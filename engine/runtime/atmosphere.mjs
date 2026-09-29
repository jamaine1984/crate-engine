import {Sky} from 'three/addons/objects/Sky.js';
import {sunState} from '../core/look.mjs';

/* three's Sky outputs radiance for exposure ~0.5; scale it so it sits beside lit objects at the scene's own exposure. */
export const SKY_MARKER='gl_FragColor = vec4( texColor, 1.0 );';
export function addSkyExposure(material){
 if(!material.fragmentShader.includes(SKY_MARKER))throw new Error('three.js Sky shader changed; update addSkyExposure.');
 Object.assign(material.uniforms,{skyExposure:{value:.45},skyCap:{value:7},skyGrey:{value:0},skyNight:{value:0}});
 /* Exposure scale, a cap on the sun disc (otherwise bloom floods the frame), grey for overcast, and a deep blue starry floor at night. */
 const grade=`vec3 skyOut = min( texColor * skyExposure, vec3( skyCap ) );
  skyOut = mix( skyOut, vec3( dot( skyOut, vec3( .2126, .7152, .0722 ) ) ), skyGrey );
  vec3 skyDir = normalize( vWorldPosition - cameraPosition );
  float skyUp = clamp( skyDir.y, 0.0, 1.0 );
  vec3 skyCell = floor( skyDir * 420.0 );
  float star = step( .9975, fract( sin( dot( skyCell, vec3( 12.9898, 78.233, 37.719 ) ) ) * 43758.5453 ) ) * smoothstep( .02, .25, skyUp );
  skyOut += skyNight * ( mix( vec3( .018, .03, .06 ), vec3( .004, .007, .02 ), skyUp ) + star * vec3( 1.4 ) );
  gl_FragColor = vec4( skyOut, 1.0 );`;
 material.fragmentShader='uniform float skyExposure;\nuniform float skyCap;\nuniform float skyGrey;\nuniform float skyNight;\n'+material.fragmentShader.replace(SKY_MARKER,grade);material.needsUpdate=true;return material;}
const SHADOW_MAP={low:1024,balanced:2048,high:4096};
const TONE_MAPPING={aces:'ACESFilmicToneMapping',agx:'AgXToneMapping',neutral:'NeutralToneMapping'};

/**
 * Sky, sun and shadow range for one scene.
 * The scene's first shadow-casting directional light (the "sun" entity) keeps its authored transform so the
 * editor gizmo never moves; its light is carried by an internal sun that follows the camera, which gives sharp
 * shadows across the whole view (shadowDistance) instead of a fixed box around the origin.
 */
export function createAtmosphere(THREE,{renderer,scene,defaultEnvironment}){
 const sky=new Sky();sky.scale.setScalar(1500);sky.visible=false;sky.frustumCulled=false;sky.userData.internal=true;scene.add(sky);addSkyExposure(sky.material);
 const envSky=new Sky();envSky.scale.setScalar(50);const envScene=new THREE.Scene();envScene.add(envSky);addSkyExposure(envSky.material);envSky.material.uniforms.skyCap.value=1.6;/* image-based lighting needs the sky colour, not the sun halo */
 const sun=new THREE.DirectionalLight('#ffffff',0);sun.castShadow=false;sun.userData.internal=true;scene.add(sun,sun.target);
 sun.shadow.bias=-.0004;sun.shadow.normalBias=.04;
 const pmrem=new THREE.PMREMGenerator(renderer);
 const direction=new THREE.Vector3(0,1,0),forward=new THREE.Vector3(),center=new THREE.Vector3(),lightSpace=new THREE.Matrix4(),horizon=new THREE.Color('#bfe3ff');
 let envTarget=null,envKey='',state=null,distance=60,mapSize=0,sunEntity=null,active=false,physical=false;

 function setMapSize(size){if(size===mapSize)return;mapSize=size;sun.shadow.mapSize.set(size,size);sun.shadow.map?.dispose();sun.shadow.map=null;}
 function skyUniforms(material,settings,s){
  const u=material.uniforms,clouds=settings.clouds;
  u.turbidity.value=2+clouds*4;u.skyExposure.value=s.night?.25:.45;u.skyGrey.value=Math.max(0,(clouds-.55)*2);u.skyNight.value=Math.min(1,Math.max(0,(-s.elevation-2)/10));u.rayleigh.value=s.night?.3:(s.elevation<12?2.6:1.4);u.mieCoefficient.value=.003+clouds*.003;u.mieDirectionalG.value=.93;
  u.sunPosition.value.fromArray(s.skyDirection);u.cloudCoverage.value=clouds;u.cloudDensity.value=.25+clouds*.55;u.showSunDisc.value=s.night?0:1;
 }
 function environmentFor(settings,s){
  const key=[settings.timeOfDay.toFixed(2),settings.clouds.toFixed(2)].join();
  if(key===envKey&&envTarget)return envTarget.texture;
  skyUniforms(envSky.material,settings,s);envSky.material.uniforms.showSunDisc.value=0;
  const next=pmrem.fromScene(envScene,0,.1,200);envTarget?.dispose();envTarget=next;envKey=key;return envTarget.texture;
 }

 /** Called on every sync. sunLight is the scene's shadow-casting directional light entity or null. */
 function configure(settings,sunLight){
  renderer.toneMapping=THREE[TONE_MAPPING[settings.toneMapping]||'ACESFilmicToneMapping'];
  distance=settings.shadowDistance;setMapSize(SHADOW_MAP[settings.quality]||2048);
  physical=settings.sky==='physical';state=physical?sunState(settings.timeOfDay):null;
  if(sunEntity&&sunEntity!==sunLight&&sunEntity.userData.baseIntensity!==undefined)sunEntity.intensity=sunEntity.userData.baseIntensity;
  sunEntity=sunLight;
  if(sunLight){if(sunLight.userData.baseIntensity===undefined)sunLight.userData.baseIntensity=sunLight.intensity;sunLight.intensity=0;sunLight.castShadow=false;}
  const base=sunLight?sunLight.userData.baseIntensity:physical?2.4:0;
  if(physical){
   direction.fromArray(state.direction);sun.color.setRGB(...state.color);sun.intensity=base*state.intensity;
   sky.visible=true;skyUniforms(sky.material,settings,state);scene.background=null;
   scene.environment=environmentFor(settings,state);scene.environmentIntensity=settings.ambientIntensity*(state.night?.15:1);
   horizon.setRGB(...state.horizon);
  }else{
   sky.visible=false;scene.environment=defaultEnvironment;scene.environmentIntensity=settings.ambientIntensity;
   if(sunLight){sunLight.updateMatrixWorld();sunLight.target.updateMatrixWorld();direction.setFromMatrixPosition(sunLight.matrixWorld).sub(new THREE.Vector3().setFromMatrixPosition(sunLight.target.matrixWorld));if(direction.lengthSq()<1e-6)direction.set(0,1,0);direction.normalize();sun.color.copy(sunLight.color);}
   sun.intensity=base;horizon.set(settings.background);
  }
  active=sun.intensity>0;sun.visible=active;sun.castShadow=active&&settings.shadows;
 }

 /** Per frame: keep the sun's shadow box centred in front of the camera, snapped to shadow texels so edges do not shimmer. */
 function update(camera,seconds){
  if(sky.visible)sky.material.uniforms.time.value=seconds;
  if(!active)return;
  camera.getWorldDirection(forward);center.copy(camera.position).addScaledVector(forward,distance*.45);
  const cam=sun.shadow.camera,half=distance*.6;
  cam.left=-half;cam.right=half;cam.top=half;cam.bottom=-half;cam.near=.5;cam.far=distance*4+200;
  const texel=(half*2)/mapSize;
  lightSpace.lookAt(new THREE.Vector3(),direction.clone().negate(),new THREE.Vector3(0,1,0));const inverse=lightSpace.clone().invert();
  center.applyMatrix4(inverse);center.x=Math.round(center.x/texel)*texel;center.y=Math.round(center.y/texel)*texel;center.applyMatrix4(lightSpace);
  sun.target.position.copy(center);sun.position.copy(center).addScaledVector(direction,distance*2+100);
  cam.updateProjectionMatrix();sun.target.updateMatrixWorld();sun.updateMatrixWorld();
 }
 function dispose(){envTarget?.dispose();pmrem.dispose();sky.geometry.dispose();sky.material.dispose();envSky.geometry.dispose();envSky.material.dispose();sun.shadow.dispose();sky.removeFromParent();sun.removeFromParent();sun.target.removeFromParent();}
 return {configure,update,dispose,sun,sky,horizon,get physical(){return physical;}};
}
