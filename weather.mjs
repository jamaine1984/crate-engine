import * as THREE from 'three';

// Helper to get scene from engine bridge
function _getScene() {
  return window._engineBridge?.scene || window._scene;
}

// === WATER PRESETS (Gerstner Wave System) ===
const WATER_PRESETS = {
  tropical: {
    color: new THREE.Color(0x0099bb), deepColor: new THREE.Color(0x005577),
    opacity: 0.88, waveA: [1.0, 0.3, 0.10, 9.0], waveB: [0.3, 1.0, 0.07, 6.0], waveC: [0.7, 0.7, 0.04, 13.0],
    foamIntensity: 0.2, specularPower: 90.0, fresnelPower: 2.5
  },
  storm: {
    color: new THREE.Color(0x1a3a4a), deepColor: new THREE.Color(0x0a1a24),
    opacity: 0.92, waveA: [1.0, 0.5, 0.45, 4.0], waveB: [0.7, 1.0, 0.35, 3.0], waveC: [0.5, 0.3, 0.25, 2.5],
    foamIntensity: 0.7, specularPower: 30.0, fresnelPower: 1.5
  },
  hurricane: {
    color: new THREE.Color(0x0d2a3a), deepColor: new THREE.Color(0x051218),
    opacity: 0.95, waveA: [1.0, 0.8, 0.65, 3.0], waveB: [0.8, 1.0, 0.55, 2.5], waveC: [0.6, 0.4, 0.45, 2.0],
    foamIntensity: 0.9, specularPower: 15.0, fresnelPower: 1.2
  },
  lake: {
    color: new THREE.Color(0x2e6e7e), deepColor: new THREE.Color(0x1a4050),
    opacity: 0.82, waveA: [1.0, 0.0, 0.04, 14.0], waveB: [0.0, 1.0, 0.03, 10.0], waveC: [0.5, 0.5, 0.02, 18.0],
    foamIntensity: 0.1, specularPower: 100.0, fresnelPower: 3.0
  },
  ocean: {
    color: new THREE.Color(0x006699), deepColor: new THREE.Color(0x002244),
    opacity: 0.92, waveA: [1.0, 0.2, 0.18, 7.0], waveB: [0.5, 1.0, 0.12, 5.5], waveC: [0.8, 0.4, 0.08, 10.0],
    foamIntensity: 0.3, specularPower: 80.0, fresnelPower: 3.0
  },
  swamp: {
    color: new THREE.Color(0x3a5a1a), deepColor: new THREE.Color(0x1a3008),
    opacity: 0.95, waveA: [1.0, 0.0, 0.015, 20.0], waveB: [0.0, 1.0, 0.01, 15.0], waveC: [0.5, 0.5, 0.005, 25.0],
    foamIntensity: 0.05, specularPower: 20.0, fresnelPower: 1.0
  },
  river: {
    color: new THREE.Color(0x2a7a8a), deepColor: new THREE.Color(0x1a4a5a),
    opacity: 0.8, waveA: [1.0, 0.0, 0.1, 5.0], waveB: [0.8, 0.2, 0.06, 3.0], waveC: [0.5, 0.1, 0.04, 8.0],
    foamIntensity: 0.35, specularPower: 70.0, fresnelPower: 2.0
  },
  arctic: {
    color: new THREE.Color(0x6abed8), deepColor: new THREE.Color(0x2a5a7a),
    opacity: 0.85, waveA: [1.0, 0.3, 0.08, 10.0], waveB: [0.3, 1.0, 0.05, 7.0], waveC: [0.6, 0.6, 0.03, 14.0],
    foamIntensity: 0.25, specularPower: 120.0, fresnelPower: 3.5
  },
  calm: {
    color: new THREE.Color(0x4dd8f0), deepColor: new THREE.Color(0x29a8cc),
    opacity: 0.78, waveA: [1.0, 0.2, 0.012, 20.0], waveB: [0.2, 1.0, 0.008, 15.0], waveC: [0.5, 0.5, 0.004, 25.0],
    foamIntensity: 0.03, specularPower: 140.0, fresnelPower: 2.8
  }
};

function createGerstnerWaterMaterial(preset) {
  const p = WATER_PRESETS[preset] || WATER_PRESETS.ocean;

  return new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      waveA: { value: new THREE.Vector4(p.waveA[0], p.waveA[1], p.waveA[2], p.waveA[3]) },
      waveB: { value: new THREE.Vector4(p.waveB[0], p.waveB[1], p.waveB[2], p.waveB[3]) },
      waveC: { value: new THREE.Vector4(p.waveC[0], p.waveC[1], p.waveC[2], p.waveC[3]) },
      waterColor: { value: p.color },
      deepColor: { value: p.deepColor },
      foamIntensity: { value: p.foamIntensity },
      specularPower: { value: p.specularPower },
      fresnelPower: { value: p.fresnelPower },
      sunDirection: { value: new THREE.Vector3(0.5, 0.8, 0.3).normalize() },
      sunColor: { value: new THREE.Color(0xffeedd) },
      opacity: { value: p.opacity },
      cameraPos: { value: new THREE.Vector3() }
    },
    vertexShader: `
      uniform float time;
      uniform vec4 waveA, waveB, waveC;
      varying vec3 vWorldPos;
      varying vec3 vNormal;
      varying float vHeight;
      varying vec2 vUv;

      vec3 gerstnerWave(vec4 wave, vec3 p, inout vec3 tangent, inout vec3 binormal) {
        float steepness = wave.z;
        float wavelength = wave.w;
        float k = 6.28318 / wavelength;
        float c = sqrt(9.8 / k);
        vec2 d = normalize(wave.xy);
        float f = k * (dot(d, p.xz) - c * time);
        float a = steepness / k;
        tangent += vec3(-d.x * d.x * steepness * sin(f), d.x * steepness * cos(f), -d.x * d.y * steepness * sin(f));
        binormal += vec3(-d.x * d.y * steepness * sin(f), d.y * steepness * cos(f), -d.y * d.y * steepness * sin(f));
        return vec3(d.x * a * cos(f), a * sin(f), d.y * a * cos(f));
      }

      void main() {
        vUv = uv;
        vec3 p = position;
        vec3 tangent = vec3(1.0, 0.0, 0.0);
        vec3 binormal = vec3(0.0, 0.0, 1.0);
        p += gerstnerWave(waveA, position, tangent, binormal);
        p += gerstnerWave(waveB, position, tangent, binormal);
        p += gerstnerWave(waveC, position, tangent, binormal);
        vHeight = p.y;
        vNormal = normalize(cross(binormal, tangent));
        vec4 worldPos = modelMatrix * vec4(p, 1.0);
        vWorldPos = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform vec3 waterColor;
      uniform vec3 deepColor;
      uniform vec3 sunDirection;
      uniform vec3 sunColor;
      uniform float foamIntensity;
      uniform float specularPower;
      uniform float fresnelPower;
      uniform float opacity;
      uniform float time;
      uniform vec3 cameraPos;
      varying vec3 vWorldPos;
      varying vec3 vNormal;
      varying float vHeight;
      varying vec2 vUv;

      // Simple hash for procedural noise
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      void main() {
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(cameraPos - vWorldPos);
        float NdotV = max(dot(normal, viewDir), 0.0);

        // Fresnel — Schlick approximation, edges more reflective
        float fresnel = pow(1.0 - NdotV, fresnelPower);
        fresnel = mix(0.04, 1.0, fresnel); // F0 = 0.04 for water

        // Depth-based color mixing
        float depthFactor = smoothstep(-0.4, 0.4, vHeight);
        vec3 baseColor = mix(deepColor, waterColor, depthFactor);

        // Subsurface scattering — light passing through wave peaks
        float sss = pow(max(dot(viewDir, -sunDirection), 0.0), 4.0) * max(vHeight, 0.0) * 0.8;
        vec3 sssColor = vec3(0.1, 0.7, 0.6) * sss;

        // Procedural foam on wave peaks + noise pattern
        float foamNoise = noise(vWorldPos.xz * 2.0 + time * 0.3) * 0.5 +
                          noise(vWorldPos.xz * 5.0 - time * 0.5) * 0.3;
        float foam = smoothstep(0.08, 0.3, vHeight) * foamIntensity * (0.5 + foamNoise);
        foam += smoothstep(0.25, 0.4, vHeight) * foamIntensity * 0.5; // Extra foam on peaks
        vec3 foamColor = vec3(0.85, 0.9, 0.95);

        // Specular highlight (sun reflection) — dual lobe
        vec3 halfDir = normalize(sunDirection + viewDir);
        float spec1 = pow(max(dot(normal, halfDir), 0.0), specularPower);
        float spec2 = pow(max(dot(normal, halfDir), 0.0), specularPower * 0.25) * 0.15; // Broad lobe
        vec3 specular = sunColor * (spec1 * 0.8 + spec2);

        // Sky reflection (fake environment)
        vec3 reflectDir = reflect(-viewDir, normal);
        float skyGrad = max(reflectDir.y, 0.0);
        vec3 skyReflection = mix(vec3(0.2, 0.4, 0.65), vec3(0.3, 0.55, 0.9), skyGrad);
        // Sun hotspot in reflection
        float sunRefl = pow(max(dot(reflectDir, sunDirection), 0.0), 256.0) * 2.0;
        skyReflection += sunColor * sunRefl;

        // Diffuse lighting
        float diffuse = max(dot(normal, sunDirection), 0.0) * 0.3 + 0.7;

        // Combine: base water + subsurface
        vec3 waterBody = baseColor * diffuse + sssColor;
        waterBody = mix(waterBody, foamColor, clamp(foam, 0.0, 1.0));

        // Blend between water body and sky reflection via fresnel
        vec3 finalColor = mix(waterBody, skyReflection, fresnel * 0.35) + specular;

        // Slight blue tint at distance (very subtle - don't darken the water)
        float dist = length(cameraPos - vWorldPos);
        float fogFactor = 1.0 - exp(-dist * 0.001);
        finalColor = mix(finalColor, vec3(0.35, 0.60, 0.85), fogFactor * 0.08);

        gl_FragColor = vec4(finalColor, opacity + foam * 0.2);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false
  });
}

let currentWaterPreset = 'ocean';

function createWater(size, preset) {
  const s = size || 10;
  const segs = Math.min(Math.max(Math.floor(s * 2), 64), 256);
  const geo = new THREE.PlaneGeometry(s, s, segs, segs);
  const presetName = preset || (s >= 50 ? 'ocean' : 'lake');
  const mat = createGerstnerWaterMaterial(presetName);
  const water = new THREE.Mesh(geo, mat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.3;
  water.receiveShadow = true;
  water.userData.isWater = true;
  water.userData.isGerstnerWater = true;
  water.userData.isAnimatedWater = true;
  water.userData.isSolid = true;
  water.userData.waterPreset = presetName;
  currentWaterPreset = presetName;
  return water;
}

// Weather
function createRain() {
  const count = 10000;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count*3);
  for (let i=0;i<count;i++) { pos[i*3]=(Math.random()-0.5)*150; pos[i*3+1]=Math.random()*28; pos[i*3+2]=(Math.random()-0.5)*150; }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({color:0x99bbff, size:0.06, transparent:true, opacity:0.5}));
}

// === RAIN PUDDLES ===
let _rainPuddles = [];
function createRainPuddles(count = 15) {
  clearRainPuddles();
  const scene = _getScene();
  for (let i = 0; i < count; i++) {
    const geo = new THREE.CircleGeometry(1.5 + Math.random() * 3, 16);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x335577, transparent: true, opacity: 0.4,
      roughness: 0.05, metalness: 0.9, side: THREE.DoubleSide
    });
    const puddle = new THREE.Mesh(geo, mat);
    const px = (Math.random() - 0.5) * 80;
    const pz = (Math.random() - 0.5) * 80;
    const py = (typeof window._getTerrainY === "function") ? window._getTerrainY(px, pz) : 0;
    puddle.position.set(px, py + 0.02, pz);
    puddle.rotation.x = -Math.PI / 2;
    puddle.userData.isPuddle = true;
    if (scene) scene.add(puddle);
    _rainPuddles.push(puddle);
  }
}
function clearRainPuddles() {
  const scene = _getScene();
  for (const p of _rainPuddles) { if (scene) scene.remove(p); p.geometry.dispose(); p.material.dispose(); }
  _rainPuddles = [];
}
function updateRainPuddles(dt) {
  for (const p of _rainPuddles) {
    // Ripple effect - subtle scale pulse
    const t = Date.now() * 0.001 + p.position.x;
    p.material.opacity = 0.3 + Math.sin(t * 2) * 0.1;
  }
}



function createSnow() {
  const count = 6000;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count*3);
  for (let i=0;i<count;i++) { pos[i*3]=(Math.random()-0.5)*150; pos[i*3+1]=Math.random()*24; pos[i*3+2]=(Math.random()-0.5)*150; }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({color:0xffffff, size:0.1, transparent:true, opacity:0.8}));
}

// === LIGHTNING & THUNDER SYSTEM ===
let _lightningLight = null;
let _lightningTimer = 0;
let _lightningFlash = 0;
let _thunderAudio = null;

function triggerLightning() {
  const scene = _getScene();
  if (!_lightningLight) {
    _lightningLight = new THREE.DirectionalLight(0xccccff, 0);
    _lightningLight.position.set(50, 80, 30);
    if (scene) scene.add(_lightningLight);
  }
  _lightningFlash = 1.0;
  _lightningLight.intensity = 8;
  // Thunder sound after delay (sound travels slower than light)
  const thunderDelay = 500 + Math.random() * 2000;
  setTimeout(() => {
    if (_thunderAudio) { _thunderAudio.pause(); _thunderAudio.currentTime = 0; }
    // Simple thunder via oscillator
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(60 + Math.random() * 40, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(20, ctx.currentTime + 1.5);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 2);
    } catch(e) {}
  }, thunderDelay);
}

function updateLightning(dt, weatherSystem) {
  if (_lightningFlash > 0) {
    _lightningFlash -= dt * 4;
    if (_lightningLight) _lightningLight.intensity = _lightningFlash * 8;
    if (_lightningFlash <= 0) { _lightningFlash = 0; if (_lightningLight) _lightningLight.intensity = 0; }
  }
  if (weatherSystem === 'rain' || weatherSystem === 'storm') {
    _lightningTimer -= dt;
    if (_lightningTimer <= 0) {
      _lightningTimer = 4 + Math.random() * 12; // Random interval 4-16 seconds
      if (Math.random() < 0.4) triggerLightning(); // 40% chance each interval
    }
  }
}

function setLightningTimer(val) {
  _lightningTimer = val;
}

function setCurrentWaterPreset(preset) {
  currentWaterPreset = preset;
}


// === PARTICLE EFFECTS SYSTEM ===
var activeParticleEffects = [];

function createFireEffect(x, y, z, scale) {
  const scene = _getScene();
  scale = scale || 1;
  var count = 200;
  var geo = new THREE.BufferGeometry();
  var pos = new Float32Array(count * 3);
  var vel = new Float32Array(count * 3);
  var life = new Float32Array(count);
  for (var i = 0; i < count; i++) {
    pos[i*3] = (Math.random()-0.5) * 0.5 * scale;
    pos[i*3+1] = Math.random() * 2 * scale;
    pos[i*3+2] = (Math.random()-0.5) * 0.5 * scale;
    vel[i*3] = (Math.random()-0.5) * 0.02;
    vel[i*3+1] = 0.02 + Math.random() * 0.04;
    vel[i*3+2] = (Math.random()-0.5) * 0.02;
    life[i] = Math.random();
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  var mat = new THREE.PointsMaterial({
    color: 0xff6600, size: 0.15 * scale, transparent: true, opacity: 0.8,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  var points = new THREE.Points(geo, mat);
  points.position.set(x || 0, y || 0, z || 0);
  points.userData._particleType = 'fire';
  points.userData._vel = vel;
  points.userData._life = life;
  points.userData._scale = scale;
  if (scene) scene.add(points);
  // Add point light for glow
  var light = new THREE.PointLight(0xff4400, 2 * scale, 8 * scale);
  light.position.set(x || 0, (y || 0) + 1, z || 0);
  if (scene) scene.add(light);
  points.userData._light = light;
  activeParticleEffects.push(points);
  return points;
}

function createSmokeEffect(x, y, z, scale) {
  const scene = _getScene();
  scale = scale || 1;
  var count = 100;
  var geo = new THREE.BufferGeometry();
  var pos = new Float32Array(count * 3);
  var vel = new Float32Array(count * 3);
  for (var i = 0; i < count; i++) {
    pos[i*3] = (Math.random()-0.5) * scale;
    pos[i*3+1] = Math.random() * 3 * scale;
    pos[i*3+2] = (Math.random()-0.5) * scale;
    vel[i*3] = (Math.random()-0.5) * 0.01;
    vel[i*3+1] = 0.01 + Math.random() * 0.02;
    vel[i*3+2] = (Math.random()-0.5) * 0.01;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  var mat = new THREE.PointsMaterial({
    color: 0x555555, size: 0.3 * scale, transparent: true, opacity: 0.3,
    depthWrite: false
  });
  var points = new THREE.Points(geo, mat);
  points.position.set(x || 0, y || 0, z || 0);
  points.userData._particleType = 'smoke';
  points.userData._vel = vel;
  if (scene) scene.add(points);
  activeParticleEffects.push(points);
  return points;
}

function createMagicEffect(x, y, z, color) {
  const scene = _getScene();
  color = color || 0x8844ff;
  var count = 300;
  var geo = new THREE.BufferGeometry();
  var pos = new Float32Array(count * 3);
  var angles = new Float32Array(count);
  for (var i = 0; i < count; i++) {
    var angle = Math.random() * Math.PI * 2;
    var radius = 0.5 + Math.random() * 2;
    pos[i*3] = Math.cos(angle) * radius;
    pos[i*3+1] = (Math.random()-0.5) * 3;
    pos[i*3+2] = Math.sin(angle) * radius;
    angles[i] = angle;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  var mat = new THREE.PointsMaterial({
    color: color, size: 0.08, transparent: true, opacity: 0.7,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  var points = new THREE.Points(geo, mat);
  points.position.set(x || 0, y || 1, z || 0);
  points.userData._particleType = 'magic';
  points.userData._angles = angles;
  points.userData._time = 0;
  // Glow light
  var light = new THREE.PointLight(color, 1.5, 6);
  light.position.copy(points.position);
  if (scene) scene.add(light);
  points.userData._light = light;
  if (scene) scene.add(points);
  activeParticleEffects.push(points);
  return points;
}

function createExplosionFX(x, y, z, scale) {
  const scene = _getScene();
  scale = scale || 1;
  var count = 500;
  var geo = new THREE.BufferGeometry();
  var pos = new Float32Array(count * 3);
  var vel = new Float32Array(count * 3);
  for (var i = 0; i < count; i++) {
    pos[i*3] = 0; pos[i*3+1] = 0; pos[i*3+2] = 0;
    var theta = Math.random() * Math.PI * 2;
    var phi = Math.random() * Math.PI;
    var speed = 0.05 + Math.random() * 0.15;
    vel[i*3] = Math.sin(phi) * Math.cos(theta) * speed * scale;
    vel[i*3+1] = Math.cos(phi) * speed * scale + 0.02;
    vel[i*3+2] = Math.sin(phi) * Math.sin(theta) * speed * scale;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  var mat = new THREE.PointsMaterial({
    color: 0xff8800, size: 0.2 * scale, transparent: true, opacity: 1,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  var points = new THREE.Points(geo, mat);
  points.position.set(x || 0, y || 1, z || 0);
  points.userData._particleType = 'explosion';
  points.userData._vel = vel;
  points.userData._life = 1.0;
  // Flash light
  var light = new THREE.PointLight(0xff6600, 5 * scale, 15 * scale);
  light.position.set(x || 0, (y || 1) + 1, z || 0);
  if (scene) scene.add(light);
  points.userData._light = light;
  if (scene) scene.add(points);
  activeParticleEffects.push(points);
  return points;
}

function createSparkles(x, y, z, color) {
  const scene = _getScene();
  color = color || 0xffdd44;
  var count = 150;
  var geo = new THREE.BufferGeometry();
  var pos = new Float32Array(count * 3);
  for (var i = 0; i < count; i++) {
    pos[i*3] = (Math.random()-0.5) * 3;
    pos[i*3+1] = Math.random() * 3;
    pos[i*3+2] = (Math.random()-0.5) * 3;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  var mat = new THREE.PointsMaterial({
    color: color, size: 0.06, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  var points = new THREE.Points(geo, mat);
  points.position.set(x || 0, y || 0, z || 0);
  points.userData._particleType = 'sparkles';
  points.userData._time = 0;
  if (scene) scene.add(points);
  activeParticleEffects.push(points);
  return points;
}

// Update all particle effects each frame
function updateParticleEffects(dt) {
  const scene = _getScene();
  for (var i = activeParticleEffects.length - 1; i >= 0; i--) {
    var fx = activeParticleEffects[i];
    if (!fx.parent) { activeParticleEffects.splice(i, 1); continue; }
    var p = fx.geometry.attributes.position.array;
    var type = fx.userData._particleType;

    if (type === 'fire') {
      var vel = fx.userData._vel;
      var life = fx.userData._life;
      var s = fx.userData._scale;
      for (var j = 0; j < p.length/3; j++) {
        p[j*3] += vel[j*3] + (Math.random()-0.5)*0.01;
        p[j*3+1] += vel[j*3+1];
        p[j*3+2] += vel[j*3+2] + (Math.random()-0.5)*0.01;
        life[j] += 0.02;
        if (life[j] > 1) {
          p[j*3] = (Math.random()-0.5) * 0.5 * s;
          p[j*3+1] = 0;
          p[j*3+2] = (Math.random()-0.5) * 0.5 * s;
          life[j] = 0;
        }
      }
      fx.material.opacity = 0.6 + Math.sin(Date.now()*0.01) * 0.2;
      if (fx.userData._light) fx.userData._light.intensity = 1.5 + Math.sin(Date.now()*0.008) * 0.8;
    }

    if (type === 'smoke') {
      var vel = fx.userData._vel;
      for (var j = 0; j < p.length/3; j++) {
        p[j*3] += vel[j*3] + (Math.random()-0.5)*0.005;
        p[j*3+1] += vel[j*3+1];
        p[j*3+2] += vel[j*3+2] + (Math.random()-0.5)*0.005;
        if (p[j*3+1] > 5) {
          p[j*3] = (Math.random()-0.5);
          p[j*3+1] = 0;
          p[j*3+2] = (Math.random()-0.5);
        }
      }
    }

    if (type === 'magic') {
      fx.userData._time += 0.02;
      var t = fx.userData._time;
      var angles = fx.userData._angles;
      for (var j = 0; j < p.length/3; j++) {
        var a = angles[j] + t;
        var r = 0.5 + Math.sin(t + j * 0.1) * 1.5;
        p[j*3] = Math.cos(a) * r;
        p[j*3+1] = Math.sin(t * 2 + j * 0.05) * 1.5;
        p[j*3+2] = Math.sin(a) * r;
      }
      if (fx.userData._light) fx.userData._light.intensity = 1 + Math.sin(t * 3) * 0.5;
    }

    if (type === 'explosion') {
      var vel = fx.userData._vel;
      fx.userData._life -= 0.015;
      if (fx.userData._life <= 0) {
        if (scene) scene.remove(fx);
        if (fx.userData._light && scene) scene.remove(fx.userData._light);
        activeParticleEffects.splice(i, 1);
        continue;
      }
      for (var j = 0; j < p.length/3; j++) {
        p[j*3] += vel[j*3];
        p[j*3+1] += vel[j*3+1];
        p[j*3+2] += vel[j*3+2];
        vel[j*3+1] -= 0.001; // gravity
      }
      fx.material.opacity = fx.userData._life;
      fx.material.color.setHSL(0.05 + (1-fx.userData._life)*0.05, 1, 0.5);
      if (fx.userData._light) fx.userData._light.intensity = fx.userData._life * 5;
    }

    if (type === 'sparkles') {
      fx.userData._time += 0.03;
      var t = fx.userData._time;
      for (var j = 0; j < p.length/3; j++) {
        p[j*3+1] += Math.sin(t + j * 0.2) * 0.005;
      }
      fx.material.opacity = 0.5 + Math.sin(t * 2) * 0.4;
    }

    fx.geometry.attributes.position.needsUpdate = true;
  }
}

export {
  WATER_PRESETS,
  createGerstnerWaterMaterial,
  currentWaterPreset,
  createWater,
  createRain,
  createRainPuddles,
  clearRainPuddles,
  updateRainPuddles,
  createSnow,
  triggerLightning,
  updateLightning,
  setLightningTimer,
  setCurrentWaterPreset,
  activeParticleEffects,
  createFireEffect,
  createSmokeEffect,
  createMagicEffect,
  createExplosionFX,
  createSparkles,
  updateParticleEffects
};
