window._userScripts = window._userScripts || [];
const sceneHistory = [];


// === AAA Water & Sky (v61) ===
let Sky, skyMesh, sun;
async function loadWaterSky() {
  try {
    const SkyMod = await import('three/addons/objects/Sky.js');
    Sky = SkyMod.Sky;
    console.log('[CRATE] Sky module loaded');
  } catch(e) { console.warn('[CRATE] Water/Sky load failed:', e); }
}
loadWaterSky();


// === Proper Real-World Scales (v61) ===
const REAL_WORLD_SCALES = {
  // Vehicles
  car: 4.5, truck: 7, bus: 12, motorcycle: 2.2, bicycle: 1.8, boat: 6, ship: 20, helicopter: 10, airplane: 15, tank: 7,
  // Buildings  
  house: 8, castle: 25, tower: 18, tavern: 8, church: 15, shop: 6, barn: 10, warehouse: 12, skyscraper: 40,
  // Nature
  tree: 6, palm: 8, bush: 1.2, rock: 1.5, boulder: 3, flower: 0.4, mushroom: 0.3, log: 2,
  // Characters
  character: 1.8, npc: 1.8, soldier: 1.8, knight: 1.9, zombie: 1.8, skeleton: 1.7, guard: 1.85,
  // Props
  barrel: 0.9, crate: 0.8, chest: 0.6, table: 0.8, chair: 0.9, bench: 1.5, lamp: 2.5, torch: 1.2,
  campfire: 0.6, tent: 2.5, fence: 1.2, gate: 3, bridge: 8, well: 1.5, fountain: 2,
  // Weapons
  sword: 1.0, axe: 0.9, shield: 0.7, bow: 1.1, staff: 1.6, gun: 0.8, rifle: 1.1,
  // Furniture
  bed: 2.0, sofa: 2.2, desk: 1.2, bookshelf: 2.0, cabinet: 1.8, oven: 0.9, fridge: 1.8,
};

function getProperScale(name) {
  const lower = name.toLowerCase();
  for (const [key, size] of Object.entries(REAL_WORLD_SCALES)) {
    if (lower.includes(key)) return size;
  }
  return 2.0; // default
}
function createAAASky() {
  if (!Sky || !scene) return;
  if (skyMesh) scene.remove(skyMesh);
  skyMesh = new Sky();
  skyMesh.scale.setScalar(10000);
  // Don't add skyMesh to scene — HDRI background (clouds) looks way better
  // skyMesh is only used to generate envMap for PBR reflections
  sun = new THREE.Vector3();
  const uniforms = skyMesh.material.uniforms;
  uniforms['turbidity'].value = 4;
  uniforms['rayleigh'].value = 2;
  uniforms['mieCoefficient'].value = 0.005;
  uniforms['mieDirectionalG'].value = 0.8;
  // Higher sun = brighter, more daytime feel
  const phi = THREE.MathUtils.degToRad(90 - 35);
  const theta = THREE.MathUtils.degToRad(180);
  sun.setFromSphericalCoords(1, phi, theta);
  uniforms['sunPosition'].value.copy(sun);
  // Generate envMap from sky shader (for reflections only, NOT background)
  if (renderer) {
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();
    // Temporarily add sky to a separate scene for envMap generation
    const envScene = new THREE.Scene();
    envScene.add(skyMesh.clone());
    const rt = pmremGenerator.fromScene(envScene);
    // Only set environment (reflections), NOT background — keep HDRI clouds
    if (!scene.background) {
      // Only set sky as background if no HDRI loaded yet
      scene.environment = rt.texture;
    }
    pmremGenerator.dispose();
  }
  console.log('[CRATE] AAA Sky envMap created (HDRI background preserved)');
}

function setSkyTime(elevation, azimuth) {
  if (!skyMesh || !sun) return;
  const phi = THREE.MathUtils.degToRad(90 - elevation);
  const theta = THREE.MathUtils.degToRad(azimuth);
  sun.setFromSphericalCoords(1, phi, theta);
  skyMesh.material.uniforms['sunPosition'].value.copy(sun);
}

// createAAAWater removed — all water uses Gerstner shader now

// === Vehicle Physics v2 (v61) ===
let vehiclePhysics = null;
function createVehiclePhysics(vehicleMesh) {
  const vp = {
    mesh: vehicleMesh,
    speed: 0,
    maxSpeed: 80,
    acceleration: 35,
    braking: 50,
    friction: 0.97,
    steerAngle: 0,
    maxSteer: 0.04,
    steerSpeed: 0.003,
    steerReturn: 0.92,
    direction: new THREE.Vector3(0, 0, -1),
    rpm: 0,
  };
  return vp;
}

function updateVehiclePhysics(vp, dt, keys) {
  if (!vp || !vp.mesh) return;
  // Acceleration / Braking
  if (keys.w || keys.ArrowUp) vp.speed += vp.acceleration * dt;
  if (keys.s || keys.ArrowDown) vp.speed -= vp.braking * dt;
  vp.speed *= vp.friction;
  vp.speed = THREE.MathUtils.clamp(vp.speed, -20, vp.maxSpeed);
  // Steering
  if (keys.a || keys.ArrowLeft) vp.steerAngle -= vp.steerSpeed;
  if (keys.d || keys.ArrowRight) vp.steerAngle += vp.steerSpeed;
  vp.steerAngle *= vp.steerReturn;
  vp.steerAngle = THREE.MathUtils.clamp(vp.steerAngle, -vp.maxSteer, vp.maxSteer);
  // Apply rotation
  if (Math.abs(vp.speed) > 0.5) {
    vp.mesh.rotation.y -= vp.steerAngle * (vp.speed > 0 ? 1 : -1);
  }
  // Move
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(vp.mesh.quaternion);
  vp.mesh.position.addScaledVector(forward, vp.speed * dt);
  // RPM for HUD
  vp.rpm = Math.abs(vp.speed / vp.maxSpeed) * 7000;
  // Keep on ground
  vp.mesh.position.y = Math.max(vp.mesh.position.y, 0.5);
}

// === Shooter System (v61) ===
let shooterMode = false;
let playerHP = 100;
let ammo = 30;
let maxAmmo = 30;
const bullets = [];
const enemies = [];

function createBullet(origin, direction) {
  const geo = new THREE.SphereGeometry(0.08, 4, 4);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
  const bullet = new THREE.Mesh(geo, mat);
  bullet.position.copy(origin);
  bullet.userData.velocity = direction.clone().multiplyScalar(80);
  bullet.userData.life = 2.0;
  scene.add(bullet);
  bullets.push(bullet);
  
  // Muzzle flash
  const flashGeo = new THREE.SphereGeometry(0.3, 6, 6);
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.9 });
  const flash = new THREE.Mesh(flashGeo, flashMat);
  flash.position.copy(origin);
  scene.add(flash);
  // Point light for muzzle
  const flashLight = new THREE.PointLight(0xff8800, 3, 10);
  flashLight.position.copy(origin);
  scene.add(flashLight);
  setTimeout(() => { scene.remove(flash); scene.remove(flashLight); flash.geometry.dispose(); flash.material.dispose(); }, 60);
  
  // Camera recoil kick
  if (camera) {
    const recoil = 0.02;
    camera.rotation.x -= recoil;
    setTimeout(() => { camera.rotation.x += recoil * 0.7; }, 50);
  }
  
  return bullet;
}

function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.position.addScaledVector(b.userData.velocity, dt);
    b.userData.life -= dt;
    if (b.userData.life <= 0) {
      scene.remove(b);
      bullets.splice(i, 1);
      continue;
    }
    // Hit detection against enemies
    for (let j = enemies.length - 1; j >= 0; j--) {
      const e = enemies[j];
      if (b.position.distanceTo(e.position) < 1.5) {
        e.userData.hp = (e.userData.hp || 50) - 25;
        // Damage flash
        e.traverse(c => { if (c.isMesh) { c._origColor = c._origColor || c.material.color.getHex(); c.material.color.setHex(0xff0000); setTimeout(() => { if (c.material) c.material.color.setHex(c._origColor || 0xffffff); }, 100); }});
        // Floating damage number
        showDamageNumber(b.position, 25);
        scene.remove(b);
        bullets.splice(i, 1);
        if (e.userData.hp <= 0) {
          scene.remove(e);
          enemies.splice(j, 1);
          if (typeof showToast === 'function') showToast('💀 Enemy eliminated!');
        }
        break;
      }
    }
  }
}

function showDamageNumber(pos, damage) { showDamageNumberV2(pos, damage); }
function createShooterHUD() {
  let hud = document.getElementById('shooter-hud');
  if (hud) return;
  hud = document.createElement('div');
  hud.id = 'shooter-hud';
  hud.style.cssText = 'position:fixed;bottom:20px;left:20px;z-index:10000;font-family:monospace;color:#fff;text-shadow:0 0 5px rgba(0,0,0,0.8);pointer-events:none;';
  hud.innerHTML = '<div id="sh-hp" style="font-size:20px;margin-bottom:4px">❤️ 100</div><div id="sh-ammo" style="font-size:16px">🔫 30/30</div>';
  document.body.appendChild(hud);
  // Crosshair
  let ch = document.getElementById('crosshair');
  if (!ch) {
    ch = document.createElement('div');
    ch.id = 'crosshair';
    ch.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:9999;pointer-events:none;width:24px;height:24px;display:none';
    ch.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24"><circle cx="12" cy="12" r="2" fill="none" stroke="white" stroke-width="1.5" opacity="0.9"/><line x1="12" y1="2" x2="12" y2="8" stroke="white" stroke-width="1.5" opacity="0.7"/><line x1="12" y1="16" x2="12" y2="22" stroke="white" stroke-width="1.5" opacity="0.7"/><line x1="2" y1="12" x2="8" y2="12" stroke="white" stroke-width="1.5" opacity="0.7"/><line x1="16" y1="12" x2="22" y2="12" stroke="white" stroke-width="1.5" opacity="0.7"/></svg>';
    document.body.appendChild(ch);
  }
}

function updateShooterHUD() {
  const hp = document.getElementById('sh-hp');
  const am = document.getElementById('sh-ammo');
  if (hp) hp.textContent = '❤️ ' + playerHP;
  if (am) am.textContent = '🔫 ' + ammo + '/' + maxAmmo;
}

// === Speed HUD for vehicles ===
function createSpeedHUD() {
  hud = document.getElementById('speed-hud');
  if (hud) return;
  hud = document.createElement('div');
  hud.id = 'speed-hud';
  hud.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:10000;font-family:monospace;color:#0f0;text-shadow:0 0 5px rgba(0,255,0,0.5);pointer-events:none;background:rgba(0,0,0,0.5);padding:12px 16px;border-radius:8px;border:1px solid #0f03;';
  hud.innerHTML = '<div id="sp-speed" style="font-size:28px;font-weight:bold">0 km/h</div><div id="sp-rpm" style="font-size:14px;color:#0a0">0 RPM</div>';
  document.body.appendChild(hud);
}

function updateSpeedHUD(speed, rpm) {
  const sp = document.getElementById('sp-speed');
  const rp = document.getElementById('sp-rpm');
  if (sp) sp.textContent = Math.abs(Math.round(speed * 3.6)) + ' km/h';
  if (rp) rp.textContent = Math.round(rpm) + ' RPM';
}
import * as THREE from 'three';
console.log('THREE imported', typeof THREE); window.THREE = THREE;
window._userScripts = window._userScripts || [];
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import auth from './auth.mjs';
import physics from './physics.mjs';
import { showCodeEditor, createSandboxAPI } from './code-editor.mjs';
import { WATER_PRESETS, createGerstnerWaterMaterial, currentWaterPreset, createWater, createRain, createRainPuddles, clearRainPuddles, updateRainPuddles, createSnow, triggerLightning, updateLightning, setLightningTimer, setCurrentWaterPreset, activeParticleEffects, createFireEffect, createSmokeEffect, createMagicEffect, createExplosionFX, createSparkles, updateParticleEffects } from './weather.mjs';
import { GLB_MODELS, MODEL_SCALE_OVERRIDES, searchModels, loadModelCatalog } from './model-registry.mjs';
window.MODEL_SCALE_OVERRIDES = MODEL_SCALE_OVERRIDES;
window.GLB_MODELS = GLB_MODELS;
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { setBuildingsScene, createWallWithDoor, createSolidWall, createInteriorHouse, KENNEY_CITY_BUILDINGS, KENNEY_VEHICLES, KENNEY_ROAD_PIECES, KENNEY_FANTASY_PROPS, KENNEY_GRAVEYARD_PROPS, loadKenneyModel, randomKenneyBuilding, randomKenneyVehicle, createSkyscraper, createCommercialBuilding, createPitchedRoofHouse, createMansion, createDuplex, createRanchHouse, createParkingLot, createGasStation, createBridge, createSupermarket, createApartmentBuilding, createBusStop, createDumpster, createTrashCan, createSwimmingPool, createStopSign, createTrafficLight, createRoadSegment, createIntersection, createGlassOfficeBuilding, createStadium, createFence, createPark, createSidewalk, createStreetLamp, createBench, createModernHouse, createInteriorShop, createInteriorTavern, createCastle, createRoad, createAvatar, createSword } from './buildings.mjs';
import { buildGerstnerLake, buildMineInterior, populateMineAssets, loadGroupedAsset, listGroupPieces, buildPackShowcase, loadUEBuilding, buildCityWorld3, applyTemplatePreset, _stopCityVehicles, _startCityVehicles, setCityBuilderScene, setCityBuilderObjects, setCityBuilderRenderer, setCityBuilderCamera, setCityBuilderControls, setCityBuilderBloomPass, setCityBuilderShowToast, setCityBuilderLoadGLBModel, setCityBuilderParseAndExecute, setCityBuilderRGBELoader } from './city-builder.mjs?v=4';

// ═══ POST-PROCESSING — Lazy loaded to prevent boot crashes ═══
let EffectComposer, RenderPass, UnrealBloomPass, SMAAPass, ShaderPass, OutputPass, SSAOPass, RGBELoader, BokehPass;
let _ppModulesLoaded = false;

async function loadPostProcessingModules() {
  try {
    const [ec, rp, ub, sm, sp, op, ss, rg, bk] = await Promise.all([
      import('three/addons/postprocessing/EffectComposer.js'),
      import('three/addons/postprocessing/RenderPass.js'),
      import('three/addons/postprocessing/UnrealBloomPass.js'),
      import('three/addons/postprocessing/SMAAPass.js'),
      import('three/addons/postprocessing/ShaderPass.js'),
      import('three/addons/postprocessing/OutputPass.js'),
      import('three/addons/postprocessing/SSAOPass.js').catch(() => null),
      import('three/addons/loaders/RGBELoader.js'),
      import('three/addons/postprocessing/BokehPass.js').catch(() => null),
    ]);
    EffectComposer = ec.EffectComposer;
    RenderPass = rp.RenderPass;
    UnrealBloomPass = ub.UnrealBloomPass;
    SMAAPass = sm.SMAAPass;
    ShaderPass = sp.ShaderPass;
    OutputPass = op.OutputPass;
    SSAOPass = ss?.SSAOPass || null;
    RGBELoader = rg.RGBELoader;
    BokehPass = bk?.BokehPass || null;
    _ppModulesLoaded = true;
    console.log('[PostFX] All post-processing modules loaded');
    return true;
  } catch(e) {
    console.warn('[PostFX] Failed to load post-processing:', e.message);
    _ppModulesLoaded = false;
    return false;
  }
}
const gltfLoader = new GLTFLoader();
window._gltfLoader = gltfLoader;
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/');
gltfLoader.setDRACOLoader(dracoLoader);
import { updateBehaviors, parseIntent, executeIntent } from './godmode.mjs';
import { SFX, init as initSound, updateMusic, updateAmbient, updateFootsteps, setMusicMood, biomeToMood, biomeToAmbient } from './sound.mjs';
import './savesystem.mjs';
import './mobile.mjs';
import { CharacterController, NPCController, TownBuilder, LevelSystem, CraftingSystem, QuestSystem, DialogueSystem, createMinimap, createGameHUD, updateGameHUD, WEAPON_DATABASE, createWeaponMesh, GamepadManager, MobileControls } from './character.mjs?v=610'
import { collisionWorld } from './collision.mjs?v=5';
// Animation system
const animationMixers = [];
const clock = new THREE.Clock();


// ═══ MULTIPLAYER LOBBY UI ═══

// === MULTIPLAYER CLIENT ===
class MultiplayerClient {
  constructor() {
    this.ws = null;
    this.playerId = null;
    this.room = null;
    this.peers = new Map(); // id → { model, name, animation, mixer }
    this.connected = false;
    this._sendInterval = null;
  }

  connect(server, room, name) {
    if (this.ws) this.disconnect();
    server = server || localStorage.getItem('mp_server') || 'wss://crate-engine-mp.fly.dev';
    room = room || 'default';
    name = name || localStorage.getItem('mp_name') || 'Player_' + Math.floor(Math.random() * 9999);
    
    try {
      this.ws = new WebSocket(server);
    } catch(e) {
      showToast('❌ Failed to connect: ' + e.message);
      return;
    }
    
    this.ws.onopen = () => {
      this.connected = true;
      this.ws.send(JSON.stringify({ type: 'join', room, name, character: characterController?.characterType || 'knight' }));
      showToast('🌐 Connecting to ' + room + '...');
      
      // Send position updates at 15Hz
      this._sendInterval = setInterval(() => {
        if (!characterController || !this.connected) return;
        const pos = characterController.position;
        this.ws.send(JSON.stringify({
          type: 'move',
          position: { x: +pos.x.toFixed(2), y: +pos.y.toFixed(2), z: +pos.z.toFixed(2) },
          rotation: +(characterController.model?.rotation.y || 0).toFixed(3),
          animation: characterController.stateMachine?.state || 'idle',
        }));
      }, 66);
    };
    
    this.ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        this._handleMessage(msg);
      } catch(err) {}
    };
    
    this.ws.onclose = () => {
      this.connected = false;
      if (this._sendInterval) clearInterval(this._sendInterval);
      this._removePeers();
      showToast('🌐 Disconnected from multiplayer');
    };
    
    this.ws.onerror = () => {
      showToast('❌ Multiplayer connection error');
    };
  }

  disconnect() {
    if (this.ws) { this.ws.close(); this.ws = null; }
    if (this._sendInterval) { clearInterval(this._sendInterval); this._sendInterval = null; }
    this.connected = false;
    this._removePeers();
  }

  chat(message) {
    if (this.ws && this.connected) {
      this.ws.send(JSON.stringify({ type: 'chat', message }));
    }
  }

  _handleMessage(msg) {
    switch (msg.type) {
      case 'joined':
        this.playerId = msg.playerId;
        this.room = msg.room;
        showToast('🌐 Joined room: ' + (msg.roomName || msg.room) + ' (Player #' + msg.playerId + ')');
        // Spawn existing players
        if (msg.players) msg.players.forEach(p => this._spawnPeer(p));
        break;
        
      case 'player_joined':
        this._spawnPeer(msg.player);
        showToast('👤 ' + msg.player.name + ' joined');
        break;
        
      case 'player_left':
        this._removePeer(msg.id);
        showToast('👤 ' + (msg.name || 'Player') + ' left');
        break;
        
      case 'player_moved':
        this._updatePeer(msg.id, msg.position, msg.rotation, msg.animation);
        break;
        
      case 'chat':
        this._showChat(msg.name, msg.message);
        break;
        
      case 'scene_command':
        // Another player ran a command — execute it locally
        if (typeof parseAndExecute === 'function') parseAndExecute(msg.command);
        break;
        
      case 'player_attack':
        // Show attack animation on peer
        const peer = this.peers.get(msg.id);
        if (peer && peer.mixer) {
          // trigger attack anim
        }
        break;
        
      case 'pong':
        const ping = Date.now() - (msg.time || 0);
        if (window._hudUpdate) window._hudUpdate.interact('Ping: ' + ping + 'ms');
        break;
    }
  }

  _spawnPeer(data) {
    if (this.peers.has(data.id)) return;
    const charType = data.character || 'knight';
    const url = '/models/character_' + charType + '.glb';
    gltfLoader.load(url, (gltf) => {
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      model.scale.setScalar(1.8 / Math.max(size.y, 0.01));
      model.position.set(data.position?.x || 0, data.position?.y || 0, data.position?.z || 0);
      model.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
      
      const nameTag = document.createElement('div');
      nameTag.style.cssText = 'position:fixed;color:' + (data.color || '#fff') + ';font-size:11px;font-family:system-ui;pointer-events:none;z-index:9990;text-shadow:0 1px 3px rgba(0,0,0,0.8);font-weight:600;';
      nameTag.textContent = data.name || 'Player';
      document.body.appendChild(nameTag);
      
      let mixer = null;
      if (gltf.animations?.length) {
        mixer = new THREE.AnimationMixer(model);
        const clips = {};
        gltf.animations.forEach(clip => { clips[clip.name.replace('HumanArmature|', '').toLowerCase()] = mixer.clipAction(clip); });
        if (clips.idle) clips.idle.play();
        animationMixers.push(mixer);
      }
      
      scene.add(model);
      this.peers.set(data.id, { model, nameTag, mixer, name: data.name, targetPos: new THREE.Vector3(), targetRot: 0, currentAnim: 'idle', clips: {} });
    }, undefined, () => {
      const geo = new THREE.BoxGeometry(0.5, 1.8, 0.5);
      const mat = new THREE.MeshStandardMaterial({ color: data.color || '#ff6b35' });
      const model = new THREE.Mesh(geo, mat);
      model.position.set(data.position?.x || 0, 0.9, data.position?.z || 0);
      scene.add(model);
      this.peers.set(data.id, { model, targetPos: new THREE.Vector3(), targetRot: 0 });
    });
  }

  _removePeer(id) {
    const peer = this.peers.get(id);
    if (!peer) return;
    if (peer.model) scene.remove(peer.model);
    if (peer.nameTag) peer.nameTag.remove();
    this.peers.delete(id);
  }

  _removePeers() {
    for (const [id] of this.peers) this._removePeer(id);
  }

  _showChat(name, message) {
    let chatEl = document.getElementById('mp-chat-log');
    if (!chatEl) {
      chatEl = document.createElement('div');
      chatEl.id = 'mp-chat-log';
      chatEl.style.cssText = 'position:fixed;bottom:60px;left:20px;max-width:350px;max-height:200px;overflow-y:auto;z-index:9999;pointer-events:none;font-family:system-ui;';
      document.body.appendChild(chatEl);
    }
    const line = document.createElement('div');
    line.style.cssText = 'color:rgba(255,255,255,0.8);font-size:12px;padding:2px 8px;background:rgba(0,0,0,0.5);border-radius:4px;margin-bottom:2px;animation:hud-fade-out 1s ease-in 10s forwards;';
    line.innerHTML = '<span style="color:#f59e0b;font-weight:600;">' + name + ':</span> ' + message;
    chatEl.appendChild(line);
    chatEl.scrollTop = chatEl.scrollHeight;
    // Clean old messages
    while (chatEl.children.length > 20) chatEl.removeChild(chatEl.firstChild);
  }

  // Call each frame to interpolate peer positions
  update(dt) {
    for (const [id, peer] of this.peers) {
      if (!peer.model) continue;
      // Lerp position
      peer.model.position.lerp(peer.targetPos, 0.15);
      // Lerp rotation
      const diff = peer.targetRot - peer.model.rotation.y;
      peer.model.rotation.y += diff * 0.15;
      
      // Update name tag (world to screen)
      if (peer.nameTag && camera) {
        const worldPos = peer.model.position.clone();
        worldPos.y += 2.2;
        worldPos.project(camera);
        if (worldPos.z < 1) {
          peer.nameTag.style.left = ((worldPos.x * 0.5 + 0.5) * window.innerWidth) + 'px';
          peer.nameTag.style.top = ((-worldPos.y * 0.5 + 0.5) * window.innerHeight) + 'px';
          peer.nameTag.style.display = 'block';
        } else {
          peer.nameTag.style.display = 'none';
        }
      }
    }
  }
}
window._mp = new MultiplayerClient();

function showMultiplayerLobby() {
  let existing = document.getElementById('mp-lobby-modal');
  if (existing) { existing.remove(); return; }
  
  const modal = document.createElement('div');
  modal.id = 'mp-lobby-modal';
  Object.assign(modal.style, {
    position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', zIndex:'500',
    background:'#0d0d0d', border:'1px solid #333', borderRadius:'16px', padding:'28px',
    width:'500px', maxHeight:'80vh', overflowY:'auto', color:'#eee',
    fontFamily:"'Inter',system-ui,sans-serif", boxShadow:'0 20px 60px rgba(0,0,0,0.8)',
  });
  
  modal.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <h2 style="margin:0;font-size:1.2rem">🌐 Multiplayer</h2>
      <button onclick="this.closest('#mp-lobby-modal').remove()" style="background:none;border:none;color:#666;font-size:1.5rem;cursor:pointer">✕</button>
    </div>
    
    <div style="display:flex;gap:8px;margin-bottom:16px">
      <input id="mp-name" value="${localStorage.getItem('mp_name')||'Player'}" placeholder="Your name" style="flex:1;padding:10px;background:#111;border:1px solid #333;border-radius:8px;color:#fff;font-size:0.85rem">
      <input id="mp-server" value="${localStorage.getItem('mp_server')||'wss://crate-engine-mp.fly.dev'}" placeholder="Server URL" style="flex:2;padding:10px;background:#111;border:1px solid #333;border-radius:8px;color:#fff;font-size:0.85rem">
    </div>
    
    <div style="display:flex;gap:8px;margin-bottom:16px">
      <button id="mp-quick-join" style="flex:1;padding:12px;background:linear-gradient(135deg,#ff6b35,#f7c948);border:none;border-radius:10px;color:#fff;font-weight:700;cursor:pointer;font-size:0.9rem">⚡ Quick Match</button>
      <button id="mp-create" style="flex:1;padding:12px;background:#1a1a2e;border:1px solid #333;border-radius:10px;color:#aaa;cursor:pointer;font-size:0.9rem">🏗️ Create Room</button>
      <button id="mp-refresh" style="padding:12px 16px;background:#111;border:1px solid #333;border-radius:10px;color:#aaa;cursor:pointer;font-size:0.9rem">🔄</button>
    </div>
    
    <div id="mp-rooms" style="min-height:100px">
      <div style="text-align:center;color:#555;padding:20px">Click 🔄 to load rooms or ⚡ Quick Match to jump in</div>
    </div>
    
    <div id="mp-status" style="margin-top:12px;font-size:0.78rem;color:#666"></div>
    
    <div style="margin-top:16px;padding-top:12px;border-top:1px solid #1a1a1a">
      <p style="font-size:0.72rem;color:#555">
        <strong>Self-host:</strong> Run <code style="background:#1a1a2e;padding:2px 6px;border-radius:4px;color:#f7c948">node server/multiplayer.mjs</code> or deploy to Railway/Render/Fly.io<br>
        <strong>Commands:</strong> <code style="background:#1a1a2e;padding:2px 6px;border-radius:4px;color:#f7c948">multiplayer</code> / <code style="background:#1a1a2e;padding:2px 6px;border-radius:4px;color:#f7c948">join [room]</code> / <code style="background:#1a1a2e;padding:2px 6px;border-radius:4px;color:#f7c948">chat [message]</code>
      </p>
    </div>
  `;
  document.body.appendChild(modal);
  
  const statusEl = document.getElementById('mp-status');
  
  document.getElementById('mp-quick-join').onclick = async () => {
    const server = document.getElementById('mp-server').value;
    const name = document.getElementById('mp-name').value;
    localStorage.setItem('mp_server', server); localStorage.setItem('mp_name', name);
    statusEl.innerHTML = '<span style="color:#f7c948">Matchmaking...</span>';
    try {
      const httpUrl = server.replace('ws://', 'http://').replace('wss://', 'https://');
      const resp = await fetch(httpUrl.replace(/:\d+.*/, ':' + new URL(server.replace('ws','http')).port) + '/matchmake', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ scene: null }),
      });
      const data = await resp.json();
      if (data.room) {
        statusEl.innerHTML = '<span style="color:#4ade80">Joining ' + data.room + '...</span>';
        if (window._mp) { window._mp.connect(server, data.room, name); }
        setTimeout(() => modal.remove(), 1000);
      }
    } catch(e) {
      statusEl.innerHTML = '<span style="color:#f87171">Could not reach server. Is it running?</span>';
    }
  };
  
  document.getElementById('mp-create').onclick = () => {
    const server = document.getElementById('mp-server').value;
    const name = document.getElementById('mp-name').value;
    const roomId = 'room_' + Date.now().toString(36);
    localStorage.setItem('mp_server', server); localStorage.setItem('mp_name', name);
    if (window._mp) { window._mp.connect(server, roomId, name); }
    statusEl.innerHTML = '<span style="color:#4ade80">Created room: ' + roomId + '</span>';
    setTimeout(() => modal.remove(), 1500);
  };
  
  document.getElementById('mp-refresh').onclick = async () => {
    const server = document.getElementById('mp-server').value;
    const roomsEl = document.getElementById('mp-rooms');
    roomsEl.innerHTML = '<div style="text-align:center;color:#f7c948;padding:10px">Loading...</div>';
    try {
      const httpUrl = server.replace('ws://', 'http://').replace('wss://', 'https://');
      const port = new URL(server.replace('ws','http')).port || '8860';
      const resp = await fetch(httpUrl.split(':' + port)[0] + ':' + port + '/lobby');
      const data = await resp.json();
      if (data.rooms.length === 0) {
        roomsEl.innerHTML = '<div style="text-align:center;color:#555;padding:20px">No rooms yet — create one!</div>';
      } else {
        roomsEl.innerHTML = data.rooms.map(r => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:#111;border:1px solid #1a1a1a;border-radius:8px;margin-bottom:6px">
            <div>
              <strong style="color:#fff">${r.name}</strong>
              <span style="color:#666;font-size:0.75rem;margin-left:8px">${r.scene || 'custom'}</span>
            </div>
            <div style="display:flex;align-items:center;gap:10px">
              <span style="color:#888;font-size:0.8rem">${r.players}/${r.maxPlayers}</span>
              <button onclick="window._mp&&window._mp.connect('${server}','${r.id}',document.getElementById('mp-name').value);this.closest('#mp-lobby-modal').remove()" style="padding:6px 14px;background:#ff6b35;border:none;border-radius:6px;color:#fff;font-size:0.78rem;cursor:pointer;font-weight:600">Join</button>
            </div>
          </div>
        `).join('');
      }
    } catch(e) {
      roomsEl.innerHTML = '<div style="text-align:center;color:#f87171;padding:20px">Could not reach server</div>';
    }
  };
}
window.showMultiplayerLobby = showMultiplayerLobby;

// ═══ USER AI MODEL CONFIG ═══
const AI_PROVIDERS = {
  'claude': { name: 'Claude (Anthropic)', url: 'https://api.anthropic.com/v1/messages', header: 'x-api-key' },
  'openai': { name: 'OpenAI / GPT', url: 'https://api.openai.com/v1/chat/completions', header: 'Authorization', prefix: 'Bearer ' },
  'gemini': { name: 'Google Gemini', url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent', param: 'key' },
  'groq': { name: 'Groq', url: 'https://api.groq.com/openai/v1/chat/completions', header: 'Authorization', prefix: 'Bearer ' },
  'mistral': { name: 'Mistral AI', url: 'https://api.mistral.ai/v1/chat/completions', header: 'Authorization', prefix: 'Bearer ' },
  'deepseek': { name: 'DeepSeek', url: 'https://api.deepseek.com/v1/chat/completions', header: 'Authorization', prefix: 'Bearer ' },
  'ollama': { name: 'Ollama (Local)', url: 'http://localhost:11434/api/generate', header: null },
};

function getUserAIConfig() {
  try {
    return JSON.parse(localStorage.getItem('crate_ai_config') || 'null') || { provider: null, apiKey: null, model: null };
  } catch { return { provider: null, apiKey: null, model: null }; }
}
function setUserAIConfig(provider, apiKey, model) {
  localStorage.setItem('crate_ai_config', JSON.stringify({ provider, apiKey, model }));
}

// AI Settings Modal
function showAISettingsModal() {
  existing = document.getElementById('ai-settings-modal');
  if (existing) { existing.remove(); return; }
  
  const config = getUserAIConfig();
  const modal = document.createElement('div');
  modal.id = 'ai-settings-modal';
  Object.assign(modal.style, {
    position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', zIndex:'500',
    background:'#0d0d0d', border:'1px solid #333', borderRadius:'16px', padding:'28px',
    width:'420px', maxHeight:'80vh', overflowY:'auto', color:'#eee',
    fontFamily:"'Inter',system-ui,sans-serif", boxShadow:'0 20px 60px rgba(0,0,0,0.8)',
  });
  
  const providers = Object.entries(AI_PROVIDERS).map(([k,v]) => 
    `<option value="${k}" ${config.provider===k?'selected':''}>${v.name}</option>`
  ).join('');
  
  modal.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <h2 style="margin:0;font-size:1.2rem">🤖 AI Model Settings</h2>
      <button onclick="this.closest('#ai-settings-modal').remove()" style="background:none;border:none;color:#666;font-size:1.5rem;cursor:pointer">✕</button>
    </div>
    <p style="color:#888;font-size:0.8rem;margin-bottom:16px">Connect your own AI model for advanced scene generation, code assist, and NPC dialogue.</p>
    
    <label style="font-size:0.75rem;color:#aaa;display:block;margin-bottom:4px">Provider</label>
    <select id="ai-provider" style="width:100%;padding:10px;background:#111;border:1px solid #333;border-radius:8px;color:#fff;margin-bottom:14px;font-size:0.85rem">
      <option value="">None (use built-in commands only)</option>
      ${providers}
    </select>
    
    <label style="font-size:0.75rem;color:#aaa;display:block;margin-bottom:4px">API Key</label>
    <input id="ai-apikey" type="password" value="${config.apiKey||''}" placeholder="sk-..." style="width:100%;padding:10px;background:#111;border:1px solid #333;border-radius:8px;color:#fff;margin-bottom:14px;font-size:0.85rem;box-sizing:border-box">
    
    <label style="font-size:0.75rem;color:#aaa;display:block;margin-bottom:4px">Model (optional)</label>
    <input id="ai-model" value="${config.model||''}" placeholder="e.g. gpt-4o, claude-3-sonnet, gemini-pro" style="width:100%;padding:10px;background:#111;border:1px solid #333;border-radius:8px;color:#fff;margin-bottom:20px;font-size:0.85rem;box-sizing:border-box">
    
    <div style="display:flex;gap:10px">
      <button id="ai-save-btn" style="flex:1;padding:10px;background:linear-gradient(135deg,#ff6b35,#f7c948);border:none;border-radius:10px;color:#fff;font-weight:700;cursor:pointer;font-size:0.9rem">Save</button>
      <button id="ai-test-btn" style="flex:1;padding:10px;background:#1a1a2e;border:1px solid #333;border-radius:10px;color:#aaa;cursor:pointer;font-size:0.9rem">Test Connection</button>
    </div>
    <div id="ai-status" style="margin-top:12px;font-size:0.78rem;color:#666"></div>
  `;
  document.body.appendChild(modal);
  
  document.getElementById('ai-save-btn').onclick = () => {
    const p = document.getElementById('ai-provider').value;
    const k = document.getElementById('ai-apikey').value;
    const m = document.getElementById('ai-model').value;
    setUserAIConfig(p, k, m);
    document.getElementById('ai-status').innerHTML = '<span style="color:#4ade80">✓ Saved!</span>';
    setTimeout(() => modal.remove(), 1000);
  };
  
  document.getElementById('ai-test-btn').onclick = async () => {
    const p = document.getElementById('ai-provider').value;
    const k = document.getElementById('ai-apikey').value;
    const statusEl = document.getElementById('ai-status');
    if (!p || !k) { statusEl.innerHTML = '<span style="color:#f87171">⚠️ Select provider and enter API key</span>'; return; }
    statusEl.innerHTML = '<span style="color:#f7c948">Testing...</span>';
    try {
      const prov = AI_PROVIDERS[p];
      const headers = { 'Content-Type': 'application/json' };
      if (prov.header) headers[prov.header] = (prov.prefix||'') + k;
      const resp = await fetch(prov.url, { method: 'POST', headers, body: '{}' }).catch(() => null);
      if (resp && (resp.status < 500)) {
        statusEl.innerHTML = '<span style="color:#4ade80">✓ Connection OK (status ' + resp.status + ')</span>';
      } else {
        statusEl.innerHTML = '<span style="color:#f87171">⚠️ Could not reach API</span>';
      }
    } catch(e) {
      statusEl.innerHTML = '<span style="color:#f87171">⚠️ Error: ' + e.message + '</span>';
    }
  };
}
window.showAISettingsModal = showAISettingsModal;

// ═══ MESHY API KEY MODAL ═══
function showMeshyKeyModal() {
  if (document.getElementById('meshy-key-modal')) document.getElementById('meshy-key-modal').remove();
  const existingKey = getMeshyApiKey();
  const m = document.createElement('div');
  m.id = 'meshy-key-modal';
  m.innerHTML = `
    <div style="position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:100001;display:flex;align-items:center;justify-content:center;font-family:-apple-system,sans-serif" onclick="if(event.target===this)this.remove()">
      <div style="background:#1a1a2e;border-radius:16px;width:480px;color:#fff;box-shadow:0 25px 60px rgba(0,0,0,0.5);padding:28px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <h2 style="margin:0;font-size:1.3rem">🔑 Connect Meshy AI</h2>
          <button onclick="this.closest('#meshy-key-modal').remove()" style="background:none;border:none;color:#666;font-size:1.5rem;cursor:pointer">✕</button>
        </div>
        <p style="color:#888;font-size:0.85rem;margin-bottom:16px">Generate 3D models from text or images using Meshy AI. Connect your own Meshy account — <a href="https://www.meshy.ai/settings/api" target="_blank" style="color:#6366f1">get an API key here</a>.</p>
        <p style="color:#666;font-size:0.78rem;margin-bottom:12px">Free tier: 200 credits/month. Pro ($16/mo): 1000 credits. Your key stays in your browser (localStorage).</p>
        
        <label style="font-size:0.75rem;color:#aaa;display:block;margin-bottom:4px">Meshy API Key</label>
        <input id="meshy-key-input" type="password" value="${existingKey}" placeholder="msy-..." style="width:100%;padding:12px;background:#0d0d1a;border:1px solid #333;border-radius:8px;color:#fff;font-size:0.9rem;box-sizing:border-box;margin-bottom:16px">
        
        <div style="display:flex;gap:10px">
          <button id="meshy-save-btn" style="flex:1;padding:12px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border:none;border-radius:10px;color:#fff;font-weight:700;cursor:pointer;font-size:0.95rem">Save Key</button>
          <button id="meshy-test-btn" style="flex:1;padding:12px;background:#2a2a4a;border:1px solid #333;border-radius:10px;color:#aaa;cursor:pointer;font-size:0.95rem">Test Connection</button>
        </div>
        <div id="meshy-key-status" style="margin-top:10px;font-size:0.8rem;color:#666;text-align:center"></div>
      </div>
    </div>
  `;
  document.body.appendChild(m);
  
  document.getElementById('meshy-save-btn').onclick = () => {
    const key = document.getElementById('meshy-key-input').value.trim();
    setMeshyApiKey(key);
    document.getElementById('meshy-key-status').innerHTML = '<span style="color:#4ade80">✓ Saved! You can now generate 3D models.</span>';
    setTimeout(() => m.remove(), 1200);
  };
  
  document.getElementById('meshy-test-btn').onclick = async () => {
    const key = document.getElementById('meshy-key-input').value.trim();
    const statusEl = document.getElementById('meshy-key-status');
    if (!key) { statusEl.innerHTML = '<span style="color:#f87171">Enter your Meshy API key (msy-...)</span>'; return; }
    statusEl.innerHTML = '<span style="color:#fbbf24">Testing...</span>';
    try {
      const resp = await fetch(MESHY_API_BASE + '/openapi/v1/image-to-3d?page_size=1', { headers: { 'Authorization': 'Bearer ' + key } });
      if (resp.ok) {
        statusEl.innerHTML = '<span style="color:#4ade80">✓ Connected to Meshy AI!</span>';
      } else {
        const err = await resp.json().catch(()=>({}));
        statusEl.innerHTML = '<span style="color:#f87171">❌ ' + (err.message || 'Auth failed — check your key') + '</span>';
      }
    } catch(e) {
      statusEl.innerHTML = '<span style="color:#f87171">❌ Connection error</span>';
    }
  };
}
window.showMeshyKeyModal = showMeshyKeyModal;

// ═══ GAME MODES SELECTOR ═══
function showGameModesModal() { true }
window.showGameModesModal = showGameModesModal;




// === PLAY MODE (WASD First-Person) ===
let playMode = false;
    if (window._mobileControls) window._mobileControls.hide();

// === CHARACTER SELECT (restored from localStorage) ===
let selectedCharacterType = null;
try { 
  selectedCharacterType = localStorage.getItem('crate_character'); 
  // Reset if invalid/no-anim character was saved
  const _noAnimChars = ['fab_civilian_f'];
  if (!selectedCharacterType || _noAnimChars.includes(selectedCharacterType)) {
    selectedCharacterType = 'adventurer';
    localStorage.setItem('crate_character', 'adventurer');
  }
} catch(e) { selectedCharacterType = 'adventurer'; }

let playAvatar = null;
const playKeys = {};
const playSpeed = 8;
let playYaw = 0;

window.addEventListener('keydown', e => { playKeys[e.key.toLowerCase()] = true; });
window.addEventListener('keyup', e => { playKeys[e.key.toLowerCase()] = false; });


// Get terrain surface Y at world position (x, z)
// Ground an object so its bottom sits on terrain surface
function groundObjectOnTerrain(obj) {
  if (!terrainMesh || !obj) return;
  const box = new THREE.Box3().setFromObject(obj);
  const groundOffset = -box.min.y; // Distance from origin to bottom
  const terrainY = getTerrainY(obj.position.x, obj.position.z);
  const waterY = -0.3;
  
  // Check if object is a water item
  const name = (obj.userData.name || '').toLowerCase();
  const isWaterItem = name.includes('boat') || name.includes('ship') || name.includes('buoy') || name.includes('dock') || name.includes('raft');
  
  if (isWaterItem) {
    // Water items float at water surface
    obj.position.y = waterY + groundOffset;
  } else if (terrainY < waterY && !isWaterItem) {
    // Land object underwater — push to nearest dry land
    let found = false;
    for (let r = 2; r < 60; r += 2) {
      for (let a = 0; a < Math.PI * 2; a += 0.4) {
        const tx = obj.position.x + Math.cos(a) * r;
        const tz = obj.position.z + Math.sin(a) * r;
        const ty = getTerrainY(tx, tz);
        if (ty > waterY + 0.2) {
          obj.position.set(tx, ty + groundOffset, tz);
          found = true;
          break;
        }
      }
      if (found) break;
    }
    if (!found) obj.position.y = terrainY + groundOffset;
  } else {
    // Normal land placement
    const isRock = name.includes('rock') || name.includes('boulder') || name.includes('stone');
    if (isRock) {
      // Rocks sink 25% into terrain
      obj.position.y = terrainY + groundOffset * 0.75;
    } else {
      obj.position.y = terrainY + groundOffset;
    }
  }
  
  obj.userData.groundOffset = groundOffset;
}

function getTerrainY(x, z) {
  if (!terrainMesh) return 0;
  const rc = new THREE.Raycaster(new THREE.Vector3(x, 500, z), new THREE.Vector3(0, -1, 0));
  const hits = rc.intersectObject(terrainMesh);
  return hits.length > 0 ? hits[0].point.y : 0;
}


function _hideEditorUI() {
  const tb = document.getElementById('build-toolbar'); if (tb) tb.style.display = 'none';
  const nav = document.querySelector('nav'); if (nav) nav.style.display = 'none';
  const sb = document.getElementById('scene-buttons'); if (sb) sb.style.display = 'none';
  const insp = document.getElementById('inspector'); if (insp) insp.style.display = 'none';
  const pi = document.getElementById('prompt-input'); if (pi && pi.parentElement) pi.parentElement.style.display = 'none';
}
function _showEditorUI() {
  const tb = document.getElementById('build-toolbar'); if (tb) tb.style.display = 'flex';
  const nav = document.querySelector('nav'); if (nav) nav.style.removeProperty('display');
  const sb = document.getElementById('scene-buttons'); if (sb) sb.style.display = 'flex';
  const insp = document.getElementById('inspector'); if (insp) insp.style.removeProperty('display');
  const pi = document.getElementById('prompt-input'); if (pi && pi.parentElement) pi.parentElement.style.display = 'flex';
}

function enterPlayMode() {
  // Play = camera mode. User spawns NPC separately if they want one.
  _activatePlayMode();
  return '🎮 Play mode — fly camera! Type "spawn soldier" for a character.';
}

function _activatePlayMode() {
  startReplayRecording();
  playMode = true; window._playMode = true;
  _hideEditorUI();
  
  // ALWAYS start in camera mode — user spawns NPC when ready
  if (characterController) characterController._cameraOnlyMode = true;
  
  // Enable smooth orbit controls (like editor but faster)
  try { 
    controls.enabled = true;
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.rotateSpeed = 0.8;
    controls.zoomSpeed = 1.5;
    controls.panSpeed = 1.0;
  } catch(e) {}
  
  // Camera mode — no character spawn needed
  console.log('[Play] Camera mode active');
  var pi = document.getElementById('prompt-input'); if (pi) { pi.blur(); pi.parentElement.style.display = "none"; }
  // HUD elements created by game systems — don't duplicate
  showCrosshair(true);
  
  // Add character selection button (bottom center)
  if (!document.getElementById('char-select-btn')) {
    const btn = document.createElement('div');
    btn.id = 'char-select-btn';
    btn.style.cssText = 'position:fixed;bottom:60px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.6);color:#fff;font-family:monospace;font-size:12px;padding:6px 14px;border-radius:6px;cursor:pointer;z-index:9998;border:1px solid rgba(255,255,255,0.2);';
    btn.textContent = '👤 Change Character';
    btn.onclick = () => {
      const types = characterController ? Object.keys(characterController.characterModels) : [];
      const menu = document.createElement('div');
      menu.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.85);padding:12px;border-radius:8px;z-index:9999;display:flex;gap:8px;flex-wrap:wrap;max-width:400px;';
      types.forEach(t => {
        const b = document.createElement('button');
        b.textContent = t;
        b.style.cssText = 'padding:6px 12px;background:#333;color:#fff;border:1px solid #555;border-radius:4px;cursor:pointer;font-family:monospace;font-size:11px;';
        b.onclick = () => { menu.remove(); if(window._parseAndExecute) window._parseAndExecute('spawn ' + t); };
        menu.appendChild(b);
      });
      const close = document.createElement('button');
      close.textContent = '✕';
      close.style.cssText = 'padding:6px 10px;background:#600;color:#fff;border:1px solid #800;border-radius:4px;cursor:pointer;';
      close.onclick = () => menu.remove();
      menu.appendChild(close);
      document.body.appendChild(menu);
    };
    document.body.appendChild(btn);
  }
  
  // FPS counter for debugging performance
  if (!document.getElementById('fps-counter')) {
    const fpsEl = document.createElement('div');
    fpsEl.id = 'fps-counter';
    fpsEl.style.cssText = 'position:fixed;top:8px;left:8px;color:#0f0;font-family:monospace;font-size:14px;z-index:9999;pointer-events:none;text-shadow:0 0 3px #000;';
    document.body.appendChild(fpsEl);
    let frames = 0, lastTime = performance.now();
    (function updateFPS() {
      requestAnimationFrame(updateFPS);
      frames++;
      const now = performance.now();
      if (now - lastTime >= 1000) {
        fpsEl.textContent = frames + ' FPS';
        fpsEl.style.color = frames >= 30 ? '#0f0' : frames >= 15 ? '#ff0' : '#f00';
        frames = 0;
        lastTime = now;
      }
    })();
  }
  
  // Camera defaults set when user spawns a character
  
  // Camera mode — no pointer lock needed, orbit controls handle it
  
  // Disable post-processing for play mode FPS
  window._composerDisabled = true;
  showToast('🎮 Play mode ON! (fast mode)');
}

function exitPlayMode() {
  stopReplayRecording();
  playMode = false; window._playMode = false;
  window._composerDisabled = false;
  // Clean up play mode HUD elements
  ['fps-counter','char-select-btn','click-to-play','city-minimap','rain-overlay'].forEach(id => {
    const el = document.getElementById(id); if (el) el.remove();
  });
  // Re-enable orbit controls
  try { controls.enabled = true; controls.update(); } catch(e) {}
  // Show editor UI
  _showEditorUI();
  showToast('🎮 Back to editor mode');
  _showEditorUI();
  // Hide v215 HUD elements
  ['compass','crosshair','stamina-bar','interact-prompt','damage-vignette','underwater-fx','speed-lines','kill-feed'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  cancelGrapple();
  if (_photoMode) window._togglePhotoMode();
  try { controls.enabled = true; } catch(e) {}
  // Release pointer lock so editor selection works
  if (document.pointerLockElement) {
    try { document.exitPointerLock(); } catch(e) {}
  }
  var pi = document.getElementById('prompt-input'); if (pi && pi.parentElement) pi.parentElement.style.display = "flex"; return '🎮 Play mode OFF — back to editor';
}

window.exitPlayMode = exitPlayMode;

function updatePlayMode(dt) {
  if (!playMode) return;
  // Don't move camera independently when character controller is active
  if (characterController && characterController.model) return;
  const speed = playSpeed * dt;
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  forward.y = 0; forward.normalize();
  right.y = 0; right.normalize();
  
  if (playKeys['w']) camera.position.addScaledVector(forward, speed);
  if (playKeys['s']) camera.position.addScaledVector(forward, -speed);
  if (playKeys['a']) camera.position.addScaledVector(right, -speed);
  if (playKeys['d']) camera.position.addScaledVector(right, speed);
  if (playKeys[' ']) camera.position.y += speed;
  if (playKeys['shift']) camera.position.y -= speed;
  
  // Mouse look via pointer lock
  if (document.pointerLockElement === canvas) {
    // handled by pointermove
  }
}

// Pointer lock for play mode
let canvasEl = null;
setTimeout(() => {
  canvasEl = document.querySelector('canvas');
  if (canvasEl) {
    canvasEl.addEventListener('mousedown', (e) => {
      if (playMode && e.button === 2 && typeof characterController !== 'undefined' && characterController) {
        characterController.startAim();
        e.preventDefault();
      }
    });
    canvasEl.addEventListener('mouseup', (e) => {
      if (e.button === 2 && typeof characterController !== 'undefined' && characterController) {
        characterController.stopAim();
      }
    });
    canvasEl.addEventListener('contextmenu', (e) => {
      if (playMode) e.preventDefault(); // Prevent right-click menu in play mode
    });
        canvasEl.addEventListener('click', () => { if (playMode) canvasEl.requestPointerLock(); });
    document.addEventListener('pointermove', (e) => {
      // Skip when character controller handles camera
      if (typeof characterController !== 'undefined' && characterController && characterController.model) return;
      if (playMode && document.pointerLockElement === canvasEl) {
        playYaw -= e.movementX * 0.002;
        const pitch = Math.max(-Math.PI/2.2, Math.min(Math.PI/2.2, camera.rotation.x - e.movementY * 0.002));
        camera.rotation.order = 'YXZ';
        camera.rotation.y = playYaw;
        camera.rotation.x = pitch;
      }
    });
  }
}, 1000);

window.addEventListener('keydown', e => {
  if (typeof dialogueSystem !== 'undefined' && e.key === ' ' && dialogueSystem && dialogueSystem.active) { dialogueSystem.advance(); e.preventDefault(); return; }
  if (e.key === '?' || (e.key === '/' && e.shiftKey)) { showCommandPage(); return; }
    if (e.key.toLowerCase() === 'm' && !e.ctrlKey && !e.metaKey && playMode) { var on = window._sound?.toggleMute(); var msg = document.createElement('div'); msg.style.cssText='position:fixed;top:20%;left:50%;transform:translateX(-50%);color:white;font-family:monospace;font-size:24px;z-index:10001;pointer-events:none;transition:opacity 1s'; msg.textContent=on?'🔊 Sound ON':'🔇 Sound OFF'; document.body.appendChild(msg); setTimeout(function(){msg.style.opacity='0'},1000); setTimeout(function(){msg.remove()},2000); }
  if ((e.key === 'Tab' || e.key === 'i') && playMode && typeof characterController !== 'undefined' && characterController && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    characterController.toggleInventoryPanel();
    return;
  }
  if (e.key === 'Escape' && playMode) {
    // Close inventory if open
    const invPanel = document.getElementById('inventory-panel');
    if (invPanel) { invPanel.remove(); return; }
    // Show pause menu instead of immediately exiting
    const existingPause = document.getElementById('pause-menu');
    if (existingPause) {
      existingPause.remove();
      document.body.requestPointerLock();
      return;
    }
    document.exitPointerLock();
    
    const pause = document.createElement('div');
    pause.id = 'pause-menu';
    pause.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:10001;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:monospace;backdrop-filter:blur(8px);';
    
    const btnStyle = 'display:block;width:200px;padding:12px;margin:6px;background:#1a1a1a;color:#e0e0e0;border:1px solid #333;border-radius:8px;font-size:14px;cursor:pointer;font-family:monospace;text-align:center;transition:all 0.2s;';
    const btnHover = 'onmouseover="this.style.background=\'#252525\';this.style.borderColor=\'#ff6b35\'" onmouseout="this.style.background=\'#1a1a1a\';this.style.borderColor=\'#333\'"';
    
    pause.innerHTML = '<div style="font-size:32px;color:#ff6b35;margin-bottom:24px;font-weight:bold;">⏸ PAUSED</div>' +
      '<button ' + btnHover + ' onclick="document.getElementById(\'pause-menu\').remove();document.body.requestPointerLock();" style="' + btnStyle + '">▶ RESUME</button>' +
      '<button ' + btnHover + ' onclick="document.getElementById(\'pause-menu\').remove();showHelp();" style="' + btnStyle + '">📋 COMMANDS</button>' +
      '<button ' + btnHover + ' onclick="document.getElementById(\'pause-menu\').remove();if(window._runCommand)window._runCommand(\'save\');" style="' + btnStyle + '">💾 SAVE GAME</button>' +
      '<button ' + btnHover + ' onclick="document.getElementById(\'pause-menu\').remove();if(window._runCommand)window._runCommand(\'screenshot\');" style="' + btnStyle + '">📸 SCREENSHOT</button>' +
      '<button ' + btnHover + ' onclick="document.getElementById(\'pause-menu\').remove();exitPlayMode();document.exitPointerLock();" style="' + btnStyle + 'border-color:#ff4444;color:#ff6666;">🚪 EXIT TO EDITOR</button>' +
      '<div style="color:#555;font-size:11px;margin-top:16px;">Press ESC to resume</div>';
    
    document.body.appendChild(pause);
  }
});

// Pointer lock change — exit play mode if pointer lock lost
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && playMode) {
    // Don't exit if pause menu is open
    if (document.getElementById('pause-menu')) return;
    // Don't exit immediately — player might be opening pause
    // exitPlayMode();
  }
});

// === SCRIPTING / TRIGGERS ===
const triggers = [];
// Format: { type: 'proximity', target: 'coin', radius: 2, action: 'score', value: 10 }

function addTrigger(type, target, action, value) {
  triggers.push({ type, target: target.toLowerCase(), action, value, fired: false });
  return '✓ Trigger added: when ' + type + ' ' + target + ' → ' + action + ' ' + value;
}

function updateTriggers() {
  if (!playMode) return;
  const playerPos = camera.position;
  triggers.forEach(trig => {
    if (trig.fired && trig.type === 'once') return;
    const matches = objects.filter(o => o.userData.name && o.userData.name.toLowerCase().includes(trig.target));
    matches.forEach(obj => {
      const dist = playerPos.distanceTo(obj.position);
      if (dist < (trig.radius || 2)) {
        executeTriggerAction(trig, obj);
        if (trig.type === 'once') trig.fired = true;
      }
    });
  });
}

let gameScore = 0;
function executeTriggerAction(trig, obj) {
  if (trig.action === 'score') {
    gameScore += (trig.value || 10);
    updateHUD();
    // Remove the object
    scene.remove(obj);
    objects.splice(objects.indexOf(obj), 1);
  } else if (trig.action === 'remove' || trig.action === 'destroy') {
    scene.remove(obj);
    objects.splice(objects.indexOf(obj), 1);
  } else if (trig.action === 'teleport') {
    // Spawn player on terrain surface
  spawnY = 2;
  if (terrainMesh) {
    const rc = new THREE.Raycaster(new THREE.Vector3(0, 200, 0), new THREE.Vector3(0, -1, 0));
    const hits = rc.intersectObject(terrainMesh);
    if (hits.length > 0) spawnY = hits[0].point.y + 2;
  }
  camera.position.set(0, spawnY, 0);
  } else if (trig.action === 'message') {
    showNotification(trig.value || 'Triggered!');
  } else if (trig.action === 'explode') {
    // Particle burst
    const burst = createExplosion(obj.position);
    scene.add(burst);
    scene.remove(obj);
    objects.splice(objects.indexOf(obj), 1);
    setTimeout(() => scene.remove(burst), 2000);
  } else if (trig.action === 'spawn') {
    execSingle('add ' + (trig.value || 'enemy') + ' at ' + obj.position.x + ' 0 ' + obj.position.z);
  } else if (trig.action === 'heal') {
    var char = window._engine?.character;
    if (char) { char.health = Math.min(char.maxHealth, char.health + (trig.value || 50)); }
    showNotification('❤️ +' + (trig.value || 50) + ' HP!');
    if (window._sound) window._sound.SFX.heal();
  } else if (trig.action === 'sound') {
    if (window._sound?.SFX[trig.value]) window._sound.SFX[trig.value]();
  } else if (trig.action === 'exec') {
    execSingle(trig.value || '');
  }
}

function createExplosion(pos) { createExplosionV2(pos); }


// === REPLAY RECORDING SYSTEM (Phase 1 — AI World Model Data Collection) ===
let _replayRecording = false;
let _replayData = null;
let _replayFrameCount = 0;
const REPLAY_SAMPLE_RATE = 5; // Record every 5th frame (~12fps at 60fps)

function startReplayRecording() {
  _replayRecording = true;
  _replayFrameCount = 0;
  _replayData = {
    version: 1,
    startTime: Date.now(),
    scene: getSceneSummary(),
    frames: [],
    buildActions: [],
    events: []
  };
  showNotification('🔴 Recording session...');
  console.log('[Replay] Recording started');
}

function stopReplayRecording() {
  if (!_replayRecording || !_replayData) return null;
  _replayRecording = false;
  _replayData.endTime = Date.now();
  _replayData.duration = _replayData.endTime - _replayData.startTime;
  _replayData.totalFrames = _replayData.frames.length;
  
  // Save to localStorage
  const key = 'replay_' + _replayData.startTime;
  try {
    const json = JSON.stringify(_replayData);
    localStorage.setItem(key, json);
    const sizeMB = (json.length / 1024 / 1024).toFixed(2);
    showNotification('⏹ Session saved (' + _replayData.totalFrames + ' frames, ' + sizeMB + 'MB)');
    console.log('[Replay] Saved:', key, sizeMB + 'MB');
  } catch(e) {
    // localStorage full — offer download
    console.warn('[Replay] Storage full, downloading instead');
    downloadReplayData(_replayData);
  }
  
  const data = _replayData;
  _replayData = null;
  return data;
}

function recordReplayFrame() {
  if (!_replayRecording || !_replayData) return;
  _replayFrameCount++;
  if (_replayFrameCount % REPLAY_SAMPLE_RATE !== 0) return;
  
  const pos = characterController ? characterController.position : camera.position;
  const cam = window._cam || camera;
  
  // Get nearby objects (within 30 units)
  const nearby = [];
  scene.children.forEach(obj => {
    if (!obj.position || obj === cam) return;
    const d = pos.distanceTo(obj.position);
    if (d < 30 && obj.userData && obj.userData.objectType) {
      nearby.push({
        type: obj.userData.objectType,
        name: obj.userData.displayName || obj.name || '',
        dist: Math.round(d * 10) / 10
      });
    }
  });
  
  // Get look direction
  const lookDir = new THREE.Vector3();
  cam.getWorldDirection(lookDir);
  
  const frame = {
    t: Date.now() - _replayData.startTime,
    f: _replayFrameCount,
    p: [Math.round(pos.x*10)/10, Math.round(pos.y*10)/10, Math.round(pos.z*10)/10],
    r: [Math.round(lookDir.x*100)/100, Math.round(lookDir.y*100)/100, Math.round(lookDir.z*100)/100],
    v: characterController ? [
      Math.round(characterController.velocity.x*10)/10,
      Math.round(characterController.velocity.y*10)/10,
      Math.round(characterController.velocity.z*10)/10
    ] : [0,0,0],
    n: nearby.length
  };
  
  // Only include nearby objects every 30th sample to save space
  if (_replayFrameCount % (REPLAY_SAMPLE_RATE * 30) === 0) {
    frame.nearby = nearby.slice(0, 20);
  }
  
  _replayData.frames.push(frame);
}

function recordBuildAction(command, result) {
  if (!_replayRecording || !_replayData) return;
  _replayData.buildActions.push({
    t: Date.now() - _replayData.startTime,
    cmd: command,
    pos: camera.position ? [
      Math.round(camera.position.x),
      Math.round(camera.position.y),
      Math.round(camera.position.z)
    ] : null,
    ok: !!result
  });
}

function recordEvent(eventName, data) {
  if (!_replayRecording || !_replayData) return;
  _replayData.events.push({
    t: Date.now() - _replayData.startTime,
    event: eventName,
    data: data || null
  });
}

function getSceneSummary() {
  const objects = [];
  scene.children.forEach(obj => {
    if (obj.userData && obj.userData.objectType) {
      objects.push({
        type: obj.userData.objectType,
        name: obj.userData.displayName || obj.name || '',
        pos: [Math.round(obj.position.x), Math.round(obj.position.y), Math.round(obj.position.z)]
      });
    }
  });
  return { objectCount: objects.length, objects: objects.slice(0, 200) };
}

function downloadReplayData(data) {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'crate-replay-' + data.startTime + '.json';
  a.click();
  URL.revokeObjectURL(url);
}

function listReplays() {
  const replays = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith('replay_')) {
      try {
        const d = JSON.parse(localStorage.getItem(key));
        replays.push({
          key,
          date: new Date(d.startTime).toLocaleString(),
          duration: Math.round(d.duration / 1000) + 's',
          frames: d.totalFrames,
          builds: d.buildActions ? d.buildActions.length : 0,
          events: d.events ? d.events.length : 0
        });
      } catch(e) {}
    }
  }
  return replays;
}

function exportAllReplays() {
  const replays = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith('replay_')) {
      try { replays.push(JSON.parse(localStorage.getItem(key))); } catch(e) {}
    }
  }
  if (replays.length === 0) { showNotification('No replays saved'); return; }
  const blob = new Blob([JSON.stringify(replays)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'crate-all-replays-' + Date.now() + '.json';
  a.click();
  URL.revokeObjectURL(url);
  showNotification('Exported ' + replays.length + ' replays');
}

// Auto-start recording when entering play mode, stop when exiting
window._replayRecord = recordReplayFrame;
window._replayBuildAction = recordBuildAction;
window._replayEvent = recordEvent;
window._replayStart = startReplayRecording;
window._replayStop = stopReplayRecording;
window._replayList = listReplays;
window._replayExportAll = exportAllReplays;



// === HEALTH & DAMAGE SYSTEM (v218) ===
let _healthRegenDelay = 5000;
let _healthRegenRate = 2;
let _lastDamageTime = 0;
let _playerMaxHP = 100;

function damagePlayer(amount, source) {
  if (!characterController) return;
  _lastDamageTime = performance.now();
  characterController.hp = Math.max(0, (characterController.hp || _playerMaxHP) - amount);
  if (typeof showDamageNumberV2 === 'function') {
    showDamageNumberV2(characterController.position.clone().add(new THREE.Vector3(0, 2, 0)), amount, '#ef4444');
  }
  var vignette = document.getElementById('damage-vignette');
  if (vignette && amount > 10) {
    vignette.style.opacity = String(Math.min(0.6, amount / 50));
    setTimeout(function() { if(vignette) vignette.style.opacity = '0'; }, 300);
  }
  if (characterController.hp <= 0) {
    showNotification('You died! Respawning...');
    setTimeout(function() {
      characterController.hp = _playerMaxHP;
      characterController.position.set(0, 5, 0);
    }, 2000);
  }
}

function updateHealthRegen(dt) {
  if (!characterController || !playMode) return;
  if (characterController.hp === undefined) characterController.hp = _playerMaxHP;
  if (performance.now() - _lastDamageTime > _healthRegenDelay && characterController.hp < _playerMaxHP) {
    characterController.hp = Math.min(_playerMaxHP, characterController.hp + _healthRegenRate * dt);
  }
}
window.damagePlayer = damagePlayer;

// === CAMERA SCROLL ZOOM (v218) ===
document.addEventListener('wheel', function(e) {
  if (!playMode || activeVehicle) return;
  if (window._cameraDistance === undefined) window._cameraDistance = 5;
  window._cameraDistance = Math.max(1.5, Math.min(12, window._cameraDistance + e.deltaY * 0.005));
}, { passive: true });

// === OBJECT COUNTER HUD (v218) ===
function updateObjectCounter() {
  if (!playMode) return;
  var el = document.getElementById('object-counter');
  if (!el) {
    el = document.createElement('div');
    el.id = 'object-counter';
    el.style.cssText = 'position:fixed;bottom:44px;right:8px;color:rgba(255,255,255,0.25);font-family:monospace;font-size:10px;z-index:99990;pointer-events:none;';
    document.body.appendChild(el);
  }
  var count = 0;
  scene.traverse(function(o) { if (o.isMesh) count++; });
  el.textContent = count + ' meshes';
}





// === NPC DIALOG SYSTEM (v218b) ===
let _dialogActive = false;
let _dialogQueue = [];

function showDialog(npcName, lines, onComplete) {
  // lines = ["Hello traveler!", "The town needs your help.", ...]
  _dialogActive = true;
  _dialogQueue = lines.slice();
  var el = document.getElementById('dialog-box');
  if (!el) {
    el = document.createElement('div');
    el.id = 'dialog-box';
    el.style.cssText = 'position:fixed;bottom:120px;left:50%;transform:translateX(-50%);width:500px;max-width:90vw;' +
      'background:rgba(0,0,0,0.85);border:1px solid rgba(255,255,255,0.2);border-radius:12px;padding:16px 20px;' +
      'z-index:9010;font-family:-apple-system,sans-serif;backdrop-filter:blur(8px);cursor:pointer;';
    el.onclick = function() { advanceDialog(npcName, onComplete); };
    document.body.appendChild(el);
  }
  el.style.display = 'block';
  showDialogLine(npcName, _dialogQueue.shift());
  recordEvent('npc_dialog', { npc: npcName, lines: lines.length });
}

function showDialogLine(npcName, text) {
  var el = document.getElementById('dialog-box');
  if (!el) return;
  el.innerHTML = '<div style="color:#f59e0b;font-size:13px;font-weight:600;margin-bottom:6px;">' + npcName + '</div>' +
    '<div style="color:#fff;font-size:14px;line-height:1.5;">' + text + '</div>' +
    '<div style="color:rgba(255,255,255,0.3);font-size:10px;text-align:right;margin-top:8px;">Click to continue ▸</div>';
}

function advanceDialog(npcName, onComplete) {
  if (_dialogQueue.length > 0) {
    showDialogLine(npcName, _dialogQueue.shift());
  } else {
    var el = document.getElementById('dialog-box');
    if (el) el.style.display = 'none';
    _dialogActive = false;
    if (onComplete) onComplete();
  }
}

window.showDialog = showDialog;

// === AUTO-GENERATE QUESTS FOR GAME PRESETS (v218b) ===
function generatePresetQuests(presetName) {
  var quests = {
    zombie: [
      { id: 'z1', title: 'Survive the Night', description: 'Kill zombies to survive', objectives: [{ text: 'Kill zombies', count: 10 }], reward: '+50 XP' },
      { id: 'z2', title: 'Find Shelter', description: 'Enter a building', objectives: [{ text: 'Enter a building', count: 1 }], reward: 'Safe zone unlocked' },
    ],
    rpg: [
      { id: 'r1', title: 'Explore the Land', description: 'Visit different areas', objectives: [{ text: 'Walk 500 meters', count: 1 }], reward: '+100 XP' },
      { id: 'r2', title: 'Gather Resources', description: 'Pick up items', objectives: [{ text: 'Pick up items', count: 5 }], reward: 'Craft unlocked' },
    ],
    survival: [
      { id: 's1', title: 'Basic Needs', description: 'Find food and shelter', objectives: [{ text: 'Find food', count: 3 }, { text: 'Build shelter', count: 1 }], reward: 'Campfire recipe' },
    ],
    fps: [
      { id: 'f1', title: 'Lock and Load', description: 'Arm yourself', objectives: [{ text: 'Pick up a weapon', count: 1 }], reward: 'Ammo cache' },
      { id: 'f2', title: 'Target Practice', description: 'Eliminate targets', objectives: [{ text: 'Hit targets', count: 5 }], reward: '+200 XP' },
    ],
    horror: [
      { id: 'h1', title: 'Investigate', description: 'Search the area', objectives: [{ text: 'Find clues', count: 3 }], reward: 'Flashlight' },
    ],
  };
  var presetQuests = quests[presetName];
  if (presetQuests) presetQuests.forEach(function(q) { addQuest(q); });
}
window.generatePresetQuests = generatePresetQuests;



// === SNAP-TO-GRID BUILDING MODE (v218c) ===
let _snapGrid = false;
let _snapSize = 2;
let _gridHelper = null;

function toggleSnapGrid() {
  _snapGrid = !_snapGrid;
  if (_snapGrid) {
    if (!_gridHelper) {
      _gridHelper = new THREE.GridHelper(200, 200 / _snapSize, 0x444444, 0x222222);
      _gridHelper.position.y = 0.01;
      _gridHelper.material.transparent = true;
      _gridHelper.material.opacity = 0.3;
      scene.add(_gridHelper);
    }
    _gridHelper.visible = true;
    showNotification('📐 Grid snap ON (' + _snapSize + 'm)');
  } else {
    if (_gridHelper) _gridHelper.visible = false;
    showNotification('📐 Grid snap OFF');
  }
}

function snapToGrid(pos) {
  if (!_snapGrid) return pos;
  return new THREE.Vector3(
    Math.round(pos.x / _snapSize) * _snapSize,
    pos.y,
    Math.round(pos.z / _snapSize) * _snapSize
  );
}
window.toggleSnapGrid = toggleSnapGrid;

// === UNDO/REDO SYSTEM (v218c) ===
let _undoStack = [];
let _redoStack = [];
let _maxUndoSteps = 50;

function pushUndo(action) {
  _undoStack.push(action);
  if (_undoStack.length > _maxUndoSteps) _undoStack.shift();
  _redoStack = [];
}

function undo() {
  if (_undoStack.length === 0) { showNotification('Nothing to undo'); return; }
  var action = _undoStack.pop();
  _redoStack.push(action);
  if (action.type === 'add' && action.object) {
    scene.remove(action.object);
    objects = objects.filter(function(o) { return o !== action.object; });
    showNotification('↩ Undo: removed ' + (action.name || 'object'));
  } else if (action.type === 'remove' && action.object) {
    scene.add(action.object);
    objects.push(action.object);
    showNotification('↩ Undo: restored ' + (action.name || 'object'));
  }
}

function redo() {
  if (_redoStack.length === 0) { showNotification('Nothing to redo'); return; }
  var action = _redoStack.pop();
  _undoStack.push(action);
  if (action.type === 'add' && action.object) {
    scene.add(action.object);
    objects.push(action.object);
    showNotification('↪ Redo: added ' + (action.name || 'object'));
  } else if (action.type === 'remove' && action.object) {
    scene.remove(action.object);
    objects = objects.filter(function(o) { return o !== action.object; });
    showNotification('↪ Redo: removed ' + (action.name || 'object'));
  }
}

// Ctrl+Z / Ctrl+Y keyboard shortcuts
document.addEventListener('keydown', function(e) {
  if (playMode) return;
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
});
window.undo = undo;
window.redo = redo;

// === FPS DISPLAY IMPROVEMENT (v218c) ===
let _fpsHistory = [];
function updateFPSDisplay(fps) {
  _fpsHistory.push(fps);
  if (_fpsHistory.length > 60) _fpsHistory.shift();
  var avg = Math.round(_fpsHistory.reduce(function(a, b) { return a + b; }, 0) / _fpsHistory.length);
  var el = document.getElementById('fps-counter');
  if (el) {
    el.textContent = avg + ' FPS';
    el.style.color = avg > 50 ? '#4ade80' : avg > 30 ? '#f59e0b' : '#ef4444';
  }
}



// === NPC DIALOGUE SYSTEM (v218) ===
let _dialogueActive = false;
let _currentDialogue = null;

function showDialogue(npcName, lines, options) {
  _dialogueActive = true;
  _currentDialogue = { npc: npcName, lines: lines, lineIdx: 0, options: options || null };
  var el = document.getElementById('dialogue-box');
  if (!el) {
    el = document.createElement('div');
    el.id = 'dialogue-box';
    el.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);width:500px;background:rgba(0,0,0,0.92);border:1px solid rgba(255,255,255,0.15);border-radius:12px;z-index:10016;padding:16px;font-family:-apple-system,sans-serif;backdrop-filter:blur(10px);display:none;';
    document.body.appendChild(el);
  }
  el.style.display = 'block';
  renderDialogueLine();
}
function renderDialogueLine() {
  var el = document.getElementById('dialogue-box');
  if (!el || !_currentDialogue) return;
  var d = _currentDialogue;
  var line = d.lines[d.lineIdx];
  var html = '<div style="color:#f59e0b;font-size:13px;font-weight:600;margin-bottom:8px;">' + d.npc + '</div>';
  html += '<div style="color:#fff;font-size:15px;line-height:1.5;margin-bottom:12px;">' + line + '</div>';
  if (d.lineIdx < d.lines.length - 1) {
    html += '<div style="color:#888;font-size:11px;text-align:right;">Press SPACE to continue ▶</div>';
  } else if (d.options) {
    d.options.forEach(function(opt, i) {
      html += '<div class="dialogue-opt" data-idx="' + i + '" style="color:#4ade80;font-size:13px;padding:6px 8px;margin-top:4px;cursor:pointer;border:1px solid rgba(74,222,128,0.2);border-radius:6px;">' + (i+1) + '. ' + opt.text + '</div>';
    });
  } else {
    html += '<div style="color:#888;font-size:11px;text-align:right;">Press SPACE to close ▶</div>';
  }
  el.innerHTML = html;
  el.querySelectorAll('.dialogue-opt').forEach(function(opt) {
    opt.onclick = function() {
      var idx = parseInt(this.getAttribute('data-idx'));
      if (d.options[idx].action) d.options[idx].action();
      closeDialogue();
    };
  });
}
function advanceDialogue() {
  if (!_currentDialogue) return;
  _currentDialogue.lineIdx++;
  if (_currentDialogue.lineIdx >= _currentDialogue.lines.length) {
    if (!_currentDialogue.options) closeDialogue();
    else renderDialogueLine();
  } else { renderDialogueLine(); }
}
function closeDialogue() {
  _dialogueActive = false;
  _currentDialogue = null;
  var el = document.getElementById('dialogue-box');
  if (el) el.style.display = 'none';
}
window.showDialogue = showDialogue;
window.closeDialogue = closeDialogue;


// === HUD (score, health, etc.) ===
let hudDiv = null;
function initHUD() {
  hudDiv = document.createElement('div');
  hudDiv.id = 'game-hud';
  hudDiv.style.cssText = 'position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:9999;display:none;font-family:monospace;padding:8px 20px;background:rgba(0,0,0,0.7);border:1px solid #4ade80;border-radius:8px;color:#4ade80;font-size:18px;pointer-events:none;';
  hudDiv.innerHTML = 'Score: 0';
  document.body.appendChild(hudDiv);
}
function updateHUD() {
  if (!hudDiv) initHUD();
  hudDiv.style.display = playMode ? 'block' : 'none';
  hudDiv.innerHTML = '⭐ Score: ' + gameScore;
}
setTimeout(initHUD, 500);

// === NOTIFICATION TOAST ===
function showNotification(msg) {
  const toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:10000;font-family:monospace;padding:10px 24px;background:rgba(0,0,0,0.85);border:1px solid #f59e0b;border-radius:8px;color:#f59e0b;font-size:16px;pointer-events:none;transition:opacity 0.5s;';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 500); }, 2500);
}



// ═══ VISUAL POLISH — PBR Material Upgrader ═══
function upgradeMaterials(obj) {
  obj.traverse(child => {
    if (child.isMesh && child.material) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((mat, idx) => {
        // Upgrade basic/lambert to standard for PBR lighting
        if (mat.isMeshBasicMaterial || mat.isMeshLambertMaterial) {
          const newMat = new THREE.MeshStandardMaterial({
            color: mat.color ? mat.color.clone() : new THREE.Color(0x888888),
            map: mat.map || null,
            roughness: 0.72,
            metalness: 0.05,
          });
          if (Array.isArray(child.material)) child.material[idx] = newMat;
          else child.material = newMat;
        }
        // Tune existing standard materials
        if (mat.isMeshStandardMaterial) {
          if (mat.roughness > 0.95) mat.roughness = 0.72;
          if (mat.metalness === 0) mat.metalness = 0.05;
          mat.envMapIntensity = 0.9;
          mat.needsUpdate = true;
        }
        child.castShadow = true;
        child.receiveShadow = true;
      });
    }
  });
}


function _loadGLBFromUrl(name, url, x, z, scaleOverride, glbFile, onDone) {
  const statusEl = document.getElementById('engine-status');
  if (statusEl) statusEl.textContent = 'Loading ' + glbFile + '...';
  if (x === undefined || x === null) x = (Math.random() - 0.5) * 10;
  if (z === undefined || z === null) z = (Math.random() - 0.5) * 10;
  gltfLoader.load(url, (gltf) => {
    const modelPath = url;
    const modelFile = url.split('/').pop();
    const model = gltf.scene;
    if (gltf.animations && gltf.animations.length > 0) {
      const mixer = new THREE.AnimationMixer(model);
      gltf.animations.forEach(clip => { mixer.clipAction(clip).play(); });
      if (!window._mixers) window._mixers = [];
      window._mixers.push(mixer);
    }
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const autoScale = maxDim > 20 ? 3 / maxDim : maxDim < 0.5 ? 2 : 1;
    const scale = scaleOverride || autoScale;
    model.scale.setScalar(scale);
    const bottom = box.min.y * scale;
    const ty = (window._getTerrainY ? window._getTerrainY(x, z) : 0);
    model.position.set(x, ty - bottom, z);
    model.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
    model.userData.name = name;
    model.userData.isGLB = true;
    scene.add(model);
    objects.push(model);
    if (statusEl) statusEl.textContent = '3D Ready';
    if (typeof onDone === 'function') onDone();
  }, undefined, (error) => {
    console.warn('Failed to load ' + url + ':', error);
    if (statusEl) statusEl.textContent = '3D Ready';
    if (typeof onDone === 'function') onDone();
  });
}

function loadGLBModel(name, glbFile, x, z, scaleOverride, customPath) {
  // Check if this is a user-saved model (from IndexedDB or catalog _b64)
  const catalogItem = _assetCatalog && Object.values(_assetCatalog).flat().find(a => a.file === glbFile || a.file === name);
  if (catalogItem && catalogItem._b64) {
    // Load from base64 data (user-generated or marketplace saved model)
    const blob = _modelDB.blobFromB64(catalogItem._b64);
    const blobUrl = URL.createObjectURL(blob);
    _loadGLBFromUrl(name, blobUrl, x, z, scaleOverride, glbFile, () => URL.revokeObjectURL(blobUrl));
    return;
  }
  // Also check IndexedDB async
  if (glbFile.startsWith('user_') || glbFile.startsWith('listing_') || glbFile.startsWith('mp_')) {
    _modelDB.get(glbFile).then(entry => {
      if (entry && entry.data_b64) {
        const blob = _modelDB.blobFromB64(entry.data_b64);
        const blobUrl = URL.createObjectURL(blob);
        _loadGLBFromUrl(name, blobUrl, x, z, scaleOverride, glbFile, () => URL.revokeObjectURL(blobUrl));
      } else {
        showToast('⚠ Model not found in library');
      }
    });
    return;
  }
  // Strip .glb if already present (catalog entries include extension)
  const cleanFile = glbFile.endsWith('.glb') ? glbFile.slice(0, -4) : glbFile;
  const url = customPath || ('/models/' + cleanFile + '.glb');
  const statusEl = document.getElementById('engine-status');
  if (statusEl) statusEl.textContent = 'Loading ' + glbFile + '...';
  // Space models apart when multiple added at once
  const spread = objects.length * 3;
  if (x === undefined || x === null) x = (Math.random() - 0.5) * 10 + spread * 0.3;
  if (z === undefined || z === null) z = (Math.random() - 0.5) * 10;

  console.log('[loadGLBModel] Loading:', url, '(name:', name, 'glbFile:', glbFile, ')');
  gltfLoader.load(url, (gltf) => {
    const model = gltf.scene;
    // Play animations if present
    if (gltf.animations && gltf.animations.length > 0) {
      const mixer = new THREE.AnimationMixer(model);
      gltf.animations.forEach(clip => {
        const action = mixer.clipAction(clip);
        action.play();
      });
      animationMixers.push(mixer);
      model.userData.mixer = mixer;
      model.userData.animations = gltf.animations.map(a => a.name);
      model.userData.clips = gltf.animations; // Store actual clips for switching
    }
    // Fix checkerboard/missing textures + tint white/untextured models
    const _bldgTints = [0xd8ccb8,0xc8bca8,0xb8b0a0,0xd0c8b8,0xc0b8a8,0xe0d8c8,0xc8c0b0,0xb0a898,0xd4ccc0,0xc0b4a4,0xa8a098,0xd8d0c0,0xc8c4b8,0xb8b4a8];
    model.traverse(child => {
      if (child.isMesh && child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach(mat => {
          // If map is a tiny placeholder texture (checkerboard), remove it
          if (mat.map && mat.map.image && mat.map.image.width <= 2) {
            mat.map = null; mat.needsUpdate = true;
          }
          // Tint ONLY pure white meshes with no texture — apply realistic building colors
          if (!mat.map && mat.color) {
            const _r = mat.color.r, _g = mat.color.g, _b = mat.color.b;
            // Only tint if nearly white (>0.9 all channels) — leave colored meshes alone
            if (_r > 0.9 && _g > 0.9 && _b > 0.9) {
              mat.color.setHex(_bldgTints[Math.floor(Math.random() * _bldgTints.length)]);
              mat.roughness = 0.7;
              mat.metalness = 0.02;
            }
            // Glass windows — use MeshPhysicalMaterial for realism
            const _mName = (mat.name || '').toLowerCase();
            const _nName = (child.name || '').toLowerCase();
            if (_mName.includes('glass') || _mName.includes('window') || _nName.includes('glass') || _nName.includes('window')) {
              const glassMat = new THREE.MeshPhysicalMaterial({
                color: 0x88bbdd, metalness: 0.1, roughness: 0.05,
                transmission: 0.7, thickness: 0.3, ior: 1.5,
                transparent: true, opacity: 0.6, envMapIntensity: 1.5,
              });
              child.material = glassMat;
            }
            // Also detect blue-ish parts as windows
            if (mat.color && mat.color.b > 0.5 && mat.color.b > mat.color.r * 1.4) {
              child.material = new THREE.MeshPhysicalMaterial({
                color: 0x99ccee, metalness: 0.1, roughness: 0.08,
                transmission: 0.6, thickness: 0.2, ior: 1.45,
                transparent: true, opacity: 0.55,
              });
            }
          }
          child.castShadow = true;
          child.receiveShadow = true;
        });
      }
    });
    // Auto-scale based on object type
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    let autoScale = 2 / Math.max(maxDim, 0.01);
    const gn = (glbFile || name || "").toLowerCase();
    // Animals should be smaller than humans
    if (gn.includes('animals_pack_') || gn.includes('horse') || gn.includes('cow') || gn.includes('bull') || gn.includes('donkey') || gn.includes('alpaca') || gn.includes('deer') || gn.includes('stag')) {
      autoScale = 1.0 / Math.max(maxDim, 0.01); // ~1 unit tall
    } else if (gn.includes('wolf') || gn.includes('fox') || gn.includes('husky') || gn.includes('shiba')) {
      autoScale = 0.6 / Math.max(maxDim, 0.01); // smaller animals
    } else if (gn.includes('fish_pack_') || gn.includes('cute_fish_') || gn.includes('frog') || gn.includes('rat') || gn.includes('snake') || gn.includes('spider') || gn.includes('wasp') || gn.includes('parrot') || gn.includes('duck') || gn.includes('flamingo') || gn.includes('stork')) {
      autoScale = 0.4 / Math.max(maxDim, 0.01); // small creatures
    }
    // Vehicles — realistic size relative to 1.8m character
    if (gn.includes('car') && !gn.includes('card') && !gn.includes('carpet') && !gn.includes('carrot') && !gn.includes('cart') || gn.includes('sedan') || gn.includes('automobile') || gn.includes('taxi')) {
      autoScale = 4.5 / Math.max(size.x, size.z, 0.01);
    } else if (gn.includes('truck') || gn.includes('lorry') || gn.includes('milk_truck')) {
      autoScale = 6.0 / Math.max(size.x, size.z, 0.01);
    } else if (gn.includes('motorcycle') || gn.includes('motorbike')) {
      autoScale = 2.5 / Math.max(size.x, size.z, 0.01);
    } else if (gn.includes('boat') || gn.includes('ship') || gn.includes('lifeboat') || gn.includes('galleon')) {
      autoScale = 3.5 / Math.max(size.x, size.z, 0.01);
    }
    // Buildings — should be ~5-8 units tall (relative to 1.8m character)
    if (gn.includes('building') || gn.includes('house') || gn.includes('cottage') || gn.includes('castle') || gn.includes('church') || gn.includes('tower') || gn.includes('blacksmith') || gn.includes('warehouse') || gn.includes('stable') || gn.includes('market') || gn.includes('tavern') || gn.includes('shop') || gn.includes('barn') || gn.includes('fort')) {
      autoScale = 6 / Math.max(size.y, 0.01); // Scale based on height to ~6 units tall
    } else if (gn.includes('wall') || gn.includes('gate') || gn.includes('fence') || gn.includes('bridge')) {
      autoScale = 4 / Math.max(size.y, 0.01);
    } else if (gn.includes('column') || gn.includes('statue') || gn.includes('monument') || gn.includes('throne')) {
      autoScale = 3 / Math.max(size.y, 0.01);
    } else if (gn.includes('tank') && !gn.includes('tankard')) {
      autoScale = 6.0 / Math.max(size.x, size.z, 0.01);
    } else if (gn.includes('helicopter') || gn.includes('chopper')) {
      autoScale = 5.0 / Math.max(size.x, size.z, 0.01);
    } else if (gn.includes('bicycle') || gn.includes('bike')) {
      autoScale = 2.0 / Math.max(size.x, size.z, 0.01);
    }
    // Buildings — 2-3 stories
    else if (gn.includes('house') || gn.includes('building') || gn.includes('castle') || gn.includes('tower') || gn.includes('barn') || gn.includes('church') || gn.includes('tavern') || gn.includes('shop') || gn.includes('fortress') || gn.includes('windmill') || gn.includes('lighthouse') || gn.includes('saloon') || gn.includes('temple') || gn.includes('cottage') || gn.includes('cathedral') || gn.includes('mansion')) {
      autoScale = 8.0 / Math.max(maxDim, 0.01);
    }
    // Trees — natural height
    else if (gn.includes('tree') || gn.includes('pine') || gn.includes('oak') || gn.includes('palm') || gn.includes('cherry_blossom') || gn.includes('bamboo') || gn.includes('dead_tree')) {
      autoScale = 5.0 / Math.max(size.y, 0.01);
    }
    // Furniture — human-scale
    else if (gn.includes('chair') || gn.includes('table') || gn.includes('bench') || gn.includes('bed') || gn.includes('desk') || gn.includes('throne') || gn.includes('sofa')) {
      autoScale = 1.2 / Math.max(maxDim, 0.01);
    }
    // Small props
    else if (gn.includes('barrel') || gn.includes('crate') || gn.includes('potion') || gn.includes('lantern') || gn.includes('torch') || gn.includes('bucket') || gn.includes('basket')) {
      autoScale = 0.8 / Math.max(maxDim, 0.01);
    }
    const scale = scaleOverride || autoScale;
    model.scale.setScalar(scale);
    // Rebind skeleton after scale so animated models don't T-pose
    model.updateMatrixWorld(true);
    model.traverse(c => { if (c.isSkinnedMesh && c.skeleton) c.skeleton.pose(); });
    // Recompute after scale
    const box2 = new THREE.Box3().setFromObject(model);
    const bottom = box2.min.y;
    const ln = (name || '').toLowerCase();
    model.position.set(x || 0, -bottom, z || 0);
    // Auto-position on terrain — ensure object bottom sits flush on surface
    if (terrainMesh) {
      let px = x || 0, pz = z || 0;
      const rc = new THREE.Raycaster(new THREE.Vector3(px, 200, pz), new THREE.Vector3(0, -1, 0));
      const hits = rc.intersectObject(terrainMesh);
      if (hits.length > 0) {
        let terrainY = hits[0].point.y;
        // If underwater, move toward center to find dry land
        const waterLevel = -0.3;
        if (terrainY < waterLevel + 0.5 && !ln.includes('boat') && !ln.includes('ship')) {
          px *= 0.4; pz *= 0.4; // Move toward center
          model.position.x = px; model.position.z = pz;
          const rc2 = new THREE.Raycaster(new THREE.Vector3(px, 200, pz), new THREE.Vector3(0, -1, 0));
          const hits2 = rc2.intersectObject(terrainMesh);
          if (hits2.length > 0) terrainY = hits2[0].point.y;
        }
        model.position.y = terrainY - bottom;
      }
    } else {
      model.position.y = -bottom;
    }
    // Enable shadows
    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    model.userData.name = name;
    model.userData.isGLB = true;
    // Auto-float boats — always at water surface level
    if (ln.includes('boat') || ln.includes('ship') || ln.includes('canoe') || ln.includes('kayak')) {
      // Boats float at y=0 (just above ocean at -0.3)
      // If island terrain exists, position boat at the shoreline
      const waterSurfaceY = 0.0; // Ocean is at -0.3, surface visible at ~0
      model.position.y = waterSurfaceY - bottom;
      model.userData.isBoat = true;
      // Add gentle bob animation data
      model.userData.bobPhase = Math.random() * Math.PI * 2;
    }
    
    // Apply model scale overrides
    const modelScaleOvr = (window.MODEL_SCALE_OVERRIDES || {})[glbFile] || (window.MODEL_SCALE_OVERRIDES || {})[url];
    if (modelScaleOvr) model.scale.setScalar(modelScaleOvr);
scene.add(model);
    objects.push(model);
    // Add to collision octree (buildings, stairs, platforms are solid)
    const _ln = (name || '').toLowerCase();
    if (_ln.includes('house') || _ln.includes('building') || _ln.includes('tower') || 
        _ln.includes('stair') || _ln.includes('wall') || _ln.includes('bridge') ||
        _ln.includes('platform') || _ln.includes('floor') || _ln.includes('dungeon') ||
        _ln.includes('castle') || _ln.includes('church') || _ln.includes('cottage') ||
        _ln.includes('stable') || _ln.includes('warehouse') || _ln.includes('inn') ||
        _ln.includes('gate') || _ln.includes('mill') || _ln.includes('ramp')) {
      model.userData.isSolid = true;
      if (window._addToCollision) window._addToCollision(model);
    }
    if (statusEl) statusEl.textContent = '3D Ready';
    if (typeof onDone === 'function') onDone();
  }, 
  (progress) => {
    // Loading progress
  },
  (error) => {
    console.warn('Failed to load ' + url + ':', error);
    if (statusEl) statusEl.textContent = '3D Ready';
    // Show user-visible feedback and try fuzzy search fallback
    const cleanName = (name || glbFile || '').replace(/_/g, ' ');
    if (typeof searchModels === 'function') {
      const results = searchModels(cleanName, 3);
      if (results.length > 0 && results[0].path !== glbFile) {
        // Auto-load best match
        const best = results[0];
        console.log('[loadGLBModel] 404 fallback: "' + glbFile + '" → "' + best.path + '"');
        loadGLBModel(best.name, best.path || best.name, x, z, scaleOverride);
        if (typeof showToast === 'function') showToast('Loading ' + best.name.replace(/_/g, ' ') + '...');
        return;
      }
    }
    if (typeof showToast === 'function') showToast('Model not found: ' + cleanName);
  });
}


// === COMBAT FEEDBACK ===
window._damageFlash = function() {
  const flash = document.createElement('div');
  flash.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(255,0,0,0.3);pointer-events:none;z-index:9999;';
  document.body.appendChild(flash);
  setTimeout(() => { flash.style.opacity = '0'; flash.style.transition = 'opacity 0.3s'; }, 50);
  setTimeout(() => flash.remove(), 400);
};

window._floatingDamage = function(pos, dmg, isCrit) {
  if (!pos) return;
  const projected = pos.clone().project(camera);
  const x = (projected.x * 0.5 + 0.5) * window.innerWidth;
  const y = (-projected.y * 0.5 + 0.5) * window.innerHeight;
  const el = document.createElement('div');
  el.textContent = '-' + dmg;
  el.style.cssText = 'position:fixed;left:' + x + 'px;top:' + y + 'px;color:' + (isCrit ? '#ffdd00' : '#ff4444') + ';font-size:24px;font-weight:bold;font-family:monospace;pointer-events:none;z-index:9999;text-shadow:0 0 4px #000;transition:all 0.8s;';
  document.body.appendChild(el);
  requestAnimationFrame(() => { el.style.top = (y - 60) + 'px'; el.style.opacity = '0'; });
  setTimeout(() => el.remove(), 900);
};
// === KILL FEED ===
window._killFeed = function(message) {
  let feed = document.getElementById('kill-feed');
  if (!feed) {
    feed = document.createElement('div');
    feed.id = 'kill-feed';
    feed.style.cssText = 'position:fixed;top:80px;right:16px;z-index:9000;pointer-events:none;' +
      'font-family:monospace;font-size:13px;max-width:280px;';
    document.body.appendChild(feed);
  }
  
  const entry = document.createElement('div');
  entry.textContent = message;
  entry.style.cssText = 'color:#fff;background:rgba(0,0,0,0.6);padding:4px 10px;margin-bottom:4px;' +
    'border-radius:4px;border-left:3px solid #ff4444;opacity:1;transition:opacity 0.5s;' +
    'backdrop-filter:blur(4px);';
  feed.appendChild(entry);
  
  // Limit to 5 entries
  while (feed.children.length > 5) feed.removeChild(feed.firstChild);
  
  // Fade out after 3s
  setTimeout(() => { entry.style.opacity = '0'; }, 3000);
  setTimeout(() => { if (entry.parentNode) entry.remove(); }, 3500);
};


window._playerDeath = function() {
  // Remove any existing death screens first
  document.querySelectorAll('#death-screen').forEach(function(d) { d.remove(); });
  const overlay = document.createElement('div');
  overlay.id = 'death-screen';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0);display:flex;align-items:center;justify-content:center;z-index:10000;transition:background 1s;';
  overlay.innerHTML = '<div style="color:#cc0000;font-size:48px;font-family:monospace;text-align:center;opacity:0;transition:opacity 1.5s;" id="death-text">' +
    '<div style="font-size:64px;margin-bottom:20px;">YOU DIED</div>' +
    '<div style="font-size:14px;color:#666;margin-bottom:30px;">Score: ' + (window._gameScore || 0) + '</div>' +
    '<button onclick="window._respawnPlayer()" style="padding:14px 40px;background:#cc0000;color:#fff;border:2px solid #ff4444;border-radius:6px;font-size:18px;cursor:pointer;font-family:monospace;margin:8px;">RESPAWN</button>' +
    '<button onclick="window._exitToEditor()" style="padding:14px 40px;background:#333;color:#fff;border:2px solid #555;border-radius:6px;font-size:18px;cursor:pointer;font-family:monospace;margin:8px;">EXIT</button>' +
    '</div>';
  document.body.appendChild(overlay);
  // Fade in
  requestAnimationFrame(() => {
    overlay.style.background = 'rgba(0,0,0,0.85)';
    document.getElementById('death-text').style.opacity = '1';
  });
  // ESC key handler
  const escHandler = (e) => {
    if (e.key === 'Escape') { window._exitToEditor(); document.removeEventListener('keydown', escHandler); }
  };
  document.addEventListener('keydown', escHandler);
};

window._respawnPlayer = function() {
  document.querySelectorAll('#death-screen').forEach(function(d) { d.remove(); });
  if (characterController) {
    characterController.isDead = false;
    characterController.health = characterController.maxHealth;
    characterController.stamina = characterController.maxStamina;
    const sy = typeof getTerrainY === 'function' ? getTerrainY(0, 0) + 1 : 2;
    characterController.position.set(0, sy, 0);
    if (characterController.model) characterController.position.set(0, sy, 0);
  }
};

window._exitToEditor = function() {
  document.querySelectorAll('#death-screen').forEach(function(d) { d.remove(); });
  if (typeof exitPlayMode === 'function') exitPlayMode();
};


// === AI AGENT — PLAYER CUSTOMIZATION SYSTEM ===
// Per-user AI that interprets natural language to customize gameplay
// Stored in localStorage so each user keeps their style

const PlayerAgent = {
  // Default player profile
  _defaults: {
    walkSpeed: 8, sprintSpeed: 14, jumpForce: 8,
    rollSpeed: 12, rollDistance: 3,
    maxHealth: 100, maxStamina: 100,
    staminaRegen: 20, healthRegen: 0,
    weapon: null, weaponSlot2: null,
    combatStyle: 'balanced', // balanced, aggressive, defensive, ranged, stealth
    dodgeType: 'roll', // roll, dash, blink, sidestep
    attackSpeed: 1.0, attackDamage: 1.0,
    armor: 0, // damage reduction %
    movementStyle: 'normal', // normal, ninja, heavy, acrobatic
    appearance: { primaryColor: null, secondaryColor: null, glow: null, trail: null },
    abilities: [], // unlocked special abilities
    preferredWeapons: [], // weapon types player likes
    difficulty: 'normal', // easy, normal, hard, souls
  },

  // Load profile from localStorage
  load() {
    try {
      const saved = localStorage.getItem('crate_player_profile');
      return saved ? { ...this._defaults, ...JSON.parse(saved) } : { ...this._defaults };
    } catch(e) { return { ...this._defaults }; }
  },

  // Save profile
  save(profile) {
    try { localStorage.setItem('crate_player_profile', JSON.stringify(profile)); } catch(e) {}
  },

  // Apply profile to character controller
  apply(profile, charCtrl) {
    if (!charCtrl) return;
    charCtrl.walkSpeed = profile.walkSpeed;
    charCtrl.sprintSpeed = profile.sprintSpeed || profile.walkSpeed * 2;
    charCtrl.jumpForce = profile.jumpForce;
    if (charCtrl.maxHealth !== undefined) charCtrl.maxHealth = profile.maxHealth;
    if (charCtrl.maxStamina !== undefined) charCtrl.maxStamina = profile.maxStamina;
    charCtrl.health = Math.min(charCtrl.health || profile.maxHealth, profile.maxHealth);
    charCtrl.stamina = Math.min(charCtrl.stamina || profile.maxStamina, profile.maxStamina);
  },

  // Interpret natural language commands and update profile
  interpret(input, profile) {
    const lower = input.toLowerCase().trim();
    const changes = [];
    
    // === MOVEMENT STYLE ===
    if (/make (?:me|my character|player) (?:move |run |go )?faster/i.test(lower)) {
      profile.walkSpeed = Math.min(15, profile.walkSpeed + 2);
      profile.sprintSpeed = profile.walkSpeed * 2;
      changes.push('⚡ Movement speed increased to ' + profile.walkSpeed);
    }
    if (/make (?:me|my character|player) (?:move |run |go )?slower/i.test(lower)) {
      profile.walkSpeed = Math.max(2, profile.walkSpeed - 2);
      profile.sprintSpeed = profile.walkSpeed * 2;
      changes.push('🐢 Movement speed decreased to ' + profile.walkSpeed);
    }
    if (/ninja|stealth|assassin/i.test(lower) && /style|mode|movement|class/i.test(lower)) {
      profile.movementStyle = 'ninja';
      profile.walkSpeed = 7; profile.sprintSpeed = 16;
      profile.dodgeType = 'dash'; profile.rollSpeed = 18;
      profile.combatStyle = 'stealth';
      profile.attackSpeed = 1.5; profile.attackDamage = 1.3;
      profile.armor = 5;
      changes.push('🥷 Ninja style activated! Fast movement, quick dash, stealth combat');
    }
    if (/tank|heavy|warrior|brute/i.test(lower) && /style|mode|movement|class/i.test(lower)) {
      profile.movementStyle = 'heavy';
      profile.walkSpeed = 3.5; profile.sprintSpeed = 7;
      profile.maxHealth = 200; profile.maxStamina = 80;
      profile.dodgeType = 'sidestep'; profile.rollSpeed = 6;
      profile.combatStyle = 'aggressive';
      profile.attackSpeed = 0.7; profile.attackDamage = 2.0;
      profile.armor = 30;
      changes.push('🛡️ Tank style activated! Slow but hits hard, 200 HP, 30% armor');
    }
    if (/mage|wizard|sorcerer|magic/i.test(lower) && /style|mode|movement|class/i.test(lower)) {
      profile.movementStyle = 'acrobatic';
      profile.walkSpeed = 5; profile.sprintSpeed = 10;
      profile.maxHealth = 70; profile.maxStamina = 150;
      profile.dodgeType = 'blink';
      profile.combatStyle = 'ranged';
      profile.attackSpeed = 1.2; profile.attackDamage = 1.5;
      profile.armor = 0;
      profile.appearance.glow = '#4488ff';
      changes.push('🧙 Mage style activated! Low HP, high stamina, blink dodge, magic glow');
    }
    if (/acrobat|parkour|agile/i.test(lower) && /style|mode|movement|class/i.test(lower)) {
      profile.movementStyle = 'acrobatic';
      profile.walkSpeed = 6; profile.sprintSpeed = 14;
      profile.jumpForce = 12; profile.dodgeType = 'roll';
      profile.rollSpeed = 15; profile.combatStyle = 'balanced';
      changes.push('🤸 Acrobat style! High jump, fast rolls, agile movement');
    }
    
    // === WEAPON PREFERENCES ===
    if (/(?:give me|i want|equip|use) (?:a |an )?(fire|ice|lightning|poison|holy|dark)?\s*(sword|axe|hammer|spear|dagger|bow|staff|rifle|pistol|shotgun|smg|sniper|katana|scythe|dual.?wield)/i.test(lower)) {
      const m = lower.match(/(?:give me|i want|equip|use) (?:a |an )?(fire|ice|lightning|poison|holy|dark)?\s*(sword|axe|hammer|spear|dagger|bow|staff|rifle|pistol|shotgun|smg|sniper|katana|scythe|dual.?wield)/i);
      const element = m[1] || null;
      const weapon = m[2];
      profile.weapon = weapon;
      if (element) {
        profile.weaponElement = element;
        changes.push('🔥 Equipped ' + element + ' ' + weapon + '!');
      } else {
        changes.push('⚔️ Equipped ' + weapon + '!');
      }
      if (!profile.preferredWeapons.includes(weapon)) profile.preferredWeapons.push(weapon);
    }
    
    // === JUMP HEIGHT ===
    if (/(?:higher|bigger) jump/i.test(lower) || /jump (?:higher|more)/i.test(lower)) {
      profile.jumpForce = Math.min(20, profile.jumpForce + 3);
      changes.push('🦘 Jump force increased to ' + profile.jumpForce);
    }
    
    // === HEALTH/STAMINA ===
    if (/more (?:health|hp|hitpoints)/i.test(lower) || /increase (?:my )?(?:health|hp)/i.test(lower)) {
      profile.maxHealth = Math.min(500, profile.maxHealth + 50);
      changes.push('❤️ Max health increased to ' + profile.maxHealth);
    }
    if (/more stamina/i.test(lower) || /increase (?:my )?stamina/i.test(lower)) {
      profile.maxStamina = Math.min(300, profile.maxStamina + 30);
      changes.push('⚡ Max stamina increased to ' + profile.maxStamina);
    }
    
    // === DIFFICULTY ===
    if (/(?:easy|casual) (?:mode|difficulty)/i.test(lower)) {
      profile.difficulty = 'easy';
      profile.maxHealth = Math.max(profile.maxHealth, 200);
      profile.healthRegen = 5;
      changes.push('😊 Easy mode! 200+ HP, health regeneration');
    }
    if (/(?:hard|difficult|challenge) (?:mode|difficulty)/i.test(lower)) {
      profile.difficulty = 'hard';
      profile.maxHealth = Math.min(profile.maxHealth, 80);
      profile.healthRegen = 0;
      changes.push('💀 Hard mode! 80 HP max, no regen');
    }
    if (/(?:souls|souls-?like|dark.?souls|elden) (?:mode|difficulty|style)/i.test(lower)) {
      profile.difficulty = 'souls';
      profile.maxHealth = 60;
      profile.healthRegen = 0;
      profile.armor = 0;
      profile.attackDamage = 0.8;
      changes.push('☠️ Souls mode! 60 HP, no regen, no armor, reduced damage. Git gud.');
    }
    
    // === DODGE TYPE ===
    if (/(?:dash|blink|sidestep|teleport) (?:dodge|roll|instead)/i.test(lower)) {
      const m = lower.match(/(dash|blink|sidestep|teleport)/i);
      if (m) {
        profile.dodgeType = m[1].toLowerCase() === 'teleport' ? 'blink' : m[1].toLowerCase();
        changes.push('💨 Dodge type set to ' + profile.dodgeType);
      }
    }
    
    // === APPEARANCE ===
    if (/(?:glow|aura) (?:color |)(red|blue|green|purple|gold|white|orange|pink|cyan)/i.test(lower)) {
      const colors = {red:'#ff0000',blue:'#0044ff',green:'#00ff44',purple:'#8800ff',gold:'#ffdd00',white:'#ffffff',orange:'#ff6600',pink:'#ff44aa',cyan:'#00ffff'};
      const m = lower.match(/(red|blue|green|purple|gold|white|orange|pink|cyan)/i);
      profile.appearance.glow = colors[m[1].toLowerCase()] || '#ffffff';
      changes.push('✨ Character glow: ' + m[1]);
    }
    
    // === WORLD BUILDING (via AI agent) ===
    if (/(?:build|create|take) me (?:to |a )?(tropical|hurricane|arctic|swamp|enchanted|pirate|dragon|medieval|ocean|war|cyberpunk|frozen|desert|jungle|volcano|haunted)/i.test(lower)) {
      const m = lower.match(/(tropical|hurricane|arctic|swamp|enchanted|pirate|dragon|medieval|ocean|war|cyberpunk|frozen|desert|jungle|volcano|haunted)/i);
      const worldMap = { tropical:'tropical paradise', hurricane:'hurricane', arctic:'arctic storm', swamp:'dark swamp', enchanted:'enchanted forest', pirate:'pirate cove', dragon:'dragon lair', medieval:'medieval siege', ocean:'ocean voyage', war:'war zone', cyberpunk:'cyberpunk', frozen:'frozen', desert:'desert', jungle:'jungle', volcano:'volcano', haunted:'haunted' };
      const world = worldMap[m[1].toLowerCase()] || m[1];
      window._agentBuildWorld = world;
      changes.push('🌍 Building ' + world + ' world...');
    }
    
    // === WATER CHANGE (via AI agent) ===
    if (/(?:change|set|make) (?:the )?water (?:to |)(tropical|storm|ocean|lake|arctic|swamp|river)/i.test(lower)) {
      const m = lower.match(/(tropical|storm|ocean|lake|arctic|swamp|river)/i);
      window._agentWaterPreset = m[1].toLowerCase();
      changes.push('🌊 Water preset: ' + m[1]);
    }
    
    // === RESET ===
    if (/reset (?:my |player |character )?(?:stats|profile|style|everything|defaults)/i.test(lower)) {
      Object.assign(profile, this._defaults);
      changes.push('🔄 Profile reset to defaults!');
    }
    
    // === SHOW STATS ===
    if (/(?:show|my|view|check) (?:my |player |character )?(?:stats|profile|build|style)/i.test(lower)) {
      changes.push(
        '📊 YOUR BUILD:\n' +
        '  Style: ' + profile.combatStyle + ' / ' + profile.movementStyle + '\n' +
        '  HP: ' + profile.maxHealth + ' | Stamina: ' + profile.maxStamina + '\n' +
        '  Speed: ' + profile.walkSpeed + ' | Sprint: ' + profile.sprintSpeed + '\n' +
        '  Jump: ' + profile.jumpForce + ' | Dodge: ' + profile.dodgeType + '\n' +
        '  Attack: x' + profile.attackDamage + ' | Speed: x' + profile.attackSpeed + '\n' +
        '  Armor: ' + profile.armor + '% | Weapon: ' + (profile.weapon || 'none') + '\n' +
        '  Difficulty: ' + profile.difficulty
      );
    }
    
    return changes;
  }
};

window.PlayerAgent = PlayerAgent;

// === SETUP — WebGPU (experimental) with WebGL2 fallback ===
const canvas = document.getElementById('crate-canvas');
const _webgpuAvailable = !!navigator.gpu;
const _webgpuRequested = localStorage.getItem('crate-webgpu') === 'true' && _webgpuAvailable;
let renderer;

if (_webgpuRequested) {
  try {
    const { WebGPURenderer } = await import('https://cdn.jsdelivr.net/npm/three@0.175.0/examples/jsm/renderers/webgpu/WebGPURenderer.js');
    renderer = new WebGPURenderer({ canvas, antialias: true });
    await renderer.init();
    window._isWebGPU = true;
    console.log('[CRATE] WebGPU renderer active');
  } catch (e) {
    console.warn('[CRATE] WebGPU failed, using WebGL:', e.message);
    renderer = null;
  }
}
if (!renderer) {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, logarithmicDepthBuffer: true });
  window._isWebGPU = false;
}

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
renderer.setSize(canvas.clientWidth, canvas.clientHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.4;
renderer.outputColorSpace = THREE.SRGBColorSpace;

// Show GPU backend in status bar
{
  const _gpuEl = document.getElementById('wasm-status');
  if (_gpuEl) {
    if (window._isWebGPU) { _gpuEl.textContent = 'WebGPU ✓'; _gpuEl.style.color = '#4ade80'; }
    else if (_webgpuAvailable) { _gpuEl.textContent = 'WebGL (WebGPU ready)'; _gpuEl.style.color = '#60a5fa'; }
    else { _gpuEl.textContent = 'WebGL2'; _gpuEl.style.color = '#d29922'; }
  }
}
const scene = new THREE.Scene();
setBuildingsScene(scene);
  // Atmospheric fog for depth perception
  scene.fog = new THREE.FogExp2(0x88aabb, 0.0015);
if (window._loadProgress) window._loadProgress(20, "Creating scene...");
// === PROCEDURAL SOUND SYSTEM (Web Audio API) ===
// No audio files needed — generates sounds mathematically
(function() {
  let ctx = null;
  function getCtx() {
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch(e) { return null; }
    }
    return ctx;
  }
  
  // Resume on first user interaction
  document.addEventListener('click', () => { if (ctx && ctx.state === 'suspended') ctx.resume(); }, { once: true });
  document.addEventListener('keydown', () => { if (ctx && ctx.state === 'suspended') ctx.resume(); }, { once: true });
  
  function playTone(freq, duration, type, volume, decay) {
    const c = getCtx(); if (!c) return;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume || 0.15, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + (duration || 0.2));
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(c.currentTime);
    osc.stop(c.currentTime + (duration || 0.2));
  }
  
  function playNoise(duration, volume) {
    const c = getCtx(); if (!c) return;
    const bufferSize = c.sampleRate * duration;
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
    const source = c.createBufferSource();
    source.buffer = buffer;
    const gain = c.createGain();
    gain.gain.setValueAtTime(volume || 0.1, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    source.connect(gain);
    gain.connect(c.destination);
    source.start(c.currentTime);
  }
  
  let lastFootstep = 0;
  
  window._sound = {
    SFX: {
      swordSwing() { playTone(200, 0.15, 'sawtooth', 0.08); playNoise(0.1, 0.05); },
      swordHit() { playNoise(0.08, 0.12); playTone(150, 0.1, 'square', 0.1); },
      heavyAttack() { playTone(80, 0.3, 'sawtooth', 0.12); playNoise(0.15, 0.08); },
      dodge() { playNoise(0.12, 0.06); playTone(400, 0.1, 'sine', 0.05); },
      jump() { playTone(300, 0.15, 'sine', 0.06); playTone(500, 0.1, 'sine', 0.04); },
      playerHit() { playTone(100, 0.2, 'square', 0.1); playNoise(0.1, 0.08); },
      playerDeath() { playTone(80, 0.5, 'sawtooth', 0.15); playTone(60, 0.8, 'sine', 0.1); },
      enemyDeath() { playNoise(0.2, 0.1); playTone(120, 0.3, 'square', 0.08); },
      pickup() { playTone(600, 0.1, 'sine', 0.08); playTone(800, 0.1, 'sine', 0.06); },
      doorOpen() { playTone(200, 0.15, 'triangle', 0.06); },
      gunshot() { playNoise(0.08, 0.15); playTone(100, 0.1, 'sawtooth', 0.1); },
      reload() { playTone(300, 0.15, 'triangle', 0.06); setTimeout(() => playTone(400, 0.1, 'sine', 0.05), 200); },
      heal() { playTone(500, 0.2, 'sine', 0.08); playTone(700, 0.15, 'sine', 0.06); },
    },
    updateFootsteps(dt, moving, running, surface) {
      const interval = running ? 0.35 : 0.5;
      const now = performance.now() / 1000;
      if (moving && now - lastFootstep > interval) {
        lastFootstep = now;
        // Surface-dependent footstep sounds
        const s = (surface || 'grass').toLowerCase();
        if (s.includes('stone') || s.includes('concrete') || s.includes('cobble')) {
          playTone(180 + Math.random() * 60, 0.04, 'square', 0.03);
          playNoise(0.03, 0.04);
        } else if (s.includes('sand') || s.includes('dirt') || s.includes('mud')) {
          playNoise(0.06, 0.04);
          playTone(40 + Math.random() * 20, 0.04, 'sine', 0.02);
        } else if (s.includes('snow')) {
          playNoise(0.08, 0.025);
          playTone(2000 + Math.random() * 500, 0.02, 'sine', 0.01);
        } else if (s.includes('wood')) {
          playTone(120 + Math.random() * 40, 0.05, 'triangle', 0.04);
          playNoise(0.02, 0.02);
        } else if (s.includes('water') || s.includes('wet')) {
          playNoise(0.04, 0.035);
          playTone(200 + Math.random() * 100, 0.03, 'sine', 0.015);
        } else {
          // Default grass
          const freq = 60 + Math.random() * 40;
          playNoise(0.05, 0.03);
          playTone(freq, 0.05, 'sine', 0.02);
        }
      }
    },
    
    // Ambient one-shots (birds, wind gusts, etc.)
    ambientOneShot(type) {
      if (type === 'bird') {
        const freq = 800 + Math.random() * 1200;
        playTone(freq, 0.1, 'sine', 0.03);
        setTimeout(() => playTone(freq * 1.2, 0.08, 'sine', 0.025), 120);
        setTimeout(() => playTone(freq * 0.9, 0.12, 'sine', 0.02), 260);
      } else if (type === 'wind') {
        playNoise(0.8, 0.02);
      } else if (type === 'cricket') {
        for (let i = 0; i < 3; i++) {
          setTimeout(() => playTone(4000 + Math.random() * 1000, 0.03, 'sine', 0.015), i * 80);
        }
      } else if (type === 'thunder') {
        playNoise(1.5, 0.12);
        playTone(40, 0.8, 'sawtooth', 0.08);
      } else if (type === 'splash') {
        playNoise(0.15, 0.08);
        playTone(300, 0.1, 'sine', 0.04);
      }
    },
    
    // UI sounds
    uiClick() { playTone(800, 0.05, 'sine', 0.04); },
    uiHover() { playTone(600, 0.03, 'sine', 0.02); },
    uiError() { playTone(200, 0.15, 'square', 0.06); },
    uiSuccess() { playTone(500, 0.08, 'sine', 0.04); playTone(700, 0.08, 'sine', 0.03); },
    
    levelUp() {
      playTone(400, 0.2, 'sine', 0.08);
      setTimeout(() => playTone(500, 0.15, 'sine', 0.07), 100);
      setTimeout(() => playTone(600, 0.15, 'sine', 0.06), 200);
      setTimeout(() => playTone(800, 0.25, 'sine', 0.08), 300);
    },
    
    questComplete() {
      playTone(523, 0.15, 'sine', 0.06);
      setTimeout(() => playTone(659, 0.15, 'sine', 0.06), 150);
      setTimeout(() => playTone(784, 0.2, 'sine', 0.07), 300);
    },
    
    // Weapon-specific SFX
    bowDraw() { playNoise(0.2, 0.04); playTone(100, 0.15, 'triangle', 0.03); },
    bowRelease() { playTone(400, 0.08, 'sawtooth', 0.05); playNoise(0.05, 0.03); },
    reload() { playTone(300, 0.05, 'square', 0.04); setTimeout(() => playTone(400, 0.05, 'square', 0.04), 200); setTimeout(() => playTone(500, 0.03, 'triangle', 0.03), 400); },
    explosion() { playNoise(0.4, 0.15); playTone(30, 0.5, 'sawtooth', 0.12); playTone(60, 0.3, 'square', 0.08); },
    shield() { playTone(150, 0.15, 'triangle', 0.08); playNoise(0.08, 0.04); },
    
    // Stubs for sound.mjs compat
    init() {},
    toggleMute() { return true; },
    setMusicMood(mood) {},
    biomeToMood(biome) { return 'peaceful'; },
    biomeToAmbient(biome) { return 'forest'; },
  };
  
  // Periodic ambient one-shots
  let _ambientTimer = 0;
  window._updateAmbientOneShots = function(dt) {
    _ambientTimer += dt;
    if (_ambientTimer > 8 + Math.random() * 15) {
      _ambientTimer = 0;
      const types = ['bird', 'wind', 'cricket'];
      const biome = window._currentBiome || 'peaceful';
      if (biome === 'storm' || biome === 'hurricane') {
        window._sound.ambientOneShot('thunder');
      } else {
        window._sound.ambientOneShot(types[Math.floor(Math.random() * types.length)]);
      }
    }
  };
})();


const camera = new THREE.PerspectiveCamera(50, canvas.clientWidth / canvas.clientHeight, 0.1, 2000);
camera.position.set(15, 10, 20);

const controls = new OrbitControls(camera, canvas);
window._cam = camera; window._ctrl = controls; window._scene = scene; window._renderer = renderer;
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 1, 0);
controls.maxPolarAngle = Math.PI * 0.85; // Allow looking down steeply
controls.minDistance = 0.5;
controls.maxDistance = 5000;  // Fly anywhere
controls.screenSpacePanning = true; // Pan in screen space (natural)
controls.keyPanSpeed = 40;

// === LIGHTING ===
const ambientLight = new THREE.HemisphereLight(0x87ceeb, 0x362a1a, 0.6);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xfff5e0, 3);
sunLight.position.set(30, 40, 20);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(4096, 4096);
    sunLight.shadow.normalBias = 0.02;
sunLight.shadow.camera.near = 0.5;
sunLight.shadow.camera.far = 120;
sunLight.shadow.camera.left = -60;
sunLight.shadow.camera.right = 60;
sunLight.shadow.camera.top = 60;
sunLight.shadow.camera.bottom = -60;

// Close-range shadow light for crisp nearby shadows (pseudo-CSM)
const nearShadowLight = new THREE.DirectionalLight(0xfff5e0, 0); // No extra light, just shadow
nearShadowLight.position.set(15, 20, 10);
nearShadowLight.castShadow = true;
nearShadowLight.shadow.mapSize.set(2048, 2048);
nearShadowLight.shadow.camera.near = 0.1;
nearShadowLight.shadow.camera.far = 40;
nearShadowLight.shadow.camera.left = -15;
nearShadowLight.shadow.camera.right = 15;
nearShadowLight.shadow.camera.top = 15;
nearShadowLight.shadow.camera.bottom = -15;
nearShadowLight.shadow.bias = -0.0003;
nearShadowLight.shadow.normalBias = 0.01;
scene.add(nearShadowLight);

// Update shadow cameras to follow player/camera
let _shadowFrame = 0;
function updateShadowCascades() {
  _shadowFrame++;
  if (_shadowFrame % 4 !== 0) return; // Only update every 4th frame to reduce jitter
  const camPos = camera.position;
  sunLight.shadow.camera.left = camPos.x - 60;
  sunLight.shadow.camera.right = camPos.x + 60;
  sunLight.shadow.camera.top = camPos.z + 60;
  sunLight.shadow.camera.bottom = camPos.z - 60;
  sunLight.shadow.camera.updateProjectionMatrix();
  sunLight.target.position.set(camPos.x, 0, camPos.z);
  
  nearShadowLight.position.set(camPos.x + 15, 20, camPos.z + 10);
  nearShadowLight.shadow.camera.left = camPos.x - 15;
  nearShadowLight.shadow.camera.right = camPos.x + 15;
  nearShadowLight.shadow.camera.top = camPos.z + 15;
  nearShadowLight.shadow.camera.bottom = camPos.z - 15;
  nearShadowLight.shadow.camera.updateProjectionMatrix();
  nearShadowLight.target.position.set(camPos.x, 0, camPos.z);
}
window._updateShadowCascades = updateShadowCascades;
sunLight.shadow.bias = -0.001;
sunLight.shadow.normalBias = 0.04;
scene.add(sunLight);

// === CHARACTER & TOWN SYSTEMS ===
let characterController = null;
let npcController = null;
let questSystem = new QuestSystem();
let craftingSystem = null;
let levelSystem = null;
let dialogueSystem = new DialogueSystem();
let minimap = null;
let townBuilder = null;
let gameHUD = null;

function initGameSystems() {
  characterController = new CharacterController(scene, camera, objects);
  window._gamepad = new GamepadManager(characterController);
  window._mobileControls = new MobileControls(characterController);
  window.characterController = characterController;
  characterController._autoSpawned = false; // Don't auto-spawn until "play" 
  npcController = new NPCController(scene, camera, objects, characterController);
  window.npcController = npcController;
  townBuilder = new TownBuilder(scene, objects, loadGLBModel);
  gameHUD = createGameHUD();
}
setTimeout(initGameSystems, 500);


const fillLight = new THREE.DirectionalLight(0x8888ff, 0.3);
fillLight.position.set(-10, 5, -10);
scene.add(fillLight);

// ═══════════════════════════════════════════════════
// POST-PROCESSING PIPELINE — Bloom, SSAO, SMAA, DOF, God Rays, Color Grading
// ═══════════════════════════════════════════════════
let composer = null;
let bloomPass = null;
let ssaoPass = null;
let smaaPass = null;
let bokehPass = null;
let godRaysEnabled = false;
let ppEnabled = false; // Performance: off by default, enable with 'graphics high'

async function initPostProcessing() {
  if (!_ppModulesLoaded) { const ok = await loadPostProcessingModules(); if (!ok) return; }
  composer = new EffectComposer(renderer);
  
  // Base render pass
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  
  // SSAO — Screen Space Ambient Occlusion (subtle contact shadows)
  ssaoPass = new SSAOPass(scene, camera, canvas.clientWidth, canvas.clientHeight);
  ssaoPass.kernelRadius = 12;
  ssaoPass.minDistance = 0.001;
  ssaoPass.maxDistance = 0.15;
  ssaoPass.output = SSAOPass.OUTPUT.Default;
  ssaoPass.enabled = false; // Disabled by default for performance
  composer.addPass(ssaoPass);
  
  // Bloom — glow on bright areas (Unreal-style)
  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(canvas.clientWidth, canvas.clientHeight),
    0.3,   // strength (subtle)
    0.5,   // radius
    0.85   // threshold — subtle bloom on bright surfaces
  );
  composer.addPass(bloomPass);
  
  // Custom color grading + vignette + chromatic aberration pass
  const colorGradingShader = {
    uniforms: {
      tDiffuse: { value: null },
      vignetteStrength: { value: 0.35 },
      vignetteOffset: { value: 0.9 },
      saturation: { value: 1.12 },
      contrast: { value: 1.08 },
      brightness: { value: 1.02 },
      chromaticAberration: { value: 0.0012 },
      filmGrain: { value: 0.03 },
      time: { value: 0 },
    },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform float vignetteStrength;
      uniform float vignetteOffset;
      uniform float saturation;
      uniform float contrast;
      uniform float brightness;
      uniform float chromaticAberration;
      uniform float filmGrain;
      uniform float time;
      varying vec2 vUv;
      
      vec3 adjustSaturation(vec3 color, float sat) {
        float grey = dot(color, vec3(0.2126, 0.7152, 0.0722));
        return mix(vec3(grey), color, sat);
      }
      
      float random(vec2 co) {
        return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
      }
      
      void main() {
        // Chromatic aberration
        vec2 dir = vUv - 0.5;
        float dist = length(dir);
        vec2 offset = dir * chromaticAberration * dist;
        float r = texture2D(tDiffuse, vUv + offset).r;
        float g = texture2D(tDiffuse, vUv).g;
        float b = texture2D(tDiffuse, vUv - offset).b;
        vec3 color = vec3(r, g, b);
        
        // Saturation
        color = adjustSaturation(color, saturation);
        
        // Contrast + brightness
        color = (color - 0.5) * contrast + 0.5;
        color *= brightness;
        
        // Vignette
        float vig = smoothstep(vignetteOffset, vignetteOffset - vignetteStrength, dist);
        color *= mix(0.4, 1.0, vig);
        
        // Film grain (subtle)
        float grain = random(vUv + fract(time)) * filmGrain;
        color += grain - filmGrain * 0.5;
        
        gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
      }
    `
  };
  
  const colorPass = new ShaderPass(colorGradingShader);
  colorPass.uniforms.time.value = 0;
  composer.addPass(colorPass);
  window._colorPass = colorPass;
  
  // SMAA — anti-aliasing (better than FXAA)
  smaaPass = new SMAAPass(canvas.clientWidth * renderer.getPixelRatio(), canvas.clientHeight * renderer.getPixelRatio());
  composer.addPass(smaaPass);
  
  // Output pass (tone mapping + color space)
  const outputPass = new OutputPass();
  composer.addPass(outputPass);
  
  console.log('[PostFX] Pipeline: Render → SSAO → Bloom → ColorGrade → SMAA → Output');
}

// God Rays shader (volumetric light scattering)
const GodRaysShader = {
  uniforms: {
    tDiffuse: { value: null },
    lightPosition: { value: new THREE.Vector2(0.5, 0.7) },
    exposure: { value: 0.18 },
    decay: { value: 0.96 },
    density: { value: 0.8 },
    weight: { value: 0.4 },
    samples: { value: 60 },
  },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 lightPosition;
    uniform float exposure;
    uniform float decay;
    uniform float density;
    uniform float weight;
    uniform int samples;
    varying vec2 vUv;
    void main() {
      vec2 texCoord = vUv;
      vec2 deltaTexCoord = (texCoord - lightPosition) * density / float(samples);
      vec4 color = texture2D(tDiffuse, texCoord);
      float illuminationDecay = 1.0;
      vec4 godRayColor = vec4(0.0);
      for (int i = 0; i < 60; i++) {
        texCoord -= deltaTexCoord;
        vec4 s = texture2D(tDiffuse, texCoord);
        s *= illuminationDecay * weight;
        godRayColor += s;
        illuminationDecay *= decay;
      }
      gl_FragColor = color + godRayColor * exposure;
    }
  `
};

// Environment map loader
let envMap = null;
function loadEnvironmentMap(preset) {
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();
  
  // HDRI presets from Poly Haven (free, CC0)
  const HDRI_URLS = {
    'default':    'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/kloofendal_48d_partly_cloudy_puresky_1k.hdr',
    'sunset':     'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/venice_sunset_1k.hdr',
    'night':      'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/moonlit_golf_1k.hdr',
    'studio':     'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_08_1k.hdr',
    'forest':     'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/syferfontein_0d_clear_puresky_1k.hdr',
    'overcast':   'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/cloudy_crown_1k.hdr',
    'space':      'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/starmap_2020_4k_gal2eq_1k.hdr',
    'desert':     'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/goegap_1k.hdr',
    'tropical':   'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/cape_hill_open_1k.hdr',
    'underwater': 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/blue_lagoon_1k.hdr',
  };
  
  const url = HDRI_URLS[preset] || HDRI_URLS['default'];
  
  new RGBELoader().load(url, (texture) => {
    envMap = pmremGenerator.fromEquirectangular(texture).texture;
    scene.environment = envMap;
    scene.background = envMap; // Use HDRI as sky background for realism
    texture.dispose();
    pmremGenerator.dispose();
    console.log('[EnvMap] HDRI loaded: ' + (preset || 'default'));
  }, undefined, (err) => {
    // Fallback to procedural if HDRI fails to load
    console.warn('[EnvMap] HDRI failed, using procedural fallback:', err?.message);
    const envScene = new THREE.Scene();
    const envGeo = new THREE.SphereGeometry(100, 32, 32);
    const envMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: { topColor: { value: new THREE.Color(0x87ceeb) }, bottomColor: { value: new THREE.Color(0xf0e6d3) }, offset: { value: 10 }, exponent: { value: 0.6 } },
      vertexShader: 'varying vec3 vWP; void main(){ vWP=(modelMatrix*vec4(position,1.0)).xyz; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 topColor; uniform vec3 bottomColor; uniform float offset; uniform float exponent; varying vec3 vWP; void main(){ float h=normalize(vWP+offset).y; gl_FragColor=vec4(mix(bottomColor,topColor,pow(max(h,0.0),exponent)),1.0); }'
    });
    envScene.add(new THREE.Mesh(envGeo, envMat));
    envMap = pmremGenerator.fromScene(envScene, 0, 0.1, 200).texture;
    scene.environment = envMap;
    pmremGenerator.dispose();
    console.log('[EnvMap] Procedural fallback applied');
  });
}

// Auto-switch HDRI based on time-of-day
function updateEnvironmentForTime(timePreset) {
  const map = { 'dawn':'default', 'sunrise':'default', 'noon':'default', 'day':'default',
    'sunset':'sunset', 'dusk':'sunset', 'night':'night', 'midnight':'night',
    'overcast':'overcast', 'space':'space' };
  loadEnvironmentMap(map[timePreset] || 'default');
}

// Toggle post-processing
function togglePostProcessing(enabled) {
  ppEnabled = enabled !== undefined ? enabled : !ppEnabled;
  console.log('[PostFX] ' + (ppEnabled ? 'ON' : 'OFF'));
  return ppEnabled;
}

// Adjust bloom
function setBloomSettings(strength, radius, threshold) {
  if (!bloomPass) return;
  if (strength !== undefined) bloomPass.strength = strength;
  if (radius !== undefined) bloomPass.radius = radius;
  if (threshold !== undefined) bloomPass.threshold = threshold;
}

// Adjust SSAO
function setSSAOSettings(kernelRadius, minDist, maxDist) {
  if (!ssaoPass) return;
  if (kernelRadius !== undefined) ssaoPass.kernelRadius = kernelRadius;
  if (minDist !== undefined) ssaoPass.minDistance = minDist;
  if (maxDist !== undefined) ssaoPass.maxDistance = maxDist;
}

// Preset quality levels
function setGraphicsQuality(level) {
  switch(level) {
    case 'low':
      ppEnabled = false;
      renderer.setPixelRatio(1);
      renderer.shadowMap.enabled = false;
      return 'Graphics: LOW — max performance';
    case 'medium':
      ppEnabled = true;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25)); // Capped for performance
      renderer.shadowMap.enabled = true;
      if (ssaoPass) ssaoPass.enabled = false;
      if (bloomPass) { bloomPass.strength = 0.25; }
      return 'Graphics: MEDIUM — balanced';
    case 'high':
      ppEnabled = true;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      if (ssaoPass) ssaoPass.enabled = false; // SSAO off by default (type 'ssao on' to enable)
      if (bloomPass) { bloomPass.strength = 0.4; }
      return 'Graphics: HIGH — best quality';
    case 'ultra':
      ppEnabled = true;
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      if (ssaoPass) { ssaoPass.enabled = true; ssaoPass.kernelRadius = 16; }
      if (bloomPass) { bloomPass.strength = 0.5; bloomPass.radius = 0.7; }
      sunLight.shadow.mapSize.set(8192, 8192);
      sunLight.shadow.needsUpdate = true;
      return 'Graphics: ULTRA — maximum fidelity';
    default:
      return 'Unknown quality. Use: low, medium, high, ultra';
  }
}

if (window._loadProgress) window._loadProgress(50, "Loading assets...");
// Initialize everything
setTimeout(async () => {
  try {
    await initPostProcessing();
    loadEnvironmentMap();
    console.log('[Graphics] Full post-processing pipeline initialized');
  } catch(e) {
    console.warn('[Graphics] Post-processing init failed, falling back:', e.message);
    ppEnabled = false;
  }
}, 800);


// Sun sphere
let sunMesh = null;
function createSun() {
  if (sunMesh) return;
  const geo = new THREE.SphereGeometry(3, 32, 32);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffdd44 });
  sunMesh = new THREE.Mesh(geo, mat);
  sunMesh.position.copy(sunLight.position);
  scene.add(sunMesh);
  // Glow
  const glowGeo = new THREE.SphereGeometry(4.5, 32, 32);
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.15 });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  sunMesh.add(glow);
}

// === SKY ===
function setSky(top, bottom) {
  const c = document.createElement('canvas');
  c.width = 2; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, top);
  grad.addColorStop(0.5, bottom);
  grad.addColorStop(1, '#2a3a2a');
  g.fillStyle = grad;
  g.fillRect(0, 0, 2, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = tex;
}
setSky('#4a8ac7', '#87ceeb'); // Default blue sky
  // Init AAA Sky after short delay for module loading
  setTimeout(() => { if (Sky) createAAASky(); }, 1500);
createSun();

// === GROUND ===
function createGround(type) {
  const colors = { grass: 0x3a7a3a, dirt: 0x6b4a2a, sand: 0xc4a96a, snow: 0xd8dce8, gravel: 0x888888, stone: 0x666666, mud: 0x4a3a2a, lava: 0xcc3300, water: 0x2266aa, wood: 0x7a5530, marble: 0xddddcc, metal: 0x888899, concrete: 0x999999, asphalt: 0x333333, gold: 0xccaa22, obsidian: 0x111115, crystal: 0x8899cc, ice: 0xaaddff, rock: 0x555555 };
  const color = colors[type] || colors.grass;
  const geo = new THREE.PlaneGeometry(800, 800, 64, 64);
  
  // Smooth procedural height — layered sine waves (no visible grid)
  const pos = geo.attributes.position;
  const flatTypes = ['asphalt','concrete','metal','marble','wood','obsidian','ice','gold'];
  const isFlat = flatTypes.includes(type);
  
  // Hash function for smooth noise
  const hash = (x, y) => {
    let n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
  };
  // Smooth noise via bilinear interpolation
  const smoothNoise = (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const a = hash(ix, iy), b = hash(ix+1, iy);
    const c = hash(ix, iy+1), d = hash(ix+1, iy+1);
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    return a + (b-a)*ux + (c-a)*uy + (a-b-c+d)*ux*uy;
  };
  // Fractal noise (multiple octaves for natural terrain)
  const fbm = (x, y) => {
    return smoothNoise(x, y) * 0.5 + smoothNoise(x*2, y*2) * 0.25 + smoothNoise(x*4, y*4) * 0.125;
  };
  
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    if (isFlat) {
      pos.setZ(i, 0);
    } else {
      // Gentle rolling terrain — no harsh edges
      const height = 0; // Flat ground by default
      pos.setZ(i, height);
    }
  }
  geo.computeVertexNormals();
  
  // Per-vertex color variation for natural look (no tiling)
  const baseColor = new THREE.Color(color);
  const vertColors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const variation = (smoothNoise(x * 0.01 + 100, y * 0.01 + 100) - 0.5) * 0.015;
    const r = Math.max(0, Math.min(1, baseColor.r * (1 + variation)));
    const g = Math.max(0, Math.min(1, baseColor.g * (1 + variation * 0.9)));
    const b = Math.max(0, Math.min(1, baseColor.b * (1 + variation * 0.7)));
    vertColors[i*3] = r;
    vertColors[i*3+1] = g;
    vertColors[i*3+2] = b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(vertColors, 3));
  
  // Generate procedural normal map for surface detail
  const normalCanvas = document.createElement('canvas');
  normalCanvas.width = 512; normalCanvas.height = 512;
  const nCtx = normalCanvas.getContext('2d');
  const nData = nCtx.createImageData(512, 512);
  for (let py = 0; py < 512; py++) {
    for (let px = 0; px < 512; px++) {
      const i = (py * 512 + px) * 4;
      // Multi-scale procedural bump
      const sx = px / 512, sy = py / 512;
      const n1 = Math.sin(sx * 40) * Math.cos(sy * 40) * 0.3;
      const n2 = Math.sin(sx * 80 + 1.7) * Math.cos(sy * 80 + 2.3) * 0.15;
      const n3 = Math.sin(sx * 160 + 3.1) * Math.cos(sy * 160 + 4.7) * 0.08;
      const bump = n1 + n2 + n3;
      nData.data[i] = 128 + bump * 80;     // R = X normal
      nData.data[i+1] = 128 + bump * 80;   // G = Y normal
      nData.data[i+2] = 255;               // B = Z normal (up)
      nData.data[i+3] = 255;
    }
  }
  nCtx.putImageData(nData, 0, 0);
  const normalMap = new THREE.CanvasTexture(normalCanvas);
  normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.repeat.set(8, 8);
  
  // Roughness varies by terrain type
  const roughnessMap = { grass: 0.88, dirt: 0.92, sand: 0.95, snow: 0.85, stone: 0.78, metal: 0.35, lava: 0.4, water: 0.1, ice: 0.15, marble: 0.25, wood: 0.7, concrete: 0.85, asphalt: 0.82, crystal: 0.2, obsidian: 0.1, gold: 0.3, rock: 0.82, gravel: 0.9, mud: 0.95 };
  const metalnessMap = { metal: 0.7, gold: 0.9, obsidian: 0.3, crystal: 0.2, ice: 0.05, marble: 0.05 };
  
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: roughnessMap[type] || 0.85,
    metalness: metalnessMap[type] || 0.0,
    normalMap: normalMap,
    normalScale: new THREE.Vector2(0.5, 0.5),
    flatShading: false,
    envMapIntensity: type === 'water' || type === 'ice' || type === 'crystal' ? 1.5 : 0.8,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  mesh.userData.name = 'Ground';
  mesh.userData.isGround = true;
  return mesh;
}

let currentGround = createGround('grass');

// ══════════════════════════════════════════════════════
// TEXTURE PACK SYSTEM — Real ground textures from CDN
// Uses AmbientCG CC0 textures (no auth, free, public domain)
// ══════════════════════════════════════════════════════
const TEXTURE_PACKS = {
  grass:    { color: '#ambientcg/Grass001',    hex: 0x3a7a3a, repeat: 40, roughness: 0.95 },
  sand:     { color: '#ambientcg/Sand001',     hex: 0xc4a96a, repeat: 50, roughness: 1.0 },
  desert:   { color: '#ambientcg/Ground036',   hex: 0xb8924a, repeat: 40, roughness: 1.0 },
  snow:     { color: '#ambientcg/Snow006',     hex: 0xd8dce8, repeat: 40, roughness: 0.7 },
  dirt:     { color: '#ambientcg/Ground025',   hex: 0x6b4a2a, repeat: 40, roughness: 0.98 },
  stone:    { color: '#ambientcg/Rock022',     hex: 0x666666, repeat: 30, roughness: 0.9 },
  rock:     { color: '#ambientcg/Rock035',     hex: 0x555555, repeat: 30, roughness: 0.95 },
  mud:      { color: '#ambientcg/Ground037',   hex: 0x4a3a2a, repeat: 35, roughness: 1.0 },
  gravel:   { color: '#ambientcg/Gravel015',   hex: 0x888888, repeat: 50, roughness: 0.9 },
  concrete: { color: '#ambientcg/Concrete034', hex: 0x999999, repeat: 20, roughness: 0.85 },
  asphalt:  { color: '#ambientcg/Asphalt012',  hex: 0x333333, repeat: 15, roughness: 0.85 },
  lava:     { color: null,                     hex: 0xcc3300, repeat: 10, roughness: 0.6 },
  ice:      { color: '#ambientcg/Ice002',      hex: 0xaaddff, repeat: 30, roughness: 0.1,  metalness: 0.1 },
  marble:   { color: '#ambientcg/Marble006',   hex: 0xddddcc, repeat: 20, roughness: 0.3,  metalness: 0.05 },
  wood:     { color: '#ambientcg/WoodFloor041',hex: 0x7a5530, repeat: 20, roughness: 0.8 },
  metal:    { color: '#ambientcg/Metal032',    hex: 0x888899, repeat: 15, roughness: 0.4,  metalness: 0.7 },
  forest:   { color: '#ambientcg/Moss001',     hex: 0x2a5a2a, repeat: 40, roughness: 0.98 },
  swamp:    { color: null,                     hex: 0x3a4a2a, repeat: 35, roughness: 1.0 },
  gold:     { color: null,                     hex: 0xccaa22, repeat: 10, roughness: 0.3,  metalness: 0.8 },
  obsidian: { color: null,                     hex: 0x111115, repeat: 10, roughness: 0.1,  metalness: 0.3 },
  crystal:  { color: null,                     hex: 0x8899cc, repeat: 10, roughness: 0.05, metalness: 0.2 },
  water:    { color: null,                     hex: 0x2266aa, repeat: 20, roughness: 0.1,  metalness: 0.1 },
};

// AmbientCG texture URLs (CC0 - public domain)
const AMBIENTCG_BASE = 'https://ambientcg.com/get?file=';
const TEXTURE_URLS = {
  grass:    'Grass001_1K-JPG_Color.jpg',
  sand:     'Sand001_1K-JPG_Color.jpg',
  desert:   'Ground036_1K-JPG_Color.jpg',
  snow:     'Snow006_1K-JPG_Color.jpg',
  dirt:     'Ground025_1K-JPG_Color.jpg',
  stone:    'Rock022_1K-JPG_Color.jpg',
  rock:     'Rock035_1K-JPG_Color.jpg',
  mud:      'Ground037_1K-JPG_Color.jpg',
  gravel:   'Gravel015_1K-JPG_Color.jpg',
  concrete: 'Concrete034_1K-JPG_Color.jpg',
  asphalt:  'Asphalt012_1K-JPG_Color.jpg',
  ice:      'Ice002_1K-JPG_Color.jpg',
  marble:   'Marble006_1K-JPG_Color.jpg',
  wood:     'WoodFloor041_1K-JPG_Color.jpg',
  metal:    'Metal032_1K-JPG_Color.jpg',
  forest:   'Moss001_1K-JPG_Color.jpg',
};

const _texCache = {};
const _texLoader = new THREE.TextureLoader();

async function loadGroundTexture(type) {
  if (_texCache[type]) return _texCache[type];
  const filename = TEXTURE_URLS[type];
  if (!filename) return null;
  return new Promise((resolve) => {
    _texLoader.load(
      AMBIENTCG_BASE + filename,
      (tex) => {
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        const pack = TEXTURE_PACKS[type] || {};
        tex.repeat.set(pack.repeat || 40, pack.repeat || 40);
        tex.colorSpace = THREE.SRGBColorSpace;
        _texCache[type] = tex;
        resolve(tex);
      },
      undefined,
      () => resolve(null) // graceful fallback on error
    );
  });
}

async function applyGroundTexture(mesh, type) {
  const pack = TEXTURE_PACKS[type] || TEXTURE_PACKS.grass;
  const tex = await loadGroundTexture(type);
  if (tex) {
    mesh.material.map = tex;
    mesh.material.vertexColors = false;
    mesh.material.color.set(0xffffff);
  } else {
    // Fallback to vertex colors
    mesh.material.map = null;
    mesh.material.vertexColors = true;
  }
  mesh.material.roughness = pack.roughness ?? 0.9;
  mesh.material.metalness = pack.metalness ?? 0;
  mesh.material.needsUpdate = true;
}
// ══════════════════════════════════════════════════════
// END TEXTURE PACK SYSTEM
// ══════════════════════════════════════════════════════

let groundSize = 300; // current ground plane size
scene.add(currentGround);

// Build initial octree from ground plane
currentGround.updateMatrixWorld(true);
collisionWorld.build(currentGround, scene);

// Collision group — contains all collidable geometry (terrain, buildings, floors)
const collisionGroup = new THREE.Group();
collisionGroup.add(currentGround.clone()); // Clone so original stays in scene
scene.add(collisionGroup);
collisionGroup.visible = false; // invisible collision layer
collisionWorld._collisionGroup = collisionGroup;

// Helper: add object to collision and mark dirty
window._addToCollision = function(obj) {
  if (!obj) return;
  const clone = obj.clone();
  clone.updateMatrixWorld(true);
  // Apply world transform to clone
  clone.position.copy(obj.position);
  clone.rotation.copy(obj.rotation);
  clone.scale.copy(obj.scale);
  collisionGroup.add(clone);
  collisionWorld.markDirty();
};

let currentGroundType = 'grass';
window._currentGround = currentGround;

// === GROUND EXPANSION SYSTEM ===
function expandGround(newSize) {
  if (!newSize || newSize <= groundSize) newSize = groundSize + 200;
  // Remove old ground
  scene.remove(currentGround);
  if (currentGround.geometry) currentGround.geometry.dispose();
  if (currentGround.material) currentGround.material.dispose();
  // Get current ground type from material color
  const oldColor = currentGround.material.vertexColors ? null : currentGround.material.color;
  // Recreate with bigger size
  const colors = { grass: 0x3a7a3a, dirt: 0x6b4a2a, sand: 0xc4a96a, snow: 0xd8dce8, gravel: 0x888888, stone: 0x666666, mud: 0x4a3a2a, lava: 0xcc3300, water: 0x2266aa, wood: 0x7a5530, marble: 0xddddcc, metal: 0x888899, concrete: 0x999999, asphalt: 0x333333, gold: 0xccaa22, obsidian: 0x111115, crystal: 0x8899cc, ice: 0xaaddff, rock: 0x555555 };
  let gType = currentGroundType || 'grass';
  // Build new ground with custom size
  const geo = new THREE.PlaneGeometry(newSize, newSize, 256, 256);
  const hash = (x, y) => { let n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); };
  const smoothNoise = (x, y) => { const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy; const a = hash(ix, iy), b = hash(ix+1, iy), c2 = hash(ix, iy+1), d = hash(ix+1, iy+1); const ux = fx*fx*(3-2*fx), uy = fy*fy*(3-2*fy); return a+(b-a)*ux+(c2-a)*uy+(a-b-c2+d)*ux*uy; };
  const pos = geo.attributes.position;
  const flatTypes = ['asphalt','concrete','metal','marble','wood','obsidian','ice','gold'];
  const isFlat = flatTypes.includes(gType);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    pos.setZ(i, isFlat ? 0 : (smoothNoise(x*0.015,y*0.015)*0.5+smoothNoise(x*0.03,y*0.03)*0.25)*0.2-0.05);
  }
  geo.computeVertexNormals();
  const baseColor = new THREE.Color(colors[gType] || colors.grass);
  const vertColors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const v = (smoothNoise(x*0.01+100,y*0.01+100)-0.5)*0.015;
    vertColors[i*3] = Math.max(0,Math.min(1,baseColor.r*(1+v)));
    vertColors[i*3+1] = Math.max(0,Math.min(1,baseColor.g*(1+v*0.9)));
    vertColors[i*3+2] = Math.max(0,Math.min(1,baseColor.b*(1+v*0.7)));
  }
  geo.setAttribute('color', new THREE.BufferAttribute(vertColors, 3));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: gType === 'metal' ? 0.4 : 0, flatShading: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  mesh.userData.name = 'Ground';
  mesh.userData.isGround = true;
  currentGround = mesh;
  groundSize = newSize;
  scene.add(currentGround);
  console.log('[CrateEngine] Ground expanded to ' + newSize + 'x' + newSize);
  applyGroundTexture(currentGround, gType);
  return newSize;
}


// Grid removed — solid green ground

// === OBJECTS LIST ===
const objects = [];
window._sceneObjects = objects; // expose for collision system
// ── Wire up city-builder module with engine globals ──
setCityBuilderScene(scene);
setCityBuilderObjects(objects);
setCityBuilderRenderer(renderer);
setCityBuilderCamera(camera);
setCityBuilderControls(controls);
setCityBuilderShowToast(showToast);
setCityBuilderLoadGLBModel(loadGLBModel);
setCityBuilderParseAndExecute((...args) => parseAndExecute(...args));
// bloomPass, currentGround, and RGBELoader are set lazily — update them when they change
// We use a small interval to sync dynamic state into the city-builder module
setInterval(() => {
  setCityBuilderBloomPass(bloomPass);
  setCityBuilderRGBELoader(RGBELoader);
}, 2000);
if (window._loadProgress) window._loadProgress(90, "Almost ready...");
setTimeout(() => { if (window._hideLoading) window._hideLoading(); }, 500);

// Door animation system — smoothly open/close doors
function updateDoors(dt) {
  for (const obj of objects) {
    if (!obj) continue;
    // Check group and children for doors
    const doors = [];
    obj.traverse(child => {
      if (child.userData && child.userData.isDoor) doors.push(child);
    });
    for (const door of doors) {
      const targetAngle = door.userData.isOpen ? -Math.PI / 2 : 0; // 90° open
      const diff = targetAngle - door.rotation.y;
      if (Math.abs(diff) > 0.01) {
        door.rotation.y += diff * Math.min(1, dt * 5); // smooth 
      }
    }
  }
}
window._updateDoors = updateDoors;

// Toggle nearest door — called from character interact
window._toggleNearestDoor = function(playerPos) {
  let nearest = null;
  let nearestDist = 3; // interact range
  
  for (const obj of objects) {
    if (!obj) continue;
    obj.traverse(child => {
      if (child.userData && child.userData.isDoor) {
        const worldPos = new THREE.Vector3();
        child.getWorldPosition(worldPos);
        const dist = playerPos.distanceTo(worldPos);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearest = child;
        }
      }
    });
  }
  
  if (nearest) {
    nearest.userData.isOpen = !nearest.userData.isOpen;
    if (window._sound) window._sound.SFX.doorOpen();
    // Remove solid flag when open so player can walk through
    nearest.userData.isSolid = !nearest.userData.isOpen;
    return nearest.userData.isOpen ? '🚪 Door opened' : '🚪 Door closed';
  }
  return null;
};
let weatherSystem = null;
let rainParticles = null;
let snowParticles = null;
const colors = [0xff6b35, 0x4ade80, 0x60a5fa, 0xf472b6, 0xa78bfa, 0xfbbf24, 0x34d399, 0xf87171, 0x818cf8, 0xfb923c];
let colorIdx = 0;
function nextColor() { return colors[colorIdx++ % colors.length]; }

// === MESH FACTORIES ===
function makeMat(color, opts = {}) {
  var _r = opts.rough || opts.roughness || 0.5
  var _m = opts.metal || opts.metalness || 0.1
  var _f = opts.flat || opts.flatShading || false
  return new THREE.MeshStandardMaterial({ color, roughness: _r, metalness: _m, flatShading: _f, transparent: opts.transparent || false, opacity: opts.opacity !== undefined ? opts.opacity : 1 });
}

function createCube(color, s=1) { const m = new THREE.Mesh(new THREE.BoxGeometry(s,s,s), makeMat(color, {rough:0.4,metal:0.2})); m.castShadow=true; m.receiveShadow=true; m.position.y=s/2; return m; }
function createSphere(color, r=0.5) { const m = new THREE.Mesh(new THREE.SphereGeometry(r,32,32), makeMat(color, {rough:0.3,metal:0.4})); m.castShadow=true; m.receiveShadow=true; m.position.y=r; return m; }
function createCylinder(color, r=0.3, h=1) { const m = new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,16), makeMat(color)); m.castShadow=true; m.position.y=h/2; return m; }

function createTree(variant) {
  const g = new THREE.Group();
  const h = 2 + Math.random()*1.5;
  // Tapered trunk with slight curve
  const trunkGeo = new THREE.CylinderGeometry(0.06,0.14,h,12);
  const trunkMat = makeMat(0x5a3a1a, {rough:0.95});
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = h/2; trunk.castShadow = true; g.add(trunk);
  // Root flares
  for (let r=0;r<4;r++) {
    const a=r/4*Math.PI*2+Math.random()*0.3;
    const root = new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.06,0.3,6), trunkMat);
    root.position.set(Math.cos(a)*0.12,0.1,Math.sin(a)*0.12);
    root.rotation.z=Math.cos(a)*0.6; root.rotation.x=Math.sin(a)*0.6;
    g.add(root);
  }
  // Branches
  for (let b=0;b<3;b++) {
    const by = h*0.5+b*h*0.15;
    const ba = Math.random()*Math.PI*2;
    const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.015,0.04,0.6,6), trunkMat);
    branch.position.set(Math.cos(ba)*0.15, by, Math.sin(ba)*0.15);
    branch.rotation.z = Math.cos(ba)*0.8;
    branch.rotation.x = Math.sin(ba)*0.8;
    branch.castShadow = true; g.add(branch);
  }
  // Foliage: layered clusters of different sizes
  const leafColors = [0x2d8a4e, 0x3aad5e, 0x1a6a3e, 0x4ac06a, 0x228b22];
  const lc = leafColors[Math.floor(Math.random()*leafColors.length)];
  const leafMat = makeMat(lc, {rough:0.85});
  // Main canopy - large center sphere
  const main = new THREE.Mesh(new THREE.SphereGeometry(0.7+Math.random()*0.3, 16, 12), leafMat);
  main.position.y = h+0.2; main.scale.y = 0.75; main.castShadow = true; g.add(main);
  // Secondary clusters around
  for (let i=0;i<5;i++) {
    const a = i/5*Math.PI*2;
    const cr = 0.3+Math.random()*0.25;
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(cr, 12, 10), makeMat(lc+Math.floor(Math.random()*0x111111), {rough:0.85}));
    leaf.position.set(Math.cos(a)*0.5, h-0.1+Math.random()*0.5, Math.sin(a)*0.5);
    leaf.castShadow = true; g.add(leaf);
  }
  // Top cluster
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 10), leafMat);
  top.position.y = h+0.7; top.castShadow = true; g.add(top);
  return g;
}



function createRock(big) {
  const g = new THREE.Group();
  const r = big ? 0.6+Math.random()*0.8 : 0.2+Math.random()*0.3;
  const rockColor = 0x555555+Math.floor(Math.random()*0x333333);
  // Main body - deformed sphere for organic look
  const geo = new THREE.SphereGeometry(r, 12, 10);
  const pos = geo.attributes.position;
  for (let i=0;i<pos.count;i++) {
    const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
    const noise = (Math.sin(x*5)*Math.cos(z*3)+Math.sin(y*7))*r*0.15;
    pos.setX(i, x+noise*0.5);
    pos.setY(i, y*0.6+noise*0.3);
    pos.setZ(i, z+noise*0.4);
  }
  geo.computeVertexNormals();
  const mat = makeMat(rockColor, {rough:0.9});
  const main = new THREE.Mesh(geo, mat);
  main.position.y = r*0.4; main.castShadow=true; main.receiveShadow=true; g.add(main);
  // Smaller detail rocks
  if (big) {
    for (let i=0;i<3;i++) {
      const sr = r*0.3+Math.random()*r*0.2;
      const sg = new THREE.SphereGeometry(sr, 8, 6);
      const sp = sg.attributes.position;
      for (let j=0;j<sp.count;j++) { sp.setY(j, sp.getY(j)*0.5); }
      sg.computeVertexNormals();
      const sm = new THREE.Mesh(sg, makeMat(rockColor+Math.floor(Math.random()*0x111111), {rough:0.92}));
      sm.position.set((Math.random()-0.5)*r, sr*0.2, (Math.random()-0.5)*r);
      sm.rotation.y = Math.random()*Math.PI;
      sm.castShadow=true; g.add(sm);
    }
  }
  return g;
}

function createGrass(count) {
  const g = new THREE.Group();
  const mat = makeMat(0x3a8a3a, {rough:0.9});
  for (let i = 0; i < (count||20); i++) {
    const blade = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.2+Math.random()*0.2), mat);
    blade.position.set((Math.random()-0.5)*3, 0.1, (Math.random()-0.5)*3);
    blade.rotation.y = Math.random()*Math.PI;
    blade.rotation.x = -0.1+Math.random()*0.2;
    g.add(blade);
  }
  return g;
}

function createFlower() {
  const g = new THREE.Group();
  const stemMat = makeMat(0x2a7a2a);
  // Stem with slight curve
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.45, 8), stemMat);
  stem.position.y = 0.22; g.add(stem);
  // Leaf on stem
  const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), makeMat(0x338833));
  leaf.position.set(0.04, 0.2, 0); leaf.scale.set(1.5, 0.3, 0.8); g.add(leaf);
  // Flower center
  const petalColors = [0xff6699, 0xffaa33, 0xff4444, 0xaa44ff, 0x44aaff, 0xffff44, 0xff88cc, 0xcc44ff];
  const pc = petalColors[Math.floor(Math.random()*petalColors.length)];
  const center = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), makeMat(0xffcc00));
  center.position.y = 0.47; g.add(center);
  // Petals (tear-drop shaped)
  const petalMat = makeMat(pc, {rough:0.6});
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const petal = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), petalMat);
    petal.position.set(Math.cos(a) * 0.06, 0.47, Math.sin(a) * 0.06);
    petal.scale.set(1.3, 0.4, 0.8);
    // Orient petal outward
    petal.lookAt(Math.cos(a) * 2, 0.47, Math.sin(a) * 2);
    g.add(petal);
  }
  return g;
}

function createHouse(color) {
  const g = new THREE.Group();
  const c = color || 0x8B7355;
  const wallMat = makeMat(c, {rough:0.85});
  const roofMat = makeMat(0x8B1A1A, {rough:0.75});
  const woodMat = makeMat(0x5a3a1a, {rough:0.9});
  const glassMat = makeMat(0x88ccff, {rough:0.1, metal:0.3});
  // Foundation
  const foundation = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.15, 2.3), makeMat(0x666666, {rough:0.9}));
  foundation.position.y = 0.075; foundation.receiveShadow=true; g.add(foundation);
  // Walls
  const walls = new THREE.Mesh(new THREE.BoxGeometry(2, 1.6, 2), wallMat);
  walls.position.y = 0.95; walls.castShadow=true; walls.receiveShadow=true; g.add(walls);
  // Roof
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.8, 1.2, 4), roofMat);
  roof.position.y = 2.35; roof.rotation.y = Math.PI/4; roof.castShadow=true; g.add(roof);
  // Roof overhang
  const overhang = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.05, 2.4), roofMat);
  overhang.position.y = 1.76; g.add(overhang);
  // Door
  const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.08), woodMat);
  doorFrame.position.set(0, 0.6, 1.02); g.add(doorFrame);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.82, 0.04), makeMat(0x3a2010));
  door.position.set(0, 0.6, 1.05); g.add(door);
  // Door handle
  const handle = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 6), makeMat(0xccaa22, {metal:0.8}));
  handle.position.set(0.12, 0.55, 1.08); g.add(handle);
  // Windows (front)
  [-0.55, 0.55].forEach(x => {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.35, 0.06), woodMat);
    frame.position.set(x, 1.15, 1.01); g.add(frame);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.27), glassMat);
    glass.position.set(x, 1.15, 1.04); g.add(glass);
    // Window cross
    const hbar = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.02, 0.02), woodMat);
    hbar.position.set(x, 1.15, 1.05); g.add(hbar);
    const vbar = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.27, 0.02), woodMat);
    vbar.position.set(x, 1.15, 1.05); g.add(vbar);
  });
  // Side windows
  [-0.3, 0.3].forEach(z => {
    [1, -1].forEach(side => {
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.25), glassMat);
      glass.position.set(side*1.01, 1.15, z);
      glass.rotation.y = Math.PI/2;
      g.add(glass);
    });
  });
  // Chimney
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.7, 0.3), makeMat(0x884444, {rough:0.85}));
  chimney.position.set(0.5, 2.3, -0.3); chimney.castShadow=true; g.add(chimney);
  const chimneyTop = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.06, 0.38), makeMat(0x666666));
  chimneyTop.position.set(0.5, 2.68, -0.3); g.add(chimneyTop);
  // Steps
  const step1 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 0.25), makeMat(0x777777));
  step1.position.set(0, 0.19, 1.2); g.add(step1);
  const step2 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.08, 0.15), makeMat(0x777777));
  step2.position.set(0, 0.11, 1.35); g.add(step2);
  return g;
}

// === BUILDING SYSTEM extracted to buildings.mjs ===
// === TERRAIN SYSTEM ===
var terrainMesh = null;

function createTerrain(type, params) {
  params = params || {};
  // Remove ground plane when creating terrain (avoid overlap)
  if (currentGround) { scene.remove(currentGround); currentGround = null; }
  var size = params.size || 200;
  var segments = params.segments || 128;
  var heightScale = params.height || 1.0;
  
  if (terrainMesh) { scene.remove(terrainMesh); terrainMesh.geometry.dispose(); terrainMesh.material.dispose(); terrainMesh = null; }
  
  var geo = new THREE.PlaneGeometry(size, size, segments, segments);
  var pos = geo.attributes.position;
  
  // Better noise functions
  var _h = (x, y) => { var n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); };
  var _sn = (x, y) => {
    var ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    var ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    var a = _h(ix, iy), b = _h(ix+1, iy), c = _h(ix, iy+1), d = _h(ix+1, iy+1);
    return a + (b-a)*ux + (c-a)*uy + (a-b-c+d)*ux*uy;
  };
  var fbm = (x, y, oct) => {
    var v = 0, amp = 0.5, freq = 1;
    for (var o = 0; o < (oct||6); o++) { v += _sn(x*freq, y*freq) * amp; amp *= 0.5; freq *= 2.0; }
    return v;
  };
  // Ridge noise for sharp mountain peaks
  var ridge = (x, y, oct) => {
    var v = 0, amp = 0.5, freq = 1;
    for (var o = 0; o < (oct||5); o++) {
      var n = 1.0 - Math.abs(_sn(x*freq, y*freq) * 2 - 1);
      n = n * n; // sharpen ridges
      v += n * amp; amp *= 0.5; freq *= 2.1;
    }
    return v;
  };

  var maxH = 0;
  
  if (type === 'mountains' || type === 'mountain') {
    // Dramatic mountain range with peaks, ridges, valleys
    for (var i = 0; i < pos.count; i++) {
      var x = pos.getX(i) * 0.008, y = pos.getY(i) * 0.008;
      var h = ridge(x, y, 6) * 20 + fbm(x*2, y*2, 4) * 5 - 2;
      // Add some big peaks
      h += Math.max(0, ridge(x*0.7+5, y*0.7+3, 5) - 0.3) * 15;
      h *= heightScale;
      pos.setZ(i, h);
      if (h > maxH) maxH = h;
    }
  } else if (type === 'hills' || type === 'rolling') {
    // Gentle rolling hills
    for (var i = 0; i < pos.count; i++) {
      var x = pos.getX(i) * 0.012, y = pos.getY(i) * 0.012;
      var h = fbm(x, y, 5) * 18 + fbm(x*3, y*3, 3) * 4;
      h *= heightScale;
      pos.setZ(i, h);
      if (h > maxH) maxH = h;
    }
  } else if (type === 'valley') {
    for (var i = 0; i < pos.count; i++) {
      var x = pos.getX(i), y = pos.getY(i);
      var dist = Math.abs(x) / (size * 0.3);
      var wallH = Math.min(1, dist) * 35 + fbm(x*0.01, y*0.01, 4) * 8;
      var floor = fbm(x*0.02, y*0.015, 3) * 3;
      pos.setZ(i, (dist < 0.3 ? floor : wallH) * heightScale);
      if (pos.getZ(i) > maxH) maxH = pos.getZ(i);
    }
  } else if (type === 'crater' || type === 'volcano') {
    for (var i = 0; i < pos.count; i++) {
      var x = pos.getX(i), y = pos.getY(i);
      var dist = Math.sqrt(x*x + y*y);
      var rim = Math.max(0, 1 - Math.abs(dist - size*0.15) / (size*0.05));
      var outer = Math.max(0, 1 - dist / (size*0.4));
      var h = (rim * 30 + outer * outer * 15 + fbm(x*0.02, y*0.02, 3) * 3) * heightScale;
      pos.setZ(i, h);
      if (h > maxH) maxH = h;
    }
  } else if (type === 'island') {
    for (var i = 0; i < pos.count; i++) {
      var x = pos.getX(i), y = pos.getY(i);
      var dist = Math.sqrt(x*x + y*y) / (size*0.35);
      var falloff = Math.max(0, 1 - dist);
      falloff = falloff * falloff * (3 - 2*falloff); // smoothstep
      var noise = fbm(x*0.015, y*0.015, 5);
      var h = falloff * (noise * 25 + 10) * heightScale;
      pos.setZ(i, Math.max(-2, h - 3)); // water level at ~0
      if (h > maxH) maxH = h;
    }
  } else if (type === 'canyon') {
    for (var i = 0; i < pos.count; i++) {
      var x = pos.getX(i), y = pos.getY(i);
      var path = Math.sin(y * 0.015) * 30 + Math.sin(y * 0.007) * 50;
      var distFromPath = Math.abs(x - path);
      var wall = Math.min(1, distFromPath / 25);
      var h = (wall * wall * 30 + fbm(x*0.01, y*0.01, 4) * 5) * heightScale;
      pos.setZ(i, h);
      if (h > maxH) maxH = h;
    }
  } else if (type === 'dunes' || type === 'desert') {
    for (var i = 0; i < pos.count; i++) {
      var x = pos.getX(i) * 0.01, y = pos.getY(i) * 0.01;
      var h = (Math.sin(x*3+y*1.5)*0.5+0.5) * 12 + fbm(x*2, y*2, 4) * 6;
      h *= heightScale;
      pos.setZ(i, h);
      if (h > maxH) maxH = h;
    }
  } else if (type === 'plateau') {
    for (var i = 0; i < pos.count; i++) {
      var x = pos.getX(i) * 0.008, y = pos.getY(i) * 0.008;
      var h = fbm(x, y, 5);
      h = h > 0.45 ? 20 + (h-0.45)*10 : h * 8; // flat tops with cliffs
      h += fbm(x*4, y*4, 2) * 2; // detail
      pos.setZ(i, h * heightScale);
      if (h > maxH) maxH = h;
    }
  } else if (type === 'cliff' || type === 'cliffs') {
    for (var i = 0; i < pos.count; i++) {
      var x = pos.getX(i), y = pos.getY(i);
      var edge = 1 / (1 + Math.exp(-(x * 0.08))); // sigmoid cliff
      var h = edge * 35 + fbm(x*0.01, y*0.01, 4) * 8;
      pos.setZ(i, h * heightScale);
      if (h > maxH) maxH = h;
    }
  } else if (type === 'sand' || type === 'beach') {
    // Sand/beach — completely flat
    for (var i = 0; i < pos.count; i++) {
      pos.setZ(i, 0);
    }
  } else if (type === 'flat' || type === 'plain' || type === 'plains') {
    // Completely flat terrain — zero height
    for (var i = 0; i < pos.count; i++) {
      pos.setZ(i, 0);
    }
    maxH = 0.1;
  } else {
    // flat/plains — very subtle undulation
    for (var i = 0; i < pos.count; i++) {
      pos.setZ(i, fbm(pos.getX(i)*0.005, pos.getY(i)*0.005, 3) * 1.5);
    }
  }
  
  geo.computeVertexNormals();
  
  // Color by height with gradient
  var vertColors = new Float32Array(pos.count * 3);
  var grassCol = new THREE.Color(0x3a7a2a);
  var rockCol = new THREE.Color(0x666655);
  var snowCol = new THREE.Color(0xeeeef0);
  var sandCol = new THREE.Color(0xc4a96a);
  var darkGrass = new THREE.Color(0x2a5a1a);
  
  var colorScheme = 'natural';
  if (type === 'dunes' || type === 'desert' || type === 'sand') colorScheme = 'desert';
  else if (type === 'volcano') colorScheme = 'volcanic';
  else if (type === 'island') colorScheme = 'tropical';
  
  for (var i = 0; i < pos.count; i++) {
    var h = pos.getZ(i);
    var t = maxH > 0 ? h / maxH : 0;
    var c = new THREE.Color();
    if (colorScheme === 'desert') {
      if (type === 'sand' || type === 'beach') {
        c.copy(sandCol); // Uniform sand color for beach
      } else {
        c.lerpColors(sandCol, rockCol, Math.min(1, t * 1.5));
      }
    } else if (colorScheme === 'volcanic') {
      var lavaCol = new THREE.Color(0xcc3300);
      c.lerpColors(lavaCol, rockCol, Math.min(1, t * 2));
    } else if (colorScheme === 'tropical') {
      // Tropical island: sand at edges → grass → dark grass on peak (NO SNOW)
      var tropicalSand = new THREE.Color(0xd4b483);
      var tropicalGrass = new THREE.Color(0x4a9a3a);
      var tropicalDark = new THREE.Color(0x2a6a1a);
      if (h < 1) c.copy(tropicalSand); // beach/water level
      else if (t < 0.2) c.lerpColors(tropicalSand, tropicalGrass, t / 0.2);
      else if (t < 0.7) c.lerpColors(tropicalGrass, tropicalDark, (t - 0.2) / 0.5);
      else c.lerpColors(tropicalDark, rockCol, (t - 0.7) / 0.3);
    } else {
      // Natural: dark grass → grass → rock → snow
      if (t < 0.15) c.lerpColors(darkGrass, grassCol, t / 0.15);
      else if (t < 0.5) c.lerpColors(grassCol, rockCol, (t - 0.15) / 0.35);
      else if (t < 0.75) c.lerpColors(rockCol, snowCol, (t - 0.5) / 0.25);
      else c.copy(snowCol);
    }
    // Add noise variation (skip for sand/beach to avoid dark patches)
    var nv = (type === 'sand' || type === 'beach') ? 0 : (fbm(pos.getX(i)*0.05, pos.getY(i)*0.05, 2) - 0.3) * 0.08;
    vertColors[i*3] = Math.max(0, Math.min(1, c.r + nv));
    vertColors[i*3+1] = Math.max(0, Math.min(1, c.g + nv));
    vertColors[i*3+2] = Math.max(0, Math.min(1, c.b + nv));
  }
  geo.setAttribute('color', new THREE.BufferAttribute(vertColors, 3));
  
  var mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.88,
    metalness: 0.02,
    flatShading: false,
    side: THREE.DoubleSide
  });
  
  terrainMesh = new THREE.Mesh(geo, mat);
  window._terrainMesh = terrainMesh;
  terrainMesh.rotation.x = -Math.PI / 2;
  terrainMesh.receiveShadow = true;
  terrainMesh.castShadow = true;
  terrainMesh.userData.name = 'Terrain_' + type;
  terrainMesh.userData.isTerrain = true;
  scene.add(terrainMesh);
  
  // Rebuild collision octree from terrain
  terrainMesh.updateMatrixWorld(true);
  // Replace ground in collision group with terrain
  if (collisionWorld._collisionGroup) {
    const cg = collisionWorld._collisionGroup;
    while (cg.children.length) cg.remove(cg.children[0]);
    const terrainClone = terrainMesh.clone();
    terrainClone.position.copy(terrainMesh.position);
    terrainClone.rotation.copy(terrainMesh.rotation);
    terrainClone.scale.copy(terrainMesh.scale);
    cg.add(terrainClone);
    collisionWorld.rebuildFromGroup(cg);
  } else {
    collisionWorld.build(terrainMesh, scene);
  }
  logOutput('✓ Collision octree built from terrain', 'ok');
  
  // Hide the flat ground + grid
  if (currentGround) currentGround.visible = false;
  
  // Auto-position camera to see the terrain
  var camDist = size * 0.4;
  var camH = maxH * 1.5 + 20;
  camera.position.set(camDist * 0.7, camH, camDist * 0.7);
  controls.target.set(0, maxH * 0.3, 0);
  controls.update();
  
  logOutput('✓ Terrain: ' + type + ' — ' + segments + '×' + segments + ' verts, peak height ' + Math.round(maxH) + 'm', 'ok');
  return terrainMesh;
}


// === MOUNTAIN PROP (for backdrop) ===
function createMountainProp() {
  var group = new THREE.Group();
  // Random mountain shape using cones and noise
  var peaks = 2 + Math.floor(Math.random() * 3);
  for (var p = 0; p < peaks; p++) {
    var h = 15 + Math.random() * 25;
    var r = 8 + Math.random() * 12;
    var geo = new THREE.ConeGeometry(r, h, 8 + Math.floor(Math.random() * 8), 4);
    // Deform vertices for natural look
    var pos = geo.attributes.position;
    for (var i = 0; i < pos.count; i++) {
      var x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      var noise = Math.sin(x * 0.5) * Math.cos(z * 0.5) * 2 + Math.sin(y * 0.3) * 1.5;
      pos.setX(i, x + noise * 0.3);
      pos.setZ(i, z + noise * 0.3);
    }
    geo.computeVertexNormals();
    // Height-based coloring
    var vertColors = new Float32Array(pos.count * 3);
    var grass = new THREE.Color(0x3a6b2a);
    var rock = new THREE.Color(0x666655);
    var snow = new THREE.Color(0xeeeef0);
    for (var i = 0; i < pos.count; i++) {
      var y = pos.getY(i);
      var t = (y + h/2) / h;
      var c = new THREE.Color();
      if (t < 0.4) c.lerpColors(grass, rock, t / 0.4);
      else if (t < 0.7) c.lerpColors(rock, snow, (t - 0.4) / 0.3);
      else c.copy(snow);
      vertColors[i*3] = c.r; vertColors[i*3+1] = c.g; vertColors[i*3+2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(vertColors, 3));
    var mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.position.set((Math.random()-0.5) * r * 0.8, h/2, (Math.random()-0.5) * r * 0.8);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

// === LIGHTING SYSTEM ===
var userLights = [];

function addPointLight(x, y, z, color, intensity, range) {
  color = color || 0xff6b35;
  intensity = intensity || 2;
  range = range || 10;
  var light = new THREE.PointLight(color, intensity, range);
  light.position.set(x || 0, y || 3, z || 0);
  light.castShadow = true;
  scene.add(light);
  // Visual marker
  var marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.15),
    new THREE.MeshBasicMaterial({ color: color })
  );
  marker.position.copy(light.position);
  marker.userData.name = 'Light';
  marker.userData._light = light;
  scene.add(marker);
  objects.push(marker);
  userLights.push({ light: light, marker: marker });
  return light;
}

function addSpotLight(x, y, z, targetX, targetY, targetZ, color) {
  color = color || 0xffffff;
  var light = new THREE.SpotLight(color, 3, 20, Math.PI/6, 0.3);
  light.position.set(x || 0, y || 8, z || 0);
  light.target.position.set(targetX || 0, targetY || 0, targetZ || 0);
  light.castShadow = true;
  scene.add(light);
  scene.add(light.target);
  var marker = new THREE.Mesh(
    new THREE.ConeGeometry(0.15, 0.3, 8),
    new THREE.MeshBasicMaterial({ color: color })
  );
  marker.position.copy(light.position);
  marker.userData.name = 'Spotlight';
  marker.userData._light = light;
  scene.add(marker);
  objects.push(marker);
  userLights.push({ light: light, marker: marker });
  return light;
}

// === NLP COMMAND PARSER ===
// Bridge: expose for command bus (Engine 2.0)


// ══════════════════════════════════════════════════════
// COMPREHENSIVE COMMAND REFERENCE PAGE
// ══════════════════════════════════════════════════════
function showCommandPage() {
  const existing = document.getElementById('cmd-page-modal');
  if (existing) { existing.remove(); return; }

  const categories = [
    { icon: '🌍', name: 'World & Terrain', cmds: [
      'terrain flat / hills / mountains / desert / island / canyon / volcanic / arctic',
      'ground grass / dirt / sand / snow / stone / concrete / asphalt / lava / mud / forest',
      'ground rock / marble / metal / wood / ice / obsidian / crystal / gravel',
      'I want a desert land / grass land / snowy world / forest land / volcanic land / swamp land',
      'mountains / rolling hills / canyon / volcano / desert dunes / arctic plains',
      'generate desert city / snow city / jungle city / swamp city',
      'generate world / auto town / build a town',
    ]},
    { icon: '🌅', name: 'Sky & Lighting', cmds: [
      'time dawn / sunrise / morning / noon / afternoon / sunset / dusk / night / midnight',
      'aaa sky / realistic sky / sunrise / sunset sky',
      'set ambient [0-1] / ambient brightness [0-1]',
      'sun intensity [0-5] / sun color [hex] / shadow softness [0-5]',
      'bloom on/off / bloom [0-5] / grain [0-1]',
      'add god rays / disable god rays / add lens flare',
    ]},
    { icon: '🌦️', name: 'Weather & Atmosphere', cmds: [
      'fog on/off / fog [0.001-0.05]',
      'make it rain / stop rain / heavy rain / drizzle',
      'make it snow / stop snow / blizzard',
      'clear weather / storm',
      'particles dust / fireflies / embers / ash / leaves / snow / spores',
    ]},
    { icon: '🏔️', name: 'Water', cmds: [
      'add water / add ocean / add river / add pool / add lake / add swimming',
      'water calm / tropical / stormy / arctic / blood / lava / crystal',
    ]},
    { icon: '🧑', name: 'Characters', cmds: [
      'play as knight / swat / soldier / casual / suit / witch / medieval / scifi / beach / spacesuit',
      'equip sword / axe / rifle / pistol / shotgun / bow / spear / hammer / dagger / katana / staff',
      'spawn [N] npcs / spawn [N] enemies / spawn [N] guards',
      'spawn npc zombie / woman / man / knight / soldier',
      'add npc [type] at [x,y,z] / npc say [text]',
      'add quest giver npc / add shopkeeper npc / add merchant npc',
      'npc [name] has quest [name] / add npc dialogue',
    ]},
    { icon: '🏗️', name: 'Buildings & Structures', cmds: [
      'add modern house / add modern house 2 floors',
      'build a city / build downtown / build residential area',
      'build a dungeon / build a cave / build interior',
      'add skyscraper / add tower / add castle / add ruins',
      'add traffic light / add street lamp / add fire hydrant',
      'add road / add roads / add park / add commercial area',
    ]},
    { icon: '📦', name: 'Models & Props (857 Unity + 3400 base)', cmds: [
      '── FLOODED/POST-APOC ──',
      'add unity_villa1_ext_b / add unity_villa2_ext_a / add unity_church1_mid_a / add unity_barn2_mid_a',
      'add unity_bld_bridge_a / add unity_lo_prop_car_a / add unity_lo_prop_boat_a',
      '── TOON CITY ──',
      'add toon_apartment / add toon_city_hall / add helicopter / add toon_park / add toon_ambulance',
      '── SPACE/SCI-FI ──',
      'add space_fighter / add spaceship / add unity_capitalship_shield / add space_rifle',
      '── MEDIEVAL/FANTASY ──',
      'add knight_character / add dark_knight / add zombie / add unity_sword5_3 / add unity_shield_evo_02_v1',
      'add unity_pt_pine_tree_03_green / add unity_pt_wooden_bridge_02 / add unity_pt_ore_rock_01',
      '── FPS WEAPONS ──',
      'add unity_akm / add unity_revolver / add unity_crossbow / add pistol / add medieval_sword_fps',
      'add unity_fp_doublebarlshotgun / add unity_fp_huntingrifle / add unity_fp_arms_akm',
      '── NATURE ──',
      'add infini_twist_tree / add fern / add infini_mushrooms / add infini_fern / add infini_lily',
      '── VEHICLES ──',
      'add touring_race_car / add toon_ambulance / add unity_lo_prop_car_a',
      '── BASE MODELS (3400+) ──',
      'add tree / add pine / add palm / add rock / add boulder / add bench / add chair / add table',
      'add car / add taxi / add police car / add ambulance / add truck / add bus',
      'add chest / add barrel / add crate / add torch / add campfire',
    ]},
    { icon: '🚗', name: 'Vehicles', cmds: [
      'add car / add vehicle [type] / drive car / enter vehicle / exit vehicle',
      'add traffic / add ai cars / add pedestrians',
      'add touring_race_car / add toon_ambulance',
    ]},
    { icon: '⚔️', name: 'Combat & Systems', cmds: [
      'add shooting / add combat system / add melee combat',
      'add health system / set health [100] / heal / add respawn',
      'add damage system / add enemy ai / set enemy aggro range [20]',
      'add knockback / add stagger / add death animation',
      'zombie game / racing mode / rpg mode / survival mode / fps mode / horror mode',
    ]},
    { icon: '🎒', name: 'Inventory & Items', cmds: [
      'add inventory / open inventory / inventory grid 4x4',
      'add item [name] to inventory / equip [item] / drop item / use item',
      'inventory hotbar / show backpack / add loot system',
      'add health potion / add armor item / add stamina item',
      'add crafting / add shop / add vendor / add buy menu',
    ]},
    { icon: '💬', name: 'Dialogue & Quests', cmds: [
      'npc say [text] / npc [name] say [text]',
      'add quest / add quest [name]',
      'quest objective: kill [N] [type] / collect [N] [item] / reach [location]',
      'quest reward: [item] / complete quest / fail quest',
      'add dialogue tree / add dialogue option [text]',
      'add skill tree / add experience system / add leveling',
      'gain xp [amount] / unlock achievement [name]',
    ]},
    { icon: '📺', name: 'HUD & Menus', cmds: [
      'add HUD / hide HUD / toggle HUD',
      'add health bar / add stamina bar / add ammo counter / add minimap / add compass',
      'add kill counter / add score display / add timer / add wave counter / add xp bar',
      'add main menu / add pause menu / add settings menu',
      'add game over screen / add victory screen / add loading screen',
      'add crosshair / hide crosshair / crosshair dot/cross/circle',
    ]},
    { icon: '🎬', name: 'Cutscenes & Cinematics', cmds: [
      'add cutscene / start cutscene / end cutscene',
      'cinematic mode / letterbox on/off',
      'camera pan to [x,y,z] in [seconds] / camera orbit / camera fly through',
      'add intro cutscene / add outro cutscene',
      'add slow motion / slow motion [0.1-1.0] / normal speed',
      'freeze frame / add black fade / add white fade',
    ]},
    { icon: '🏆', name: 'Win/Lose Conditions', cmds: [
      'add win condition / win if kill [N] enemies / win if collect [N] items',
      'win if reach [location] / win if survive [N] seconds / win if score [N] points',
      'add lose condition / lose if health 0 / add timer countdown [seconds]',
      'add checkpoint / add respawn point / add lives system / set lives [N]',
      'add score system / add high score',
    ]},
    { icon: '🔊', name: 'Audio', cmds: [
      'add background music / play music epic/calm/horror/action/ambient',
      'add ambient sound / stop music / fade music out',
      'add footstep sounds / add combat sounds / add explosion sounds',
      'add spatial audio / audio range [meters]',
      'add rain sound / add wind sound / add crowd sound',
      'mute / unmute / volume [0-1]',
    ]},
    { icon: '✨', name: 'Polish & Post-Processing', cmds: [
      '── VISUAL EFFECTS ──',
      'bloom on/off / bloom [0-5]',
      'vignette [0-1] (edge darkening)',
      'chromatic aberration [0-0.01]',
      'grain [0-1] (film grain)',
      'depth of field on/off / dof focus [distance]',
      'motion blur on/off',
      'ssao on/off (ambient occlusion)',
      '── COLOR GRADING ──',
      'color grade cinematic / warm / cool / horror / noir / vivid / neutral',
      'contrast [0.5-2.0] / saturation [0-2] / brightness [0-2]',
      '── QUALITY ──',
      'graphics low / medium / high / ultra',
      'anti-aliasing on/off / fxaa / smaa',
      'shadow quality low/medium/high/ultra',
      'performance mode / quality mode / lod on/off',
      'add god rays / add lens flare',
    ]},
    { icon: '🎮', name: 'Game Presets', cmds: [
      'zombie game — survival horror with waves',
      'racing mode — race track, cars, timer',
      'rpg mode — fantasy world, quests, inventory',
      'survival mode — hunger, inventory, crafting',
      'fps mode — shooter with weapons, enemies',
      'horror mode — dark, fog, jump scares',
      'city builder mode — construction mechanics',
      'sandbox mode — free creative mode',
    ]},
    { icon: '📷', name: 'Camera', cmds: [
      'fps mode / tps mode',
      'add first person camera / add third person camera / add cinematic camera',
      'camera distance [meters] / camera height [meters]',
      'camera shake on/off / screen shake [intensity]',
      'zoom in / zoom out / fov [60-120]',
    ]},
    { icon: '🌐', name: 'Multiplayer', cmds: [
      'multiplayer / join [room] / host game / create room',
      'chat [message] / broadcast [message]',
      'sync players / add netcode',
      'wss://crate-engine-mp.fly.dev (default server)',
    ]},
    { icon: '📥', name: 'Import & Save', cmds: [
      'import model [URL] — load any GLB from web',
      'import my model — open file picker for local GLB',
      'use my model as [name] — register with alias',
      'place my model / place imported model',
      'save / load / clear / new game',
      'auto save / add checkpoint / export world',
    ]},
    { icon: '🔧', name: 'Utility', cmds: [
      'clear / reset / help / commands',
      'stats / show stats / fps counter on',
      'show buildings / show weapons / show characters / show vehicles / show trees',
      'heal / respawn / teleport [x,y,z]',
      'performance mode / optimize scene',
      'inspect — click any object to select & edit',
      'clone — duplicate selected object',
      'delete — remove selected object',
    ]},
  ];

  const modal = document.createElement('div');
  modal.id = 'cmd-page-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:99999;display:flex;flex-direction:column;font-family:-apple-system,BlinkMacSystemFont,sans-serif;overflow:hidden;backdrop-filter:blur(4px)';

  const header = `
    <div style="padding:16px 20px;background:#0a0a0a;border-bottom:1px solid #1a1a1a;display:flex;align-items:center;gap:12px;flex-shrink:0">
      <div style="font-size:1.5rem">⌨️</div>
      <div style="flex:1">
        <div style="font-size:1.1rem;font-weight:700;color:#fff">Command Reference</div>
        <div style="font-size:0.7rem;color:#555">All ${categories.reduce((s,c)=>s+c.cmds.length,0)}+ commands — click any command to run it</div>
      </div>
      <input id="cmd-search" placeholder="Search commands..." style="background:#111;border:1px solid #333;border-radius:8px;padding:8px 12px;color:#fff;font-size:0.82rem;width:200px;outline:none" oninput="window._filterCmds(this.value)">
      <button onclick="document.getElementById('cmd-page-modal').remove()" style="background:none;border:1px solid #333;color:#888;padding:6px 12px;border-radius:8px;cursor:pointer;font-size:0.85rem" onmouseenter="this.style.borderColor='#ff6b35';this.style.color='#ff6b35'" onmouseleave="this.style.borderColor='#333';this.style.color='#888'">✕ Close</button>
    </div>`;

  let bodyHtml = '<div id="cmd-body" style="flex:1;overflow-y:auto;padding:16px;display:grid;grid-template-columns:repeat(auto-fill,minmax(380px,1fr));gap:12px;align-content:start">';
  
  for (const cat of categories) {
    bodyHtml += `<div class="cmd-cat" style="background:#0d0d0d;border:1px solid #1a1a1a;border-radius:12px;overflow:hidden">`;
    bodyHtml += `<div style="padding:10px 14px;background:rgba(255,107,53,0.06);border-bottom:1px solid #1a1a1a;display:flex;align-items:center;gap:8px">`;
    bodyHtml += `<span style="font-size:1rem">${cat.icon}</span><span style="font-weight:700;color:#ff6b35;font-size:0.82rem;text-transform:uppercase;letter-spacing:1px">${cat.name}</span>`;
    bodyHtml += `</div><div style="padding:10px">`;
    for (const cmd of cat.cmds) {
      if (cmd.startsWith('──') || cmd.startsWith('─')) {
        bodyHtml += `<div class="cmd-divider" style="color:#444;font-size:0.65rem;margin:6px 0 4px;letter-spacing:2px">${cmd}</div>`;
      } else {
        const parts = cmd.split('/').map(p => p.trim());
        const firstCmd = parts[0].split(' ')[0] === parts[0].split(' ')[0] ? parts[0] : cmd;
        bodyHtml += `<div class="cmd-line" data-cmd="${cmd.replace(/"/g,"&quot;")}" style="padding:3px 6px;margin:1px 0;border-radius:5px;cursor:pointer;font-size:0.72rem;color:#aaa;transition:all 0.15s;line-height:1.5" onmouseenter="this.style.background='rgba(255,107,53,0.1)';this.style.color='#ff6b35'" onmouseleave="this.style.background='transparent';this.style.color='#aaa'" onclick="window._runCmdFromPage('${cmd.replace(/'/g,"\'").split(' /')[0].trim()}')">${cmd}</div>`;
      }
    }
    bodyHtml += `</div></div>`;
  }
  bodyHtml += '</div>';

  modal.innerHTML = header + bodyHtml;
  document.body.appendChild(modal);

  // Search filter
  window._filterCmds = (q) => {
    const lines = modal.querySelectorAll('.cmd-line');
    const cats = modal.querySelectorAll('.cmd-cat');
    q = q.toLowerCase();
    cats.forEach(cat => {
      const lines2 = cat.querySelectorAll('.cmd-line');
      let hasMatch = false;
      lines2.forEach(l => {
        const match = !q || l.textContent.toLowerCase().includes(q);
        l.style.display = match ? '' : 'none';
        if (match) hasMatch = true;
      });
      cat.style.display = hasMatch || !q ? '' : 'none';
    });
  };

  window._runCmdFromPage = (cmd) => {
    // Extract just the first command variant
    const bare = cmd.split('/')[0].replace(/\[.*?\]/g, '1').trim();
    parseAndExecute(bare);
    showToast('Running: ' + bare);
  };

  // Focus search
  setTimeout(() => document.getElementById('cmd-search')?.focus(), 100);
}

window.showCommandPage = showCommandPage;
// ══════════════════════════════════════════════════════
// END COMMAND REFERENCE PAGE
// ══════════════════════════════════════════════════════

// ── USER MODEL IMPORT FUNCTIONS ───────────────────────────────────────────────
async function loadUserModel(url, alias) {
  try {
    showNotification('Loading model...');
    return new Promise((resolve) => {
      gltfLoader.load(url,
        (gltf) => {
          const model = gltf.scene;
          model.position.set(px || 0, 0, pz || 0);
          model.scale.setScalar(1);
          scene.add(model);
          window._lastImportedModel = url;
          GLB_MODELS[alias] = url;
          if (alias !== 'imported_model') GLB_MODELS['my_model'] = url;
          showNotification('Model imported! Use "place my model" to add more copies.');
          resolve('Custom model loaded successfully');
        },
        (progress) => {},
        (err) => resolve('Failed to load model: ' + err.message)
      );
    });
  } catch(e) {
    return 'Import error: ' + e.message;
  }
}

function openModelFilePicker() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.glb,.gltf';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    loadUserModel(url, 'my_model');
    showNotification('Loading ' + file.name + '...');
  };
  input.click();
  return 'File picker opened - select your GLB/GLTF file';
}
// ── END USER MODEL IMPORT FUNCTIONS ──────────────────────────────────────────




// ══════════════════════════════════════════════════════
// AUTOSAVE SYSTEM
// ══════════════════════════════════════════════════════
let _autosaveInterval = null;
let _lastAutosave = 0;

function startAutosave(intervalSec = 60) {
  if (_autosaveInterval) clearInterval(_autosaveInterval);
  _autosaveInterval = setInterval(async () => {
    try {
      const state = captureWorldState();
      const json = JSON.stringify(state);
      localStorage.setItem('crate_autosave', json);
      localStorage.setItem('crate_autosave_time', Date.now());
      _lastAutosave = Date.now();
    } catch(e) {}
  }, intervalSec * 1000);
}

function checkAutosaveRestore() {
  const saved = localStorage.getItem('crate_autosave');
  const savedTime = localStorage.getItem('crate_autosave_time');
  if (!saved || !savedTime) return;
  const age = (Date.now() - parseInt(savedTime)) / 1000 / 60;
  if (age > 60 * 24) return; // Ignore saves older than 24h
  const state = JSON.parse(saved);
  if (!state.objects || state.objects.length === 0) return;
  // Don't auto-prompt to restore large generated worlds (city/town builds)
  if (state.objects.length > 80) return;

  const banner = document.createElement('div');
  banner.style.cssText = 'position:fixed;top:46px;left:50%;transform:translateX(-50%);z-index:9997;background:#111;border:1px solid #333;border-radius:10px;padding:12px 18px;display:flex;align-items:center;gap:12px;font-family:-apple-system,sans-serif;font-size:0.82rem;box-shadow:0 8px 24px rgba(0,0,0,0.5)';
  banner.innerHTML = `<span>💾</span><span style="color:#ccc">Autosave from ${Math.round(age)} min ago (${state.objects.length} objects)</span><button onclick="loadWorldFromJSON(JSON.parse(localStorage.getItem('crate_autosave')));this.parentElement.remove()" style="padding:5px 12px;background:#ff6b35;border:none;border-radius:6px;color:#fff;font-weight:700;cursor:pointer">Restore</button><button onclick="this.parentElement.remove()" style="padding:5px 10px;background:#1a1a1a;border:1px solid #333;border-radius:6px;color:#888;cursor:pointer">Dismiss</button>`;
  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 15000);
}
// ══════════════════════════════════════════════════════
// END AUTOSAVE
// ══════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════
// QUEST / OBJECTIVE SYSTEM
// ══════════════════════════════════════════════════════
const _quests = {};
let _questHUD = null;

function addQuest(name, description = '') {
  const id = name.toLowerCase().replace(/\s+/g, '_');
  _quests[id] = { name, description, objectives: [], completed: false, active: true };
  updateQuestHUD();
  showToast('📋 Quest added: ' + name);
  return id;
}

function addObjective(questId, text) {
  const id = questId.toLowerCase().replace(/\s+/g, '_');
  if (!_quests[id]) return;
  _quests[id].objectives.push({ text, done: false });
  updateQuestHUD();
}

function completeObjective(questId, index) {
  const id = questId.toLowerCase().replace(/\s+/g, '_');
  if (!_quests[id] || !_quests[id].objectives[index]) return;
  _quests[id].objectives[index].done = true;
  updateQuestHUD();
  showToast('✅ Objective complete!');
  if (_quests[id].objectives.every(o => o.done)) completeQuest(id);
}

function completeQuest(questId) {
  const id = questId.toLowerCase().replace(/\s+/g, '_');
  if (!_quests[id]) return;
  _quests[id].completed = true;
  updateQuestHUD();
  showWinScreen(_quests[id].name);
}

function showWinScreen(questName) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:99999;display:flex;align-items:center;justify-content:center;font-family:-apple-system,sans-serif';
  overlay.innerHTML = `<div style="text-align:center;padding:40px"><div style="font-size:4rem;margin-bottom:16px">🏆</div><div style="font-size:2.5rem;font-weight:900;color:#f7c948;margin-bottom:8px">Quest Complete!</div><div style="color:#888;font-size:1.1rem;margin-bottom:28px">${questName}</div><div style="display:flex;gap:12px;justify-content:center"><button onclick="this.closest('[style*=fixed]').remove()" style="padding:12px 28px;background:#ff6b35;border:none;border-radius:10px;color:#fff;font-weight:700;cursor:pointer;font-size:1rem">Continue</button><button onclick="if(window.saveWorld)saveWorld()" style="padding:12px 28px;background:#1a1a1a;border:1px solid #333;border-radius:10px;color:#ccc;cursor:pointer;font-size:1rem">Save World</button></div></div>`;
  document.body.appendChild(overlay);
}

function showGameOver(reason = 'You died.') {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:99999;display:flex;align-items:center;justify-content:center;font-family:-apple-system,sans-serif';
  overlay.innerHTML = `<div style="text-align:center;padding:40px"><div style="font-size:4rem;margin-bottom:16px">💀</div><div style="font-size:2.5rem;font-weight:900;color:#ef4444;margin-bottom:8px">GAME OVER</div><div style="color:#666;font-size:1.1rem;margin-bottom:28px">${reason}</div><button onclick="location.reload()" style="padding:12px 28px;background:#ef4444;border:none;border-radius:10px;color:#fff;font-weight:700;cursor:pointer;font-size:1rem">Try Again</button></div>`;
  document.body.appendChild(overlay);
}

function updateQuestHUD() {
  if (!_questHUD) {
    _questHUD = document.createElement('div');
    _questHUD.id = 'quest-hud';
    _questHUD.style.cssText = 'position:fixed;top:46px;right:16px;z-index:300;width:220px;font-family:-apple-system,sans-serif;display:flex;flex-direction:column;gap:6px;pointer-events:none';
    document.body.appendChild(_questHUD);
  }
  const active = Object.values(_quests).filter(q => q.active && !q.completed);
  _questHUD.innerHTML = active.map(q => `
    <div style="background:rgba(10,10,10,0.85);border:1px solid #1a1a1a;border-radius:8px;padding:10px;backdrop-filter:blur(8px)">
      <div style="color:#f7c948;font-weight:700;font-size:0.72rem;text-transform:uppercase;letter-spacing:1px;margin-bottom:5px">📋 ${q.name}</div>
      ${q.objectives.map(o => `<div style="color:${o.done?'#4ade80':'#888'};font-size:0.7rem;padding:2px 0;display:flex;gap:5px"><span>${o.done?'✅':'○'}</span><span style="${o.done?'text-decoration:line-through':''}">${o.text}</span></div>`).join('')}
      ${q.objectives.length===0?`<div style="color:#555;font-size:0.7rem">Active quest</div>`:''}
    </div>`).join('');
}

window.addQuest = addQuest;
window.addObjective = addObjective;
window.completeObjective = completeObjective;
window.completeQuest = completeQuest;
window.showWinScreen = showWinScreen;
window.showGameOver = showGameOver;
// ══════════════════════════════════════════════════════
// END QUEST SYSTEM
// ══════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════
// WEATHER SYSTEM
// ══════════════════════════════════════════════════════
const _weatherParticles = { rain: null, snow: null };
let _weatherActive = null;
let _lightningTimerInterval = null;

function startRain(heavy = false) {
  stopWeather();
  _weatherActive = 'rain';
  const count = heavy ? 2000 : 800;
  const geo = new THREE.BufferGeometry();
  const verts = new Float32Array(count * 3);
  for (let i = 0; i < count * 3; i += 3) {
    verts[i]   = (Math.random() - 0.5) * 200;
    verts[i+1] = Math.random() * 80;
    verts[i+2] = (Math.random() - 0.5) * 200;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  const mat = new THREE.PointsMaterial({ color: 0xaaaaff, size: heavy ? 0.3 : 0.2, transparent: true, opacity: 0.6 });
  const rain = new THREE.Points(geo, mat);
  rain.userData.isWeather = true;
  scene.add(rain);
  _weatherParticles.rain = rain;

  // Animate rain fall
  rain._tick = () => {
    const pos = rain.geometry.attributes.position.array;
    for (let i = 1; i < pos.length; i += 3) {
      pos[i] -= heavy ? 1.2 : 0.7;
      if (pos[i] < -5) pos[i] = 80;
    }
    rain.geometry.attributes.position.needsUpdate = true;
  };
  if (!window._weatherTickAdded) {
    window._weatherTickAdded = true;
    const origAnimate = window._animateHook;
    window._animateHook = () => {
      if (origAnimate) origAnimate();
      if (_weatherParticles.rain?._tick) _weatherParticles.rain._tick();
      if (_weatherParticles.snow?._tick) _weatherParticles.snow._tick();
    };
  }
  showToast(heavy ? '⛈️ Heavy rain' : '🌧️ Rain started');
}

function startSnow() {
  stopWeather();
  _weatherActive = 'snow';
  const geo = new THREE.BufferGeometry();
  const verts = new Float32Array(1200 * 3);
  for (let i = 0; i < 1200 * 3; i += 3) {
    verts[i]   = (Math.random() - 0.5) * 200;
    verts[i+1] = Math.random() * 60;
    verts[i+2] = (Math.random() - 0.5) * 200;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.5, transparent: true, opacity: 0.8 });
  const snow = new THREE.Points(geo, mat);
  snow.userData.isWeather = true;
  scene.add(snow);
  _weatherParticles.snow = snow;
  snow._tick = () => {
    const pos = snow.geometry.attributes.position.array;
    for (let i = 1; i < pos.length; i += 3) {
      pos[i] -= 0.15;
      pos[i-1] += Math.sin(Date.now() * 0.001 + i) * 0.02;
      if (pos[i] < -5) pos[i] = 60;
    }
    snow.geometry.attributes.position.needsUpdate = true;
  };
  showToast('❄️ Snow started');
}

function startLightning() {
  if (_lightningTimerInterval) clearInterval(_lightningTimerInterval);
  _lightningTimerInterval = setInterval(() => {
    const orig = renderer.getClearColor(new THREE.Color()).clone();
    renderer.setClearColor(0xaaaaff);
    setTimeout(() => renderer.setClearColor(orig), 80);
    setTimeout(() => {
      renderer.setClearColor(0xaaaaff);
      setTimeout(() => renderer.setClearColor(0x0a0a0a), 60);
    }, 150);
  }, 3000 + Math.random() * 4000);
  showToast('⚡ Lightning storm');
}

function stopWeather() {
  if (_weatherParticles.rain) { scene.remove(_weatherParticles.rain); _weatherParticles.rain = null; }
  if (_weatherParticles.snow) { scene.remove(_weatherParticles.snow); _weatherParticles.snow = null; }
  if (_lightningTimerInterval) { clearInterval(_lightningTimerInterval); _lightningTimerInterval = null; }
  _weatherActive = null;
}

window.startRain = startRain;
window.startSnow = startSnow;
window.startLightning = startLightning;
window.stopWeather = stopWeather;
// ══════════════════════════════════════════════════════
// END WEATHER SYSTEM
// ══════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════
// DAY/NIGHT AUTO-CYCLE
// ══════════════════════════════════════════════════════
let _dayNightCycle = null;
 // 0-1: 0=dawn, 0.25=noon, 0.5=dusk, 0.75=midnight

const DAY_CYCLE_COLORS = [
  { t: 0,    sky: 0x1a0a2e, ambient: 0.2, sun: 0x221133 }, // midnight
  { t: 0.2,  sky: 0xff7043, ambient: 0.5, sun: 0xff9966 }, // dawn
  { t: 0.35, sky: 0x87ceeb, ambient: 1.0, sun: 0xffffff }, // noon
  { t: 0.6,  sky: 0xff6b35, ambient: 0.6, sun: 0xff8844 }, // sunset
  { t: 0.75, sky: 0x0d0d2e, ambient: 0.3, sun: 0x334455 }, // dusk
  { t: 1.0,  sky: 0x1a0a2e, ambient: 0.2, sun: 0x221133 }, // midnight again
];

function startDayNightCycle(speedMultiplier = 1) {
  if (_dayNightCycle) clearInterval(_dayNightCycle);
  _dayNightCycle = setInterval(() => {
    _cycleTime = (_cycleTime + 0.0002 * speedMultiplier) % 1;
    // Interpolate sky color
    let a, b;
    for (let i = 0; i < DAY_CYCLE_COLORS.length - 1; i++) {
      if (_cycleTime >= DAY_CYCLE_COLORS[i].t && _cycleTime < DAY_CYCLE_COLORS[i+1].t) {
        a = DAY_CYCLE_COLORS[i]; b = DAY_CYCLE_COLORS[i+1]; break;
      }
    }
    if (!a || !b) return;
    const f = (_cycleTime - a.t) / (b.t - a.t);
    const sky = new THREE.Color(a.sky).lerp(new THREE.Color(b.sky), f);
    renderer.setClearColor(sky);
    if (scene.fog) scene.fog.color.copy(sky);
    // Update ambient light
    const ambientLight = scene.children.find(c => c.isAmbientLight);
    if (ambientLight) ambientLight.intensity = a.ambient + (b.ambient - a.ambient) * f;
  }, 33);
  showToast('🌅 Day/night cycle started');
}

function stopDayNightCycle() {
  if (_dayNightCycle) { clearInterval(_dayNightCycle); _dayNightCycle = null; }
  showToast('⏸️ Day/night cycle stopped');
}

window.startDayNightCycle = startDayNightCycle;
window.stopDayNightCycle = stopDayNightCycle;
// ══════════════════════════════════════════════════════
// END DAY/NIGHT CYCLE
// ══════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════
// NPC PROXIMITY TRIGGER — approach NPC to open dialogue
// ══════════════════════════════════════════════════════
let _proximityCheckInterval = null;
const _proximityTriggers = [];  // { mesh, radius, onEnter, onExit, triggered }

function addProximityTrigger(mesh, radius, onEnter, onExit) {
  _proximityTriggers.push({ mesh, radius, onEnter, onExit, triggered: false });
  if (!_proximityCheckInterval) {
    _proximityCheckInterval = setInterval(() => {
      const playerPos = camera.position;
      for (const t of _proximityTriggers) {
        if (!t.mesh.parent) continue;
        const dist = playerPos.distanceTo(t.mesh.position);
        if (!t.triggered && dist < t.radius) {
          t.triggered = true;
          if (t.onEnter) t.onEnter(t.mesh, dist);
        } else if (t.triggered && dist > t.radius * 1.3) {
          t.triggered = false;
          if (t.onExit) t.onExit(t.mesh, dist);
        }
      }
    }, 500);
  }
}

// Auto-attach proximity to any object tagged as NPC with dialogue
function attachDialogueProximity(mesh, treeName, radius = 8) {
  addProximityTrigger(mesh, radius, () => {
    if (window._dialogueTrees?.[treeName]) {
      showDialoguePreview(treeName);
    } else {
      showToast(`💬 Press E to talk to ${mesh.userData.name || 'NPC'}`);
    }
  });
}

window.addProximityTrigger = addProximityTrigger;
window.attachDialogueProximity = attachDialogueProximity;
// ══════════════════════════════════════════════════════
// END NPC PROXIMITY TRIGGER
// ══════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════
// NPC BEHAVIOR SYSTEM — Patrol / Chase / Follow
// ══════════════════════════════════════════════════════
const _npcAgents = [];   // { mesh, mode, waypoints, waypointIdx, speed, target, state }
let _npcUpdateInterval = null;

function spawnBehaviorNPC(opts = {}) {
  const {
    glbKey = 'human_walk',
    mode = 'patrol',         // 'patrol'|'chase'|'follow'|'idle'
    pos = { x: 0, y: 0, z: 0 },
    speed = 3,
    waypointRadius = 20,
    numWaypoints = 4,
  } = opts;

  const _rawGLB = GLB_MODELS[glbKey] || glbKey;
  const _cleanGLB = _rawGLB.endsWith('.glb') ? _rawGLB.slice(0,-4) : _rawGLB;
  const glbPath = '/models/' + _cleanGLB + '.glb';
  gltfLoader.load(glbPath, (gltf) => {
    const mesh = gltf.scene;
    mesh.position.set(pos.x, pos.y, pos.z);
    mesh.scale.setScalar(opts.scale || 1);
    mesh.userData = { isNPC: true, npcMode: mode, glbPath, name: opts.name || glbKey };

    // Generate patrol waypoints
    const waypoints = [];
    for (let i = 0; i < numWaypoints; i++) {
      const angle = (i / numWaypoints) * Math.PI * 2;
      waypoints.push(new THREE.Vector3(
        pos.x + Math.cos(angle) * waypointRadius,
        pos.y,
        pos.z + Math.sin(angle) * waypointRadius
      ));
    }

    const agent = { mesh, mode, waypoints, waypointIdx: 0, speed, state: 'moving',
                    chaseRange: opts.chaseRange || 30, loseRange: opts.loseRange || 50,
                    originalMode: mode };
    _npcAgents.push(agent);
    scene.add(mesh);
    // Rebind skeleton after scale for animated NPCs
    mesh.updateMatrixWorld(true);
    mesh.traverse(c => { if (c.isSkinnedMesh && c.skeleton) c.skeleton.pose(); });
    objects.push(mesh);

    if (!_npcUpdateInterval) startNPCLoop();
  });
}

function startNPCLoop() {
  if (_npcUpdateInterval) return;
  const clock2 = new THREE.Clock();
  _npcUpdateInterval = setInterval(() => {
    const dt = Math.min(clock2.getDelta(), 0.1);
    const playerPos = camera.position;

    for (const agent of _npcAgents) {
      if (!agent.mesh.parent) continue;
      const m = agent.mesh;

      // Chase detection — switch mode if player is close
      const distToPlayer = m.position.distanceTo(playerPos);
      if (agent.originalMode === 'chase' || agent.mode === 'chase') {
        if (distToPlayer < agent.chaseRange) {
          agent.mode = 'chase';
        } else if (distToPlayer > agent.loseRange) {
          agent.mode = agent.originalMode === 'chase' ? 'patrol' : agent.originalMode;
        }
      }

      let target = null;
      if (agent.mode === 'patrol') {
        target = agent.waypoints[agent.waypointIdx];
        const dist = m.position.distanceTo(target);
        if (dist < 1.5) {
          agent.waypointIdx = (agent.waypointIdx + 1) % agent.waypoints.length;
          target = agent.waypoints[agent.waypointIdx];
        }
      } else if (agent.mode === 'chase' || agent.mode === 'follow') {
        target = playerPos;
        if (m.position.distanceTo(target) < 2.5) continue; // close enough
      } else if (agent.mode === 'idle') {
        continue;
      }

      if (!target) continue;

      // Move toward target
      const dir = new THREE.Vector3().subVectors(target, m.position).normalize();
      dir.y = 0;
      const spd = agent.mode === 'chase' ? agent.speed * 1.8 : agent.speed;
      m.position.addScaledVector(dir, spd * dt);
      m.position.y = 0; // stay on ground

      // Face direction of movement
      if (dir.lengthSq() > 0.01) {
        const angle = Math.atan2(dir.x, dir.z);
        m.rotation.y = THREE.MathUtils.lerp(m.rotation.y, angle, 0.12);
      }
    }
  }, 1000 / 30); // 30fps update
}

function setNPCMode(index, mode) {
  if (!_npcAgents[index]) return false;
  _npcAgents[index].mode = mode;
  _npcAgents[index].originalMode = mode;
  return true;
}

function clearAllNPCAgents() {
  for (const a of _npcAgents) { scene.remove(a.mesh); }
  _npcAgents.length = 0;
  if (_npcUpdateInterval) { clearInterval(_npcUpdateInterval); _npcUpdateInterval = null; }
}

window._npcAgents = _npcAgents;
window.spawnBehaviorNPC = spawnBehaviorNPC;
window.setNPCMode = setNPCMode;
// ══════════════════════════════════════════════════════
// END NPC BEHAVIOR SYSTEM
// ══════════════════════════════════════════════════════


// ══════════════════════════════════════════════════════
// MOBILE POLISH — Better touch controls
// ══════════════════════════════════════════════════════
(function patchMobileControls(){
  if (!/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) return;
  document.addEventListener('DOMContentLoaded', () => {
    // Increase joystick size for phones
    const joyWrap = document.getElementById('joystick-wrapper') || document.querySelector('[id*="joystick"]');
    if (joyWrap) {
      joyWrap.style.width = '110px';
      joyWrap.style.height = '110px';
      joyWrap.style.bottom = '24px';
      joyWrap.style.left = '24px';
    }

    // Pinch-to-zoom (adjust camera FOV)
    let lastPinchDist = null;
    document.addEventListener('touchmove', (e) => {
      if (e.touches.length !== 2) { lastPinchDist = null; return; }
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (lastPinchDist !== null) {
        const delta = lastPinchDist - dist;
        if (camera) {
          camera.fov = Math.min(100, Math.max(30, camera.fov + delta * 0.08));
          camera.updateProjectionMatrix();
        }
      }
      lastPinchDist = dist;
    }, { passive: true });

    // Double-tap to interact / select object
    let lastTap = 0;
    document.addEventListener('touchend', (e) => {
      const now = Date.now();
      if (now - lastTap < 300 && e.touches.length === 0) {
        // Double tap — raycast to select nearest object
        const touch = e.changedTouches[0];
        if (!touch) return;
        const rc = new THREE.Raycaster();
        const rect = renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
          ((touch.clientX - rect.left) / rect.width) * 2 - 1,
          -((touch.clientY - rect.top) / rect.height) * 2 + 1
        );
        rc.setFromCamera(mouse, camera);
        const hits = rc.intersectObjects(objects, true);
        if (hits.length > 0) {
          const obj = hits[0].object;
          const name = obj.userData?.name || 'Object';
          showToast('👆 ' + name);
        }
      }
      lastTap = now;
    });

    // Swipe-to-look (right side of screen)
    let lookTouch = null, lastLookX = 0, lastLookY = 0;
    renderer.domElement.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) {
        if (t.clientX > window.innerWidth * 0.5) {
          lookTouch = t.identifier; lastLookX = t.clientX; lastLookY = t.clientY;
        }
      }
    }, { passive: true });
    renderer.domElement.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== lookTouch) continue;
        const dx = t.clientX - lastLookX;
        const dy = t.clientY - lastLookY;
        lastLookX = t.clientX; lastLookY = t.clientY;
        if (window._camYaw !== undefined) {
          window._camYaw -= dx * 0.003;
          window._camPitch = Math.max(-1.2, Math.min(0.5, (window._camPitch||0) - dy * 0.003));
        } else if (camera) {
          camera.rotation.y -= dx * 0.003;
          camera.rotation.x = Math.max(-0.8, Math.min(0.4, camera.rotation.x - dy * 0.003));
        }
      }
    }, { passive: true });
    renderer.domElement.addEventListener('touchend', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === lookTouch) lookTouch = null;
      }
    });

    // Overlay action buttons for mobile
    const bar = document.createElement('div');
    bar.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:500;display:flex;flex-direction:column;gap:8px';
    const mkBtn = (label, cmd, color='#ff6b35') => {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = `width:52px;height:52px;border-radius:50%;background:rgba(10,10,10,0.9);border:2px solid ${color};color:${color};font-size:1.2rem;cursor:pointer;backdrop-filter:blur(8px)`;
      b.addEventListener('touchend', (e) => { e.preventDefault(); if(window.parseAndExecute)parseAndExecute(cmd); });
      return b;
    };
    bar.appendChild(mkBtn('⚔️', 'attack'));
    bar.appendChild(mkBtn('💊', 'add medkit', '#4ade80'));
    bar.appendChild(mkBtn('🔦', 'play flashlight_on', '#f7c948'));
    document.body.appendChild(bar);
  });
})();
// ══════════════════════════════════════════════════════
// END MOBILE POLISH
// ══════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════
// WORLD SAVE / EXPORT / LOAD SYSTEM
// ══════════════════════════════════════════════════════
const WORLD_VERSION = 2;

function captureWorldState() {
  const state = {
    version: WORLD_VERSION,
    timestamp: Date.now(),
    name: window._worldName || 'My World',
    terrain: { type: currentGroundType || 'grass', heightmap: null },
    sky: { time: window._currentTimeOfDay || 'afternoon' },
    fog: { enabled: scene.fog !== null, density: scene.fog?.density || 0 },
    objects: [],
    npcs: [],
    audio: { music: window._currentMusic || null },
    postfx: {
      bloom: bloomPass?.strength || 0.3,
      vignette: window._colorPass?.uniforms.vignetteStrength?.value || 0.35,
      grain: window._colorPass?.uniforms.filmGrain?.value || 0.03,
    }
  };

  // Capture all placed objects
  for (const obj of objects) {
    if (!obj || !obj.userData) continue;
    const entry = {
      name: obj.userData.name || 'Object',
      glb: obj.userData.glbPath || null,
      primitive: obj.userData.primitive || null,
      pos: { x: +obj.position.x.toFixed(2), y: +obj.position.y.toFixed(2), z: +obj.position.z.toFixed(2) },
      rot: { y: +(obj.rotation.y * 180 / Math.PI).toFixed(1) },
      scale: +obj.scale.x.toFixed(3),
      color: obj.userData.color || null,
    };
    if (obj.userData.isNPC) state.npcs.push(entry);
    else state.objects.push(entry);
  }
  return state;
}

async function saveWorld(name) {
  window._worldName = name || window._worldName || 'My World';
  const state = captureWorldState();
  const json = JSON.stringify(state, null, 2);
  // Save to localStorage
  try {
    localStorage.setItem('crate_world_' + state.name, json);
    localStorage.setItem('crate_world_last', json);
  } catch(e) {}
  // Also trigger download
  const blob = new Blob([json], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = (state.name || 'world') + '.crate.json';
  a.click(); URL.revokeObjectURL(url);
  showToast('🌍 World saved: ' + state.name + ' (' + state.objects.length + ' objects)');
  return 'World saved as ' + state.name + '.crate.json';
}

async function loadWorldFromJSON(json) {
  let state;
  try { state = typeof json === 'string' ? JSON.parse(json) : json; }
  catch(e) { return 'Invalid world file: ' + e.message; }

  showToast('Loading world: ' + (state.name || 'unknown') + '...');

  // Apply terrain
  if (state.terrain?.type) {
    currentGroundType = state.terrain.type;
    await applyGroundTexture(currentGround, currentGroundType);
  }

  // Apply sky
  if (state.sky?.time) await parseAndExecute('time ' + state.sky.time);

  // Apply fog
  if (state.fog?.enabled) {
    scene.fog = new THREE.FogExp2(0x8899aa, state.fog.density || 0.01);
  } else { scene.fog = null; }

  // Restore post-fx
  if (state.postfx && window._colorPass) {
    if (state.postfx.bloom !== undefined && bloomPass) bloomPass.strength = state.postfx.bloom;
    if (state.postfx.vignette !== undefined) window._colorPass.uniforms.vignetteStrength.value = state.postfx.vignette;
    if (state.postfx.grain !== undefined) window._colorPass.uniforms.filmGrain.value = state.postfx.grain;
  }

  // Restore objects
  let placed = 0;
  for (const entry of [...(state.objects||[]), ...(state.npcs||[])]) {
    try {
      if (entry.glb) {
        await new Promise((resolve) => {
          gltfLoader.load(entry.glb, (gltf) => {
            const m = gltf.scene;
            m.position.set(entry.pos.x, entry.pos.y, entry.pos.z);
            m.rotation.y = (entry.rot?.y || 0) * Math.PI / 180;
            m.scale.setScalar(entry.scale || 1);
            m.userData = { name: entry.name, glbPath: entry.glb, isGLB: true };
            scene.add(m); objects.push(m); placed++;
            resolve();
          }, undefined, resolve);
        });
      }
    } catch(e) {}
  }

  window._worldName = state.name;
  showToast('🌍 World loaded: ' + placed + ' objects restored');
  return 'World loaded: ' + state.name;
}

function openWorldFilePicker() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.json,.crate.json';
  inp.onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const text = await file.text();
    loadWorldFromJSON(text);
  };
  inp.click();
  return 'File picker opened — select your .crate.json world file';
}

window.saveWorld = saveWorld;
window.loadWorldFromJSON = loadWorldFromJSON;
// ══════════════════════════════════════════════════════
// END WORLD SAVE / EXPORT / LOAD
// ══════════════════════════════════════════════════════


// ══════════════════════════════════════════════════════
// AUDIO SYSTEM — Horror SFX + Music + Ambient
// ══════════════════════════════════════════════════════
const HORROR_AUDIO = {
  // Music
  menu_music:       '/audio/horror/menumusic01.wav',
  event_music:      '/audio/horror/eventmusic01.wav',
  horror_music:     '/audio/horror/eventmusic01.wav',
  // Ambient / atmosphere
  heartbeat:        '/audio/horror/heartbeat.wav',
  vision_ambient:   '/audio/horror/visionsound1.wav',
  street_light_hum: '/audio/horror/streetlightsoundloop.wav',
  police_siren:     '/audio/horror/policesiren.wav',
  // Killer / hunter
  chainsaw_idle:    '/audio/horror/chainsawidle.wav',
  chainsaw_attack:  '/audio/horror/chainsawattack.wav',
  chainsaw_on:      '/audio/horror/chainsawturnon.wav',
  hunter_chase:     '/audio/horror/hunter01chase01loop.wav',
  hunter_vision:    '/audio/horror/huntersvisionsound.wav',
  // Footsteps
  footstep_1:       '/audio/horror/player_footstep_01.wav',
  footstep_land:    '/audio/horror/player_land.wav',
  // Props
  door_open:        '/audio/horror/dooropen.wav',
  door_close:       '/audio/horror/closecardoor.wav',
  door_unlock:      '/audio/horror/doorunlockingsoundloop.wav',
  flashlight_on:    '/audio/horror/flashlightturnonsound.wav',
  flashlight_off:   '/audio/horror/flashlightturnoffsound.wav',
  light_on:         '/audio/horror/lightturnonsound.wav',
  light_off:        '/audio/horror/lightturnoffsound.wav',
  match_start:      '/audio/horror/matchstartsound.wav',
  street_break:     '/audio/horror/streetlightbreaksound.wav',
  // Combat
  sword_swing:      '/audio/horror/swordswing01.wav',
  sword_hit_flesh:  '/audio/horror/swordfleshhit01.wav',
  sword_equip:      '/audio/horror/swordequip01.wav',
  knife_hit:        '/audio/horror/knifecharacterhit.wav',
  shotgun:          '/audio/horror/shotgunsound.wav',
  // Vehicles
  car_start:        '/audio/horror/carturnonsound.wav',
  car_accel:        '/audio/horror/accelerationhigh.wav',
  car_skid:         '/audio/horror/skid.wav',
  firecracker:      '/audio/horror/firecrackersound.wav',
};

const _audioCtx = { ctx: null, nodes: {}, music: null };

function getAudioCtx() {
  if (!_audioCtx.ctx) _audioCtx.ctx = new (window.AudioContext || window.webkitAudioContext)();
  return _audioCtx.ctx;
}

async function playSound(key, loop=false, volume=1.0) {
  const src = HORROR_AUDIO[key];
  if (!src) return false;
  try {
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') await ctx.resume();
    const resp = await fetch(src);
    const buf = await ctx.decodeAudioData(await resp.arrayBuffer());
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = buf;
    source.loop = loop;
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start(0);
    if (loop) _audioCtx.nodes[key] = { source, gain };
    return true;
  } catch(e) { return false; }
}

function stopSound(key) {
  const node = _audioCtx.nodes[key];
  if (node) { try { node.source.stop(); } catch(e) {} delete _audioCtx.nodes[key]; }
}

function stopAllSounds() {
  Object.keys(_audioCtx.nodes).forEach(stopSound);
  if (_audioCtx.ctx) { _audioCtx.ctx.close(); _audioCtx.ctx = null; }
}

window._playHorrorSound = playSound;
window._stopSound = stopSound;
window._stopAllSounds = stopAllSounds;
window._HORROR_AUDIO = HORROR_AUDIO;
// ══════════════════════════════════════════════════════
// END AUDIO SYSTEM
// ══════════════════════════════════════════════════════


// ══════════════════════════════════════════════════════
// NPC DIALOGUE EDITOR — Visual Conversation Tree Builder
// ══════════════════════════════════════════════════════
const _dialogueTrees = {};   // name -> { nodes: [], start: 'node_0' }
let   _activeDialogue = null;

function showDialogueEditor(npcName) {
  const existing = document.getElementById('dialogue-editor-modal');
  if (existing) { existing.remove(); return; }

  const treeName = npcName || 'NPC_1';
  if (!_dialogueTrees[treeName]) {
    _dialogueTrees[treeName] = {
      nodes: [
        { id: 'node_0', text: 'Hello traveler, what do you seek?', options: [
          { text: 'Tell me about this place', next: 'node_1' },
          { text: 'I need supplies', next: 'node_2' },
          { text: 'Goodbye', next: null }
        ]},
        { id: 'node_1', text: 'This is a dangerous land. Beware the creatures at night.', options: [
          { text: 'Thank you for the warning', next: null },
          { text: 'What creatures?', next: null }
        ]},
        { id: 'node_2', text: 'I have potions and weapons for sale.', options: [
          { text: 'Show me your wares', next: null },
          { text: 'Never mind', next: null }
        ]}
      ],
      start: 'node_0'
    };
  }

  const tree = _dialogueTrees[treeName];

  const modal = document.createElement('div');
  modal.id = 'dialogue-editor-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:99998;display:flex;flex-direction:column;font-family:-apple-system,sans-serif;overflow:hidden';

  function renderEditor() {
    const nodeList = tree.nodes.map((node, ni) => `
      <div style="background:#0d0d0d;border:1px solid ${node.id===tree.start?'#ff6b35':'#222'};border-radius:10px;padding:12px;margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <span style="color:#555;font-size:0.7rem;font-family:monospace">${node.id}</span>
          ${node.id===tree.start?'<span style="background:#ff6b35;color:#fff;font-size:0.6rem;padding:2px 6px;border-radius:4px">START</span>':''}
          <button onclick="window._dlgSetStart('${node.id}')" style="margin-left:auto;background:#111;border:1px solid #333;color:#888;padding:3px 8px;border-radius:4px;cursor:pointer;font-size:0.65rem">Set Start</button>
          <button onclick="window._dlgDeleteNode(${ni})" style="background:#111;border:1px solid #ef4444;color:#ef4444;padding:3px 8px;border-radius:4px;cursor:pointer;font-size:0.65rem">Delete</button>
        </div>
        <textarea id="node-text-${ni}" style="width:100%;background:#111;border:1px solid #333;border-radius:6px;padding:8px;color:#fff;font-size:0.82rem;resize:vertical;min-height:60px;box-sizing:border-box" onchange="window._dlgUpdateText(${ni},this.value)">${node.text}</textarea>
        <div style="margin-top:8px">
          <div style="color:#555;font-size:0.65rem;margin-bottom:4px;text-transform:uppercase;letter-spacing:1px">Response Options</div>
          ${node.options.map((opt,oi)=>`
            <div style="display:flex;gap:6px;margin-bottom:4px;align-items:center">
              <input value="${opt.text}" onchange="window._dlgUpdateOpt(${ni},${oi},'text',this.value)" style="flex:1;background:#111;border:1px solid #333;border-radius:4px;padding:5px 8px;color:#ccc;font-size:0.75rem">
              <select onchange="window._dlgUpdateOpt(${ni},${oi},'next',this.value||null)" style="background:#111;border:1px solid #333;border-radius:4px;padding:5px;color:#ccc;font-size:0.75rem">
                <option value="">→ End</option>
                ${tree.nodes.map(n=>`<option value="${n.id}" ${opt.next===n.id?'selected':''}>${n.id}</option>`).join('')}
              </select>
              <button onclick="window._dlgDeleteOpt(${ni},${oi})" style="background:#111;border:1px solid #ef4444;color:#ef4444;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:0.7rem">✕</button>
            </div>`).join('')}
          <button onclick="window._dlgAddOpt(${ni})" style="background:#111;border:1px solid #4ade80;color:#4ade80;padding:4px 12px;border-radius:4px;cursor:pointer;font-size:0.7rem;margin-top:2px">+ Add Option</button>
        </div>
      </div>`).join('');

    modal.innerHTML = `
      <div style="padding:14px 18px;background:#0a0a0a;border-bottom:1px solid #1a1a1a;display:flex;align-items:center;gap:10px;flex-shrink:0">
        <span style="font-size:1.2rem">💬</span>
        <div style="flex:1">
          <div style="font-weight:700;color:#fff">Dialogue Editor — <span style="color:#ff6b35">${treeName}</span></div>
          <div style="font-size:0.65rem;color:#555">${tree.nodes.length} nodes • Click node to preview</div>
        </div>
        <button onclick="window._dlgPreview()" style="background:#1a1a2e;border:1px solid #4ade80;color:#4ade80;padding:6px 14px;border-radius:8px;cursor:pointer;font-size:0.8rem">▶ Preview</button>
        <button onclick="window._dlgExport('${treeName}')" style="background:#1a1a2e;border:1px solid #ff6b35;color:#ff6b35;padding:6px 14px;border-radius:8px;cursor:pointer;font-size:0.8rem">💾 Save</button>
        <button onclick="document.getElementById('dialogue-editor-modal').remove()" style="background:none;border:1px solid #333;color:#888;padding:6px 12px;border-radius:8px;cursor:pointer">✕</button>
      </div>
      <div style="flex:1;overflow-y:auto;padding:16px;display:grid;grid-template-columns:1fr 1fr;gap:12px;align-content:start">
        <div>
          <div style="color:#ff6b35;font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Dialogue Nodes</div>
          ${nodeList}
          <button onclick="window._dlgAddNode()" style="width:100%;padding:10px;background:#111;border:2px dashed #333;border-radius:8px;color:#555;cursor:pointer;font-size:0.8rem;margin-top:4px" onmouseenter="this.style.borderColor='#ff6b35';this.style.color='#ff6b35'" onmouseleave="this.style.borderColor='#333';this.style.color='#555'">+ Add Node</button>
        </div>
        <div>
          <div style="color:#4ade80;font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Flow Preview</div>
          <div style="background:#0d0d0d;border:1px solid #1a1a1a;border-radius:10px;padding:12px;font-size:0.75rem;color:#888;font-family:monospace;white-space:pre-wrap">${
            tree.nodes.map(n=>`[${n.id}] "${n.text.substring(0,40)}..."\n${n.options.map(o=>`  → "${o.text}" → ${o.next||'END'}`).join('\n')}`).join('\n\n')
          }</div>
          <div style="margin-top:12px;color:#555;font-size:0.7rem">Commands:</div>
          <div style="font-family:monospace;font-size:0.7rem;color:#888;background:#0d0d0d;padding:8px;border-radius:6px;margin-top:4px">
npc ${treeName} say Hello traveler<br>
add npc dialogue<br>
show dialogue ${treeName}<br>
attach dialogue ${treeName} to [npc name]
          </div>
        </div>
      </div>`;

    // Wire handlers
    window._dlgAddNode = () => {
      const id = 'node_' + tree.nodes.length;
      tree.nodes.push({ id, text: 'New dialogue node', options: [{ text: 'Continue', next: null }] });
      renderEditor();
    };
    window._dlgDeleteNode = (i) => { tree.nodes.splice(i,1); renderEditor(); };
    window._dlgSetStart = (id) => { tree.start = id; renderEditor(); };
    window._dlgUpdateText = (i, v) => { tree.nodes[i].text = v; };
    window._dlgAddOpt = (ni) => { tree.nodes[ni].options.push({text:'New option',next:null}); renderEditor(); };
    window._dlgDeleteOpt = (ni,oi) => { tree.nodes[ni].options.splice(oi,1); renderEditor(); };
    window._dlgUpdateOpt = (ni,oi,k,v) => { tree.nodes[ni].options[oi][k] = v||null; };
    window._dlgPreview = () => showDialoguePreview(treeName);
    window._dlgExport = (name) => {
      const json = JSON.stringify(_dialogueTrees[name], null, 2);
      localStorage.setItem('crate_dialogue_' + name, json);
      showToast('💬 Dialogue "' + name + '" saved');
    };
  }

  document.body.appendChild(modal);
  renderEditor();
}

function showDialoguePreview(treeName) {
  const tree = _dialogueTrees[treeName];
  if (!tree) return;
  let currentNode = tree.nodes.find(n=>n.id===tree.start) || tree.nodes[0];
  if (!currentNode) return;

  const overlay = document.getElementById('dlg-preview-overlay') || (() => {
    const el = document.createElement('div');
    el.id = 'dlg-preview-overlay';
    el.style.cssText = 'position:fixed;bottom:100px;left:50%;transform:translateX(-50%);width:500px;max-width:92vw;background:rgba(10,10,10,0.95);border:1px solid #333;border-radius:14px;z-index:100000;padding:20px;font-family:-apple-system,sans-serif;backdrop-filter:blur(10px)';
    document.body.appendChild(el);
    return el;
  })();

  function render(node) {
    overlay.innerHTML = `
      <div style="color:#888;font-size:0.65rem;margin-bottom:8px;text-transform:uppercase;letter-spacing:1px">💬 ${treeName}</div>
      <div style="color:#fff;font-size:0.95rem;line-height:1.5;margin-bottom:14px">${node.text}</div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${node.options.map((opt,i)=>`
          <button onclick="window._dlgPickOpt(${i})" style="text-align:left;padding:8px 14px;background:#111;border:1px solid #333;border-radius:8px;color:#ccc;cursor:pointer;font-size:0.82rem;transition:all 0.15s" onmouseenter="this.style.borderColor='#ff6b35';this.style.color='#ff6b35'" onmouseleave="this.style.borderColor='#333';this.style.color='#ccc'">
            [${i+1}] ${opt.text}
          </button>`).join('')}
      </div>
      <button onclick="document.getElementById('dlg-preview-overlay').remove()" style="margin-top:10px;background:none;border:none;color:#444;cursor:pointer;font-size:0.75rem">Close preview</button>`;

    window._dlgPickOpt = (i) => {
      const next = node.options[i]?.next;
      if (!next) { overlay.remove(); return; }
      const nextNode = tree.nodes.find(n=>n.id===next);
      if (nextNode) render(nextNode); else overlay.remove();
    };
  }
  render(currentNode);
}

window.showDialogueEditor = showDialogueEditor;
window._dialogueTrees = _dialogueTrees;
// ══════════════════════════════════════════════════════
// END NPC DIALOGUE EDITOR
// ══════════════════════════════════════════════════════


// ══════════════════════════════════════════════════════
// TERRAIN PAINT UI — Click to paint texture zones
// ══════════════════════════════════════════════════════
let _terrainPaintMode = false;
let _terrainPaintType = 'grass';
let _terrainPaintRadius = 15;
const _paintedZones = [];

const PAINT_COLORS = {
  grass:    0x3a7a3a,
  sand:     0xc4a96a,
  desert:   0xb8924a,
  snow:     0xd8dce8,
  dirt:     0x6b4a2a,
  stone:    0x666666,
  rock:     0x555555,
  mud:      0x4a3a2a,
  lava:     0xcc3300,
  forest:   0x2a5a2a,
  concrete: 0x999999,
  asphalt:  0x333333,
  ice:      0xaaddff,
};

function showTerrainPaintUI() {
  const existing = document.getElementById('terrain-paint-ui');
  if (existing) { existing.remove(); _terrainPaintMode = false; return; }

  const panel = document.createElement('div');
  panel.id = 'terrain-paint-ui';
  panel.style.cssText = 'position:fixed;top:60px;left:20px;z-index:300;width:220px;background:#0a0a0a;border:1px solid #1a1a1a;border-radius:12px;overflow:hidden;font-family:-apple-system,sans-serif';

  const texTypes = ['grass','sand','desert','snow','dirt','stone','rock','mud','lava','forest','concrete','asphalt','ice'];

  panel.innerHTML = `
    <div style="padding:10px 12px;background:rgba(255,107,53,0.08);border-bottom:1px solid #1a1a1a;display:flex;align-items:center;gap:8px">
      <span>🖌️</span>
      <div style="flex:1;font-weight:700;color:#ff6b35;font-size:0.8rem">Terrain Painter</div>
      <button onclick="document.getElementById('terrain-paint-ui').remove();window._terrainPaintMode=false" style="background:none;border:none;color:#555;cursor:pointer">✕</button>
    </div>
    <div style="padding:10px">
      <div style="color:#555;font-size:0.65rem;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Texture</div>
      <div id="paint-texture-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-bottom:10px">
        ${texTypes.map(t=>`
          <div onclick="window._setPaintType('${t}')" id="paint-btn-${t}" style="aspect-ratio:1;border-radius:6px;cursor:pointer;border:2px solid ${t===_terrainPaintType?'#ff6b35':'transparent'};background:${('#' + PAINT_COLORS[t]?.toString(16).padStart(6,'0'))||'#333'};position:relative;transition:all 0.15s" title="${t}">
            <span style="position:absolute;bottom:1px;left:0;right:0;text-align:center;font-size:0.45rem;color:rgba(255,255,255,0.8)">${t}</span>
          </div>`).join('')}
      </div>
      <div style="color:#555;font-size:0.65rem;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Brush Radius: <span id="paint-radius-val">${_terrainPaintRadius}</span></div>
      <input type="range" min="2" max="50" value="${_terrainPaintRadius}" id="paint-radius" oninput="window._setPaintRadius(+this.value)" style="width:100%;accent-color:#ff6b35;margin-bottom:10px">
      <button onclick="window._terrainPaintMode=!window._terrainPaintMode;this.style.background=window._terrainPaintMode?'rgba(255,107,53,0.2)':'#111';this.style.color=window._terrainPaintMode?'#ff6b35':'#888';this.textContent=window._terrainPaintMode?'🖌️ Painting...':'🖌️ Start Painting'" 
        style="width:100%;padding:8px;background:#111;border:1px solid #333;border-radius:8px;color:#888;cursor:pointer;font-size:0.8rem;margin-bottom:6px">🖌️ Start Painting</button>
      <button onclick="window._clearPaintZones()" style="width:100%;padding:6px;background:#111;border:1px solid #ef4444;border-radius:8px;color:#ef4444;cursor:pointer;font-size:0.75rem">Clear All Zones</button>
      <div style="color:#555;font-size:0.65rem;margin-top:8px">Click terrain to paint • Painted zones show colored circles</div>
    </div>`;

  document.body.appendChild(panel);
  _terrainPaintMode = false;

  window._setPaintType = (t) => {
    _terrainPaintType = t;
    document.querySelectorAll('[id^="paint-btn-"]').forEach(el => el.style.borderColor='transparent');
    const btn = document.getElementById('paint-btn-' + t);
    if (btn) btn.style.borderColor = '#ff6b35';
  };
  window._setPaintRadius = (r) => {
    _terrainPaintRadius = r;
    const el = document.getElementById('paint-radius-val');
    if (el) el.textContent = r;
  };
  window._clearPaintZones = () => {
    _paintedZones.forEach(z => scene.remove(z));
    _paintedZones.length = 0;
    showToast('Paint zones cleared');
  };

  // Paint on canvas click when in paint mode
  window._terrainPaintMode = false;
  if (!window._paintClickHandler) {
    window._paintClickHandler = (e) => {
      if (!window._terrainPaintMode) return;
      const rc = new THREE.Raycaster();
      const rect = renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      rc.setFromCamera(mouse, camera);
      const hits = rc.intersectObject(currentGround);
      if (hits.length > 0) {
        const pt = hits[0].point;
        // Spawn a paint zone disc
        const geo = new THREE.CircleGeometry(_terrainPaintRadius, 32);
        const col = new THREE.Color(PAINT_COLORS[_terrainPaintType] || 0x3a7a3a);
        const mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55, depthWrite: false });
        const disc = new THREE.Mesh(geo, mat);
        disc.rotation.x = -Math.PI/2;
        disc.position.set(pt.x, 0.05, pt.z);
        disc.userData = { isPaintZone: true, paintType: _terrainPaintType };
        scene.add(disc);
        _paintedZones.push(disc);
        // Also queue texture load for this zone (visual feedback)
        loadGroundTexture(_terrainPaintType).then(tex => {
          if (tex) {
            const tTex = tex.clone();
            tTex.wrapS = tTex.wrapT = THREE.RepeatWrapping;
            tTex.repeat.set(4, 4);
            mat.map = tTex;
            mat.color.set(0xffffff);
            mat.needsUpdate = true;
          }
        });
        showToast('Painted ' + _terrainPaintType + ' zone at (' + pt.x.toFixed(0) + ',' + pt.z.toFixed(0) + ')');
      }
    };
    renderer.domElement.addEventListener('click', window._paintClickHandler);
  }
}

window.showTerrainPaintUI = showTerrainPaintUI;
window._terrainPaintMode = false;
// ══════════════════════════════════════════════════════
// END TERRAIN PAINT UI
// ══════════════════════════════════════════════════════

async function parseAndExecute(rawCmd) {
  const cmd = rawCmd; // alias for compatibility

  const lower = (rawCmd || "").toLowerCase().trim();
  // === AI AGENT COMMANDS ===
  if (lower.startsWith('agent build ') || lower.startsWith('ai build ')) {
    const agentPrompt = cmd.replace(/^(agent|ai) build /i, '').trim();
    if (!window._agentReady) return '⚠️ Agent not loaded yet. Try again in a few seconds.';
    window._agent.agentBuildLoop(agentPrompt, 3);
    return '🤖 Agent building: "' + agentPrompt + '" (with screenshot learning loop)';
  }
  if (lower === 'agent memory' || lower === 'ai memory') {
    if (window._agentShowMemory) window._agentShowMemory();
    const mem = window._agentMemory ? window._agentMemory() : [];
    if (mem.length === 0) return '🧠 Agent memory is empty — no lessons learned yet.';
    return '🧠 Agent memory (' + mem.length + ' lessons):\n' + mem.slice(-10).map(l => '• [' + (l.type||'?') + ' s:' + (l.score||'?') + '] ' + l.summary).join('\n');
  }
  if (lower === 'agent stats' || lower === 'ai stats') {
    if (window._agentStats) {
      const s = window._agentStats();
      return '📊 Agent stats: ' + s.total + ' lessons | avg score: ' + s.avgScore + ' | refs: ' + s.refs + ' categories | types: ' + JSON.stringify(s.types);
    }
    return '⚠️ Agent not loaded.';
  }
  if (lower === 'agent clear memory' || lower === 'ai clear memory') {
    if (window._agent?.clearMemory) window._agent.clearMemory();
    else localStorage.removeItem('crate_agent_memory');
    return '🧹 Agent memory cleared.';
  }

  if (/^build (a |the )?(city|full city|the city)$/i.test(cmd)) {
    buildCityWorld3();
    return '🏙️ Building full city... give it 15-20 seconds to load all assets!';
  }
  // Skip NL rewrite for gallery keywords — let gallery commands handle directly
  const _galBypass = /^(?:show |browse |open |pick |choose |select )?(characters?|weapons?|swords?|axes?|guns?|buildings?|houses?|vehicles?|cars?|animals?|trees?|plants?|rocks?|stones?|furniture|tables?|chairs?|food|items?|potions?|dungeon|sci-?fi|space|nature|survival|animations?|library|asset library|browse all|all assets|all models|model library|browse$)$/i;

  // ── USER MODEL IMPORT SYSTEM ──────────────────────────────────────────────
  if (/^import model (.+)/i.test(cmd)) {
    const url = cmd.match(/^import model (.+)/i)[1].trim();
    return loadUserModel(url, 'imported_model');
  }
  if (/^load model from (.+)/i.test(cmd)) {
    const url = cmd.match(/^load model from (.+)/i)[1].trim();
    return loadUserModel(url, 'imported_model');
  }
  if (/^import my model$/i.test(cmd) || /^load my model$/i.test(cmd)) {
    return openModelFilePicker();
  }
  if (/^use my model as (.+)/i.test(cmd)) {
    const alias = cmd.match(/^use my model as (.+)/i)[1].trim();
    if (window._lastImportedModel) {
      GLB_MODELS[alias] = window._lastImportedModel;
      return `Model registered as "${alias}" - use "add ${alias}" to place it`;
    }
    return 'No model imported yet. Use "import model [URL]" first.';
  }
  if (/^place (my model|imported model|my imported model)$/i.test(cmd)) {
    if (window._lastImportedModel) {
      return execSingle(`add ${window._lastImportedModel}`);
    }
    return 'No model imported yet. Use "import model [URL]" first.';
  }
  // ── END USER MODEL IMPORT ─────────────────────────────────────────────────

  // ── NATURAL LANGUAGE TERRAIN COMMANDS ────────────────────────────────────
  if (/^(i want a?|make|create|generate)?\s*(a\s+)?(desert|sandy) (land|terrain|world|ground|area|scene)$/i.test(cmd)) {
    await parseAndExecute('terrain desert');
    await parseAndExecute('ground sand');
    await parseAndExecute('time noon');
    await parseAndExecute('fog off');
    return 'Desert land created — sandy terrain, harsh noon sun';
  }
  if (/^(i want a?|make|create|generate)?\s*(a\s+)?(grass|green|lush) (land|terrain|world|ground|area|meadow)$/i.test(cmd)) {
    await parseAndExecute('terrain hills');
    await parseAndExecute('ground grass');
    await parseAndExecute('time afternoon');
    return 'Grassy land created — rolling green hills';
  }
  if (/^(i want a?|make|create|generate)?\s*(a\s+)?(snow|snowy|arctic|winter|frozen) (land|terrain|world|ground|area|scene)$/i.test(cmd)) {
    await parseAndExecute('terrain arctic');
    await parseAndExecute('ground snow');
    await parseAndExecute('time morning');
    await parseAndExecute('make it snow');
    return 'Snowy land created — arctic terrain with snowfall';
  }
  if (/^(i want a?|make|create|generate)?\s*(a\s+)?(forest|woodland|jungle|tropical) (land|terrain|world|ground|area|scene)$/i.test(cmd)) {
    await parseAndExecute('terrain hills');
    await parseAndExecute('ground forest');
    await parseAndExecute('time morning');
    await parseAndExecute('fog 0.008');
    return 'Forest land created — wooded hills with morning mist';
  }
  if (/^(i want a?|make|create|generate)?\s*(a\s+)?(volcanic|lava|hellscape|infernal) (land|terrain|world|ground|area|scene)$/i.test(cmd)) {
    await parseAndExecute('terrain volcanic');
    await parseAndExecute('ground lava');
    await parseAndExecute('time night');
    await parseAndExecute('particles embers');
    return 'Volcanic land created — lava ground, ember particles, night sky';
  }
  if (/^(i want a?|make|create|generate)?\s*(a\s+)?(stone|rocky|mountain|mountainous) (land|terrain|world|ground|area|scene)$/i.test(cmd)) {
    await parseAndExecute('terrain mountains');
    await parseAndExecute('ground rock');
    await parseAndExecute('time noon');
    return 'Mountain land created — rocky terrain with stone ground';
  }
  if (/^(i want a?|make|create|generate)?\s*(a\s+)?(swamp|muddy|dark forest|bayou) (land|terrain|world|ground|area|scene)$/i.test(cmd)) {
    await parseAndExecute('terrain hills');
    await parseAndExecute('ground mud');
    await parseAndExecute('time dusk');
    await parseAndExecute('fog 0.015');
    await parseAndExecute('particles fireflies');
    return 'Swamp land created — murky, foggy with fireflies';
  }
  if (/^(i want a?|make|create|generate)?\s*(a\s+)?(dirt|earthy|wasteland) (land|terrain|world|ground|area|scene)$/i.test(cmd)) {
    await parseAndExecute('terrain hills');
    await parseAndExecute('ground dirt');
    await parseAndExecute('time afternoon');
    return 'Wasteland created — dry dirt ground, barren hills';
  }
  if (/^ground (forest|swamp|desert|all grass|all sand|all snow)$/i.test(cmd)) {
    const t = cmd.match(/^ground (.+)$/i)[1].toLowerCase();
    const map = {'forest':'forest','swamp':'mud','all grass':'grass','all sand':'sand','all snow':'snow','desert':'sand'};
    const gType = map[t] || t;
    currentGroundType = gType;
    setTimeout(() => applyGroundTexture(currentGround, gType), 100);
    return `Ground texture set to ${gType}`;
  }
  // ── END NATURAL LANGUAGE TERRAIN ─────────────────────────────────────────

  // ── POLISH COMMANDS ───────────────────────────────────────────────────────
  if (/^dof (on|off)$/i.test(cmd) || /^depth of field (on|off)$/i.test(cmd)) {
    const on = /on/i.test(cmd);
    if (on && BokehPass && !bokehPass) {
      bokehPass = new BokehPass(scene, camera, { focus: 20, aperture: 0.001, maxblur: 0.015 });
      if (composer) composer.addPass(bokehPass);
    }
    if (bokehPass) bokehPass.enabled = on;
    return `Depth of field ${on ? 'enabled' : 'disabled'}`;
  }
  if (/^dof focus (\d+\.?\d*)$/i.test(cmd)) {
    const dist = parseFloat(cmd.match(/([\d.]+)/)[1]);
    if (bokehPass) bokehPass.uniforms['focus'].value = dist;
    return `DOF focus set to ${dist}`;
  }
  if (/^motion blur (on|off)$/i.test(cmd)) {
    const on = /on/i.test(cmd);
    if (window._colorPass) window._colorPass.uniforms.chromaticAberration.value = on ? 0.002 : 0;
    return `Motion blur ${on ? 'on' : 'off'}`;
  }
  if (/^chromatic aberration ([\d.]+)$/i.test(cmd) || /^chroma ([\d.]+)$/i.test(cmd)) {
    const val = parseFloat(cmd.match(/([\d.]+)/)[1]);
    if (window._colorPass) window._colorPass.uniforms.chromaticAberration.value = Math.min(val, 0.02);
    return `Chromatic aberration: ${val}`;
  }
  if (/^contrast ([\d.]+)$/i.test(cmd)) {
    const val = parseFloat(cmd.match(/([\d.]+)/)[1]);
    if (window._colorPass) window._colorPass.uniforms.contrast.value = val;
    return `Contrast: ${val}`;
  }
  if (/^saturation ([\d.]+)$/i.test(cmd)) {
    const val = parseFloat(cmd.match(/([\d.]+)/)[1]);
    if (window._colorPass) window._colorPass.uniforms.saturation.value = val;
    return `Saturation: ${val}`;
  }
  if (/^brightness ([\d.]+)$/i.test(cmd)) {
    const val = parseFloat(cmd.match(/([\d.]+)/)[1]);
    if (window._colorPass) window._colorPass.uniforms.brightness.value = val;
    return `Brightness: ${val}`;
  }
  if (/^color grade (cinematic|warm|cool|horror|noir|vivid|neutral|default)$/i.test(cmd)) {
    const style = cmd.split(' ').pop().toLowerCase();
    const grades = {
      cinematic: { contrast: 1.15, saturation: 0.9, brightness: 0.95, vignette: 0.5 },
      warm:      { contrast: 1.05, saturation: 1.2, brightness: 1.05, vignette: 0.2 },
      cool:      { contrast: 1.08, saturation: 0.85, brightness: 0.98, vignette: 0.25 },
      horror:    { contrast: 1.3,  saturation: 0.4, brightness: 0.75, vignette: 0.7 },
      noir:      { contrast: 1.4,  saturation: 0.0, brightness: 0.85, vignette: 0.6 },
      vivid:     { contrast: 1.1,  saturation: 1.5, brightness: 1.05, vignette: 0.15 },
      neutral:   { contrast: 1.0,  saturation: 1.0, brightness: 1.0,  vignette: 0.2 },
      default:   { contrast: 1.08, saturation: 1.12, brightness: 1.02, vignette: 0.35 },
    };
    const g = grades[style] || grades.default;
    if (window._colorPass) {
      window._colorPass.uniforms.contrast.value = g.contrast;
      window._colorPass.uniforms.saturation.value = g.saturation;
      window._colorPass.uniforms.brightness.value = g.brightness;
      window._colorPass.uniforms.vignetteStrength.value = g.vignette;
    }
    return `Color grade: ${style}`;
  }
  if (/^commands?$|^help commands?$|^command (page|list|reference|browser)$/i.test(cmd)) {
    showCommandPage();
    return 'Command reference opened';
  }

  if (/^(what.*next|polish.*guide|finish.*game|game.*done|ship.*game|publish.*game|export.*game)$/i.test(cmd)) {
    return `🏁 **GAME POLISH CHECKLIST** — Here\'s what to do after your world is built:

**VISUAL POLISH:**
• color grade cinematic — cinematic look
• bloom 1.5 — soft glow on lights
• vignette 0.4 — edge darkening
• ssao on — contact shadows
• shadow quality ultra

**ATMOSPHERE:**
• Adjust fog density for your scene
• Set the perfect time of day
• Add ambient particles (fireflies, dust, embers)
• Add god rays for sunlight

**GAME FEEL:**
• Add win condition — what does the player work toward?
• Add main menu — first thing players see
• Add game over screen — what happens on death?
• Add background music — sets the tone
• Add checkpoint — so players don\'t lose progress

**PERFORMANCE:**
• performance mode — if targeting mobile/low-end
• lod on — reduces polygon count at distance
• limit fps 60 — consistent frame rate

**SHARE:**
• Your game runs at: https://crateshipgames.com
• Share the URL — anyone can play instantly, no install`;
  }
  // ── END POLISH COMMANDS ───────────────────────────────────────────────────


  // ── NPC BEHAVIOR COMMANDS ──────────────────────────────────────────────────
  if (/^add patrol(?:ling)? npc$/i.test(cmd) || /^add walking npc$/i.test(cmd)) {
    spawnBehaviorNPC({ glbKey:'human_walk', mode:'patrol', pos:{x:px,y:0,z:pz}, speed:3, waypointRadius:18 });
    return 'Patrolling NPC spawned';
  }
  if (/^add chasing? npc$/i.test(cmd) || /^spawn killer$/i.test(cmd)) {
    spawnBehaviorNPC({ glbKey:'killer_character', mode:'chase', pos:{x:px+20,y:0,z:pz+20}, speed:4, chaseRange:35, waypointRadius:15 });
    return 'Killer NPC spawned — will chase you within 35 units';
  }
  if (/^add following? npc$/i.test(cmd) || /^add companion$/i.test(cmd)) {
    spawnBehaviorNPC({ glbKey:'human_walk', mode:'follow', pos:{x:px+3,y:0,z:pz+3}, speed:4 });
    return 'Companion NPC spawned — follows you';
  }
  if (/^add zombie patrol$/i.test(cmd) || /^add roaming zombie$/i.test(cmd)) {
    spawnBehaviorNPC({ glbKey:'zombie', mode:'patrol', pos:{x:px,y:0,z:pz}, speed:1.5, waypointRadius:12 });
    return 'Roaming zombie spawned';
  }
  if (/^add zombie horde$/i.test(cmd)) {
    for(let i=0;i<5;i++) spawnBehaviorNPC({ glbKey:'zombie', mode:'chase', pos:{x:px+(Math.random()-0.5)*30,y:0,z:pz+20+(Math.random()*15)}, speed:2+Math.random(), chaseRange:40 });
    return 'Zombie horde (5) spawned — they will chase you!';
  }
  if (/^clear npcs?$/i.test(cmd) || /^remove all npcs?$/i.test(cmd)) {
    clearAllNPCAgents();
    return 'All NPC agents cleared';
  }

  // ── SHARE WORLD COMMAND ───────────────────────────────────────────────────
  if (/^share world$/i.test(cmd) || /^share game$/i.test(cmd) || /^get share link$/i.test(cmd)) {
    showToast('📡 Saving world to cloud...');
    try {
      const state = captureWorldState();
      const resp = await fetch('https://crate-engine-ai.koikes2021.workers.dev/save-world', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state)
      });
      const data = await resp.json();
      if (data.url) {
        await navigator.clipboard.writeText(data.url).catch(()=>{});
        // Show share modal
        const modal = document.createElement('div');
        modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:99999;display:flex;align-items:center;justify-content:center;font-family:-apple-system,sans-serif';
        modal.innerHTML='<div style="background:#111;border:1px solid #1a1a1a;border-radius:16px;padding:28px;max-width:480px;width:92vw;text-align:center"><div style="font-size:2.5rem;margin-bottom:12px">🌍</div><div style="font-weight:700;color:#fff;font-size:1.2rem;margin-bottom:6px">World Shared!</div><div style="color:#888;font-size:0.82rem;margin-bottom:18px">Anyone with this link can play your world</div><div style="background:#0a0a0a;border:1px solid #333;border-radius:8px;padding:12px;font-family:monospace;font-size:0.78rem;color:#4ade80;word-break:break-all;margin-bottom:16px">'+data.url+'</div><div style="display:flex;gap:8px"><button onclick="navigator.clipboard.writeText(\'' + data.url + '\');this.textContent=\'✅ Copied!\'" style="flex:1;padding:10px;background:#ff6b35;border:none;border-radius:8px;color:#fff;font-weight:700;cursor:pointer">📋 Copy Link</button><button onclick="this.closest(\'[style*=fixed]\').remove()" style="padding:10px 16px;background:#1a1a1a;border:1px solid #333;border-radius:8px;color:#888;cursor:pointer">Close</button></div></div>';
        document.body.appendChild(modal);
        modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
        return '🔗 World shared! Link copied to clipboard: ' + data.url;
      }
      return 'Share failed: ' + (data.error || 'Unknown error');
    } catch(e) {
      return 'Share failed: ' + e.message;
    }
  }
  // ── END SHARE WORLD ───────────────────────────────────────────────────────

  // ── EMBED COMMANDS ─────────────────────────────────────────────────────────
  if (/^embed code$/i.test(cmd) || /^get embed$/i.test(cmd) || /^iframe code$/i.test(cmd)) {
    const tmpl = window._templateMode || 'play';
    const eurl = 'https://crateshipgames.com/' + (tmpl==='play'?'play.html':tmpl+'/');
    const code = '<iframe src="' + eurl + '" width="800" height="600" frameborder="0" allowfullscreen style="border-radius:12px"></iframe>';
    const modal = document.createElement('div');
    modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:99999;display:flex;align-items:center;justify-content:center;font-family:-apple-system,sans-serif';
    modal.innerHTML='<div style="background:#111;border:1px solid #222;border-radius:16px;padding:28px;max-width:560px;width:92vw"><div style="font-weight:700;color:#ff6b35;margin-bottom:12px;font-size:1.1rem">📋 Embed Your Game</div><div style="color:#888;font-size:0.8rem;margin-bottom:10px">Paste this into any webpage:</div><textarea id="emb-box" style="width:100%;background:#0a0a0a;border:1px solid #333;border-radius:8px;padding:12px;color:#4ade80;font-family:monospace;font-size:0.75rem;resize:none;height:80px" readonly>'+code+'</textarea><div style="display:flex;gap:8px;margin-top:12px"><button onclick="navigator.clipboard.writeText(document.getElementById(\'emb-box\').value);this.textContent=\'✅ Copied!\'" style="flex:1;padding:10px;background:#ff6b35;border:none;border-radius:8px;color:#fff;font-weight:700;cursor:pointer">📋 Copy Code</button><button onclick="this.closest(\'[style*=fixed]\').remove()" style="padding:10px 16px;background:#1a1a1a;border:1px solid #333;border-radius:8px;color:#888;cursor:pointer">Close</button></div></div>';
    document.body.appendChild(modal);
    modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
    return 'Embed code generated';
  }
  // ── END NPC + EMBED COMMANDS ───────────────────────────────────────────────

  // ── WORLD SAVE / LOAD ────────────────────────────────────────────────────
  if (/^save world$/i.test(cmd) || /^save game$/i.test(cmd)) {
    return await saveWorld(window._worldName || 'My World');
  }
  if (/^save world (.+)$/i.test(cmd) || /^save as (.+)$/i.test(cmd)) {
    const name = cmd.match(/(?:save world|save as) (.+)/i)[1].trim();
    return await saveWorld(name);
  }
  if (/^load world$/i.test(cmd) || /^load game$/i.test(cmd) || /^open world$/i.test(cmd)) {
    return openWorldFilePicker();
  }
  if (/^export world$/i.test(cmd)) {
    return await saveWorld(window._worldName || 'My World');
  }
  if (/^world name (.+)$/i.test(cmd)) {
    window._worldName = cmd.match(/world name (.+)/i)[1].trim();
    return 'World named: ' + window._worldName;
  }


  // ── WEATHER COMMANDS ──────────────────────────────────────────────────────
  if (/^rain$/i.test(cmd) || /^start rain$/i.test(cmd)) { startRain(false); return 'Rain started'; }
  if (/^heavy rain$/i.test(cmd) || /^storm$/i.test(cmd)) { startRain(true); return 'Heavy rain/storm'; }
  if (/^snow$/i.test(cmd) || /^start snow$/i.test(cmd)) { startSnow(); return 'Snow started'; }
  if (/^lightning$/i.test(cmd) || /^thunder(storm)?$/i.test(cmd)) { startLightning(); return 'Lightning storm started'; }
  if (/^(stop|clear) weather$/i.test(cmd) || /^no rain$/i.test(cmd) || /^no snow$/i.test(cmd)) { stopWeather(); return 'Weather cleared'; }
  if (/^horror weather$/i.test(cmd)) { startRain(true); startLightning(); return 'Horror storm: heavy rain + lightning'; }

  // ── DAY/NIGHT CYCLE COMMANDS ───────────────────────────────────────────────
  if (/^(start |enable )?day.?night( cycle)?$/i.test(cmd) || /^auto time$/i.test(cmd)) {
    startDayNightCycle(1); return 'Day/night cycle started (1x speed)';
  }
  if (/^day.?night (fast|2x|3x|5x)$/i.test(cmd)) {
    const speed = cmd.match(/(\d+)x/i)?.[1] || 3;
    startDayNightCycle(+speed); return `Day/night cycle at ${speed}x speed`;
  }
  if (/^stop (day.?night|cycle|auto time)$/i.test(cmd)) { stopDayNightCycle(); return 'Day/night cycle stopped'; }

  // ── QUEST COMMANDS ─────────────────────────────────────────────────────────
  if (/^add quest (.+)$/i.test(cmd)) {
    const name = cmd.match(/add quest (.+)/i)[1].trim();
    addQuest(name);
    return 'Quest added: ' + name;
  }
  if (/^complete quest (.+)$/i.test(cmd) || /^finish quest (.+)$/i.test(cmd)) {
    const name = cmd.match(/(?:complete|finish) quest (.+)/i)[1].trim();
    const id = name.toLowerCase().replace(/\s+/g,'_');
    if (_quests[id]) { completeQuest(id); return 'Quest completed: ' + name; }
    return 'Quest not found: ' + name;
  }
  if (/^game over$/i.test(cmd) || /^you died$/i.test(cmd)) {
    showGameOver('You were caught.'); return 'Game over screen shown';
  }
  if (/^win( game)?$/i.test(cmd) || /^you win$/i.test(cmd)) {
    showWinScreen('Victory!'); return 'Win screen shown';
  }
  if (/^(show |list )?quests?$/i.test(cmd)) {
    const qs = Object.values(_quests);
    if (!qs.length) return 'No active quests';
    return qs.map(q => `${q.completed?'✅':'📋'} ${q.name}`).join('\n');
  }

  // ── AUTOSAVE COMMANDS ─────────────────────────────────────────────────────
  if (/^autosave( on)?$/i.test(cmd)) { startAutosave(60); return 'Autosave enabled (every 60s)'; }
  if (/^autosave off$/i.test(cmd)) { if(_autosaveInterval){clearInterval(_autosaveInterval);_autosaveInterval=null;} return 'Autosave disabled'; }

  // ── END NEW COMMANDS ───────────────────────────────────────────────────────

  // ── AUDIO COMMANDS ────────────────────────────────────────────────────────
  if (/^play (chainsaw|chainsaw_idle|chainsaw idle)$/i.test(cmd)) {
    await playSound('chainsaw_idle', true, 0.6);
    return 'Chainsaw sound playing (looping)';
  }
  if (/^play heartbeat$/i.test(cmd)) {
    await playSound('heartbeat', true, 0.5);
    return 'Heartbeat sound playing';
  }
  if (/^play (horror music|horror_music|scary music)$/i.test(cmd)) {
    await playSound('event_music', true, 0.4);
    return 'Horror music playing';
  }
  if (/^play (menu music|menumusic)$/i.test(cmd)) {
    await playSound('menu_music', true, 0.4);
    return 'Menu music playing';
  }
  if (/^play (police siren|siren)$/i.test(cmd)) {
    await playSound('police_siren', false, 0.7);
    return 'Police siren playing';
  }
  if (/^play (door open|dooropen)$/i.test(cmd)) {
    await playSound('door_open', false, 0.8);
    return 'Door opening sound';
  }
  if (/^play hunter$/i.test(cmd)) {
    await playSound('hunter_chase', true, 0.5);
    return 'Hunter chase music playing';
  }
  if (/^play (sword|sword swing)$/i.test(cmd)) {
    await playSound('sword_swing', false, 0.9);
    return 'Sword swing sound';
  }
  if (/^play (shotgun|gunshot)$/i.test(cmd)) {
    await playSound('shotgun', false, 0.9);
    return 'Shotgun sound';
  }
  if (/^stop (music|audio|sound|all sounds?)$/i.test(cmd)) {
    stopAllSounds();
    return 'All sounds stopped';
  }
  if (/^play sound (.+)$/i.test(cmd)) {
    const key = cmd.match(/play sound (.+)/i)[1].trim().replace(/ /g,'_');
    const ok = await playSound(key, false, 0.8);
    return ok ? `Playing: ${key}` : `Sound not found: ${key}. Available: ${Object.keys(HORROR_AUDIO).join(', ')}`;
  }
  if (/^list (sounds?|audio)$/i.test(cmd)) {
    return 'Available sounds: ' + Object.keys(HORROR_AUDIO).join(', ');
  }

  // ── DIALOGUE EDITOR ───────────────────────────────────────────────────────
  if (/^(dialogue editor|npc editor|open dialogue)$/i.test(cmd)) {
    showDialogueEditor('NPC_1');
    return 'Dialogue editor opened';
  }
  if (/^dialogue editor (.+)$/i.test(cmd) || /^edit dialogue (.+)$/i.test(cmd)) {
    const name = cmd.match(/(?:dialogue editor|edit dialogue) (.+)/i)[1].trim();
    showDialogueEditor(name);
    return 'Dialogue editor opened for ' + name;
  }
  if (/^show dialogue (.+)$/i.test(cmd) || /^preview dialogue (.+)$/i.test(cmd)) {
    const name = cmd.match(/(?:show|preview) dialogue (.+)/i)[1].trim();
    showDialoguePreview(name);
    return 'Dialogue preview: ' + name;
  }

  // ── TERRAIN PAINTER ───────────────────────────────────────────────────────
  if (/^(terrain paint|paint terrain|terrain painter|open painter)$/i.test(cmd)) {
    showTerrainPaintUI();
    return 'Terrain painter opened — click ground to paint texture zones';
  }
  if (/^paint (mode|brush)$/i.test(cmd)) {
    showTerrainPaintUI();
    return 'Terrain painter opened';
  }
  // ── END NEW COMMANDS ──────────────────────────────────────────────────────



  if (_galBypass.test(rawCmd.toLowerCase().trim())) {
    console.log('[GALLERY] Bypassing NL for gallery command:', rawCmd);
    const parts = rawCmd.split(/\s+(?:and|with|plus|,|\+)\s+/i).map(s => s.trim()).filter(Boolean);
    const results = [];
    for (const part of parts) { results.push(await execSingle(part)); }
    return results.filter(Boolean).join('\n');
  }
  // Try natural language matching first (77K+ phrases)
  const nlMatch = matchIntent(rawCmd);
  if (nlMatch && nlMatch.id !== 'noop' && nlMatch.id !== 'confirm' && nlMatch.id !== 'cancel') {
    let nlAction = nlMatch.action;
    
    // Fix redirects for better results
    const actionFixes = {
      'add mountain': 'terrain mountains',
      'add mountains': 'terrain mountains',
      'medieval village': 'Medieval Village',
      'medieval town': 'Medieval Village',
      'pirate island': 'Pirate Island',
      'add hills': 'terrain hills',
      'add canyon': 'terrain canyon',
      'add volcano': 'terrain volcano',
      'add island': 'terrain island',
      'add dunes': 'terrain dunes',
    };

    // Commands that should NEVER be rewritten by NL — pass through raw
    const rawLower = rawCmd.toLowerCase().trim();
    if (rawLower.startsWith('color ') || rawLower.startsWith('paint ') || 
        rawLower.startsWith('remove ') || rawLower.startsWith('delete ') ||
        rawLower.startsWith('expand ') || rawLower === 'expand world' ||
        rawLower === 'bigger world' || rawLower === 'new platform' ||
        rawLower.startsWith('save ') || rawLower === 'save' ||
        rawLower.startsWith('load ') || rawLower === 'load' || rawLower === 'saves' ||
        rawLower.startsWith('resize ') || rawLower.startsWith('scale ') ||
        rawLower.startsWith('rotate ') ||
        rawLower.startsWith('wet') || rawLower === 'dry' || rawLower === 'dry ground' ||
        rawLower.startsWith('particles ') || rawLower.startsWith('particle ') ||
        rawLower.startsWith('terrain ') || rawLower === 'clear' || rawLower === 'reset' ||
        rawLower.startsWith('graphics ') || rawLower.startsWith('time ') ||
        rawLower.startsWith('fog') || rawLower === 'rain' || rawLower === 'snow' ||
        rawLower.startsWith('make it ') ||
        rawLower.startsWith('move ') || rawLower === 'list' || rawLower === 'list objects' ||
        rawLower.startsWith('teleport ') || rawLower.startsWith('tp ') ||
        rawLower.startsWith('goto ') || rawLower.startsWith('go to ') ||
        rawLower === 'scripts' || rawLower === 'custom scripts' || rawLower.startsWith('script ') ||
        rawLower === 'new script' || rawLower === 'custom code' || rawLower === 'code editor' ||
        rawLower.startsWith('add ') || rawLower.startsWith('create ') ||
        rawLower.startsWith('build ') || rawLower.startsWith('spawn ') ||
        rawLower.startsWith('drive ') || rawLower.startsWith('enter ') ||
        rawLower.startsWith('ride ') || rawLower.startsWith('mount ') ||
        rawLower === 'exit vehicle' || rawLower === 'get out' || rawLower === 'stop driving' ||
        rawLower.includes('village') || rawLower.includes('medieval') ||
        rawLower.includes('cyberpunk') || rawLower.includes('pirate') ||
        rawLower.includes('zombie') || rawLower.includes('graveyard') ||
        rawLower.includes('space') || rawLower.includes('dungeon') ||
        rawLower.includes('wasteland') || rawLower.includes('temple') ||
        rawLower.includes('haunted') || rawLower.includes('enchanted') || rawLower.includes('ocean') || rawLower.includes('lake') || rawLower.includes('pond') || rawLower.includes('sea') ||
        rawLower.includes('fortress') || rawLower.includes('halloween') ||
        rawLower.startsWith('water ') || rawLower === 'water' ||
        rawLower.startsWith('equip ') || rawLower === 'unequip' || rawLower.startsWith('swap ') ||
        rawLower === 'play' || rawLower === 'edit' || rawLower === 'play mode' || rawLower === 'edit mode' ||
        rawLower === 'city 3' || rawLower === 'full city' || rawLower === 'city world 3' ||
        rawLower === 'build city 3' || rawLower === 'generate city' || rawLower === 'build city' ||
        rawLower === 'horror' || rawLower === 'horror game' || rawLower === 'horror world' || rawLower === 'build horror' ||
        rawLower === 'space' || rawLower === 'space game' || rawLower === 'space world' || rawLower === 'space station' || rawLower === 'build space' ||
        rawLower === 'inventory' || rawLower === 'help' || rawLower === 'stats' ||
        rawLower.startsWith('generate ') || rawLower === 'generator' || rawLower === '3d generator' ||
        rawLower.startsWith('interior ') || rawLower.endsWith('story house') ||
        rawLower === 'show weapons' || rawLower === 'show inventory') {
      rawCmd = rawLower; // Skip NL rewrite
      return (await execSingle(rawCmd)) || '';
    }
    if (actionFixes[nlAction]) nlAction = actionFixes[nlAction];
    
    if (nlAction !== rawCmd.toLowerCase().trim()) {
      console.log('[NL] "' + rawCmd + '" → "' + nlAction + '" (' + nlMatch.id + ')');
      if (nlAction !== rawCmd) {
        rawCmd = nlAction;
      }
    }
  }
  // Split compound commands on "and", "with", ",", "+"
  const parts = rawCmd.split(/\s+(?:and|with|plus|,|\+)\s+/i).map(s => s.trim()).filter(Boolean);
  const results = [];
  
  for (const part of parts) {
    results.push(await execSingle(part));
  }
  return results.join('\n');
}

const undoStack = [];


// === IndexedDB Model Storage ===
const _modelDB = {
  _db: null,
  async open() {
    if (this._db) return this._db;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('crate-models', 1);
      req.onupgradeneeded = () => { req.result.createObjectStore('models', { keyPath: 'id' }); };
      req.onsuccess = () => { this._db = req.result; resolve(this._db); };
      req.onerror = () => reject(req.error);
    });
  },
  async save(id, name, category, blob) {
    const db = await this.open();
    const reader = new FileReader();
    return new Promise((resolve) => {
      reader.onload = () => {
        const tx = db.transaction('models', 'readwrite');
        tx.objectStore('models').put({ id, name, category, data_b64: reader.result.split(',')[1], created: Date.now() });
        tx.oncomplete = () => resolve(true);
      };
      reader.readAsDataURL(blob);
    });
  },
  async get(id) {
    const db = await this.open();
    return new Promise((resolve) => {
      const tx = db.transaction('models', 'readonly');
      const req = tx.objectStore('models').get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  },
  async getAll() {
    const db = await this.open();
    return new Promise((resolve) => {
      const tx = db.transaction('models', 'readonly');
      const req = tx.objectStore('models').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  },
  blobFromB64(b64) {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    return new Blob([bytes], { type: 'model/gltf-binary' });
  }
};
window._modelDB = _modelDB;

// === INLINE ASSET GALLERY ===
let _assetCatalog = null;
async function _loadAssetCatalog() {
  if (_assetCatalog) return _assetCatalog;
  try {
    const r = await fetch('asset-catalog.json?v=295');
    _assetCatalog = await r.json();
  } catch(e) { _assetCatalog = {}; }
  
  // Merge IndexedDB models (marketplace + user-generated — persisted as blobs)
  try {
    const dbModels = await _modelDB.getAll();
    dbModels.forEach(m => {
      const cat = (m.category || 'premium').toLowerCase();
      if (!_assetCatalog[cat]) _assetCatalog[cat] = [];
      if (!_assetCatalog[cat].find(a => a.file === m.id)) {
        _assetCatalog[cat].push({ name: (m.name || m.id) + ' ✨', file: m.id, source: 'user-saved', _b64: m.data_b64 });
      }
    });
  } catch(e) { console.warn('[Catalog] IndexedDB merge failed:', e); }
  
  // Merge legacy localStorage user models
  try {
    const userModels = JSON.parse(localStorage.getItem('crate-user-models') || '[]');
    userModels.forEach(m => {
      const cat = (m.category || 'food').toLowerCase();
      if (!_assetCatalog[cat]) _assetCatalog[cat] = [];
      if (!_assetCatalog[cat].find(a => a.file === m.id + '.glb')) {
        _assetCatalog[cat].push({ name: m.name + ' ✨', file: m.id + '.glb', source: 'user-generated', _b64: m.data_b64 });
      }
    });
  } catch(e) {}
  
  // Merge legacy marketplace localStorage entries
  try {
    const userKey = (window._crateAuth && window._crateAuth.isLoggedIn) ? 'engine_marketplace_models_' + window._crateAuth.user.id : 'engine_marketplace_models';
    const saved = JSON.parse(localStorage.getItem(userKey) || '[]');
    saved.forEach(m => {
      const cat = (m.category || 'premium').toLowerCase();
      if (!_assetCatalog[cat]) _assetCatalog[cat] = [];
      if (!_assetCatalog[cat].find(a => a.file === m.file)) {
        _assetCatalog[cat].push({ name: m.name, file: m.file, source: 'marketplace' });
      }
    });
  } catch(e) {}
  
  // Create "My Models" virtual category — all user-saved/generated/marketplace models
  const myModels = [];
  for (const cat of Object.keys(_assetCatalog)) {
    for (const item of _assetCatalog[cat]) {
      if (item.source === 'user-saved' || item.source === 'user-generated' || item.source === 'marketplace') {
        myModels.push({ ...item, _fromCategory: cat });
      }
    }
  }
  if (myModels.length > 0) {
    _assetCatalog['my-models'] = myModels;
  }
  
  return _assetCatalog;
}

const _CAT_META = {
  characters: { icon: '🧑', color: '#ffd700', label: 'Characters' },
  weapons: { icon: '⚔️', color: '#ef4444', label: 'Weapons' },
  buildings: { icon: '🏠', color: '#8b5cf6', label: 'Buildings' },
  vehicles: { icon: '🚗', color: '#f97316', label: 'Cars & Vehicles' },
  roads: { icon: '🛣️', color: '#6b7280', label: 'Roads & Bridges' },
  'city-props': { icon: '🏙️', color: '#06b6d4', label: 'City Props' },
  medieval: { icon: '🏰', color: '#b45309', label: 'Medieval' },
  horror: { icon: '💀', color: '#7c3aed', label: 'Horror & Graveyard' },
  dungeon: { icon: '🗝️', color: '#4b5563', label: 'Dungeon' },
  fantasy: { icon: '🧙', color: '#a855f7', label: 'Fantasy & RPG' },
  pirate: { icon: '🏴‍☠️', color: '#0891b2', label: 'Pirate' },
  cyberpunk: { icon: '🤖', color: '#22d3ee', label: 'Cyberpunk' },
  survival: { icon: '🪓', color: '#65a30d', label: 'Survival' },
  farming: { icon: '🌾', color: '#84cc16', label: 'Crops & Farming' },
  animals: { icon: '🦊', color: '#fb923c', label: 'Animals & Creatures' },
  ships: { icon: '⛵', color: '#0ea5e9', label: 'Ships & Boats' },
  platformer: { icon: '🎮', color: '#ec4899', label: 'Platformer' },
  rocks: { icon: '🪨', color: '#78716c', label: 'Rocks & Terrain' },
  'unity-assets': { icon: '🎯', color: '#16a34a', label: 'Unity Assets' },
  'hd-assets': { icon: '💎', color: '#e11d48', label: 'HD Assets' },
  misc: { icon: '📦', color: '#64748b', label: 'Misc' },
  vehicles: { icon: '🚗', color: '#3b82f6', label: 'Vehicles' },
  animals: { icon: '🐾', color: '#22c55e', label: 'Animals' },
  trees: { icon: '🌳', color: '#16a34a', label: 'Trees & Plants' },
  rocks: { icon: '🪨', color: '#78716c', label: 'Rocks & Minerals' },
  furniture: { icon: '🪑', color: '#d97706', label: 'Furniture' },
  food: { icon: '🍖', color: '#f59e0b', label: 'Food & Items' },
  dungeon: { icon: '💀', color: '#6b21a8', label: 'Dungeon' },
  scifi: { icon: '🚀', color: '#06b6d4', label: 'Sci-Fi' },
  modern: { icon: '🏙️', color: '#64748b', label: 'Modern' },
  nature: { icon: '⛺', color: '#84cc16', label: 'Nature & Survival' },
  terrain: { icon: '🏔️', color: '#6b8e23', label: 'Terrain & Landscapes' },
  animations: { icon: '🎬', color: '#ec4899', label: 'Animations' },
  premium: { icon: '💎', color: '#a855f7', label: 'Premium / Marketplace' },
  'my-models': { icon: '⭐', color: '#f59e0b', label: 'My Models' },
};

function showGallery(category, options = {}) {
  console.log('[GALLERY] Opening:', category);
  return new Promise(async (resolve) => {
    const catalog = await _loadAssetCatalog();
    const items = catalog[category];
    if (!items || items.length === 0) { resolve(null); return; }

    const meta = _CAT_META[category] || { icon: '📦', color: '#888', label: category };
    let searchTerm = '';
    let currentPage = 0;
    const PAGE_SIZE = 30;

    const overlay = document.createElement('div');
    overlay.id = 'asset-gallery-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.94);z-index:10005;display:flex;flex-direction:column;font-family:monospace;color:#e0e0e0;';

    // Header
    const header = document.createElement('div');
    header.style.cssText = 'padding:16px 24px;display:flex;align-items:center;gap:16px;border-bottom:1px solid #222;flex-shrink:0;';
    header.innerHTML = '<div style="font-size:24px;color:' + meta.color + ';">' + meta.icon + ' ' + meta.label + '</div><div id="gal-count" style="font-size:13px;color:#666;">' + items.length + ' models</div>';
    
    const searchInput = document.createElement('input');
    searchInput.placeholder = '🔍 Search...';
    searchInput.style.cssText = 'margin-left:auto;padding:8px 14px;background:#1a1a1a;border:1px solid #333;border-radius:8px;color:#e0e0e0;font-family:monospace;font-size:13px;width:220px;outline:none;';
    searchInput.oninput = () => { searchTerm = searchInput.value.toLowerCase(); currentPage = 0; renderItems(); };
    header.appendChild(searchInput);

    const closeBtn = document.createElement('div');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'font-size:24px;color:#666;cursor:pointer;margin-left:16px;';
    closeBtn.onclick = () => { overlay.remove(); resolve(null); };
    header.appendChild(closeBtn);
    overlay.appendChild(header);

    // Scroll area
    const scrollArea = document.createElement('div');
    scrollArea.style.cssText = 'flex:1;overflow-y:auto;padding:20px;';
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,160px);gap:14px;justify-content:center;max-width:1100px;margin:0 auto;';
    scrollArea.appendChild(grid);
    const pager = document.createElement('div');
    pager.style.cssText = 'display:flex;justify-content:center;gap:10px;padding:16px;align-items:center;';
    scrollArea.appendChild(pager);
    overlay.appendChild(scrollArea);

    function getFiltered() {
      return searchTerm ? items.filter(m => m.name.toLowerCase().includes(searchTerm)) : items;
    }

    function renderItems() {
      grid.innerHTML = '';
      const filtered = getFiltered();
      const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
      const pageItems = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
      
      const countEl = document.getElementById('gal-count');
      if (countEl) countEl.textContent = (searchTerm ? filtered.length + ' of ' : '') + items.length + ' models';

      pageItems.forEach(item => {
        const card = document.createElement('div');
        card.style.cssText = 'background:#111;border:2px solid transparent;border-radius:10px;overflow:hidden;cursor:pointer;transition:all 0.2s;';
        card.onmouseenter = () => { card.style.borderColor = meta.color; card.style.transform = 'translateY(-3px)'; };
        card.onmouseleave = () => { card.style.borderColor = 'transparent'; card.style.transform = 'none'; };

        // Thumbnail — render with shared offscreen canvas
        const imgEl = document.createElement('div');
        imgEl.style.cssText = 'width:100%;height:130px;background:#0d0d0d;display:flex;align-items:center;justify-content:center;color:#444;font-size:32px;';
        imgEl.textContent = meta.icon;
        card.appendChild(imgEl);

        // Lazy load 3D preview
        const obs = new IntersectionObserver((entries) => {
          if (entries[0].isIntersecting) {
            obs.disconnect();
            _renderThumb(item.file, imgEl, meta.icon);
          }
        }, { root: scrollArea, threshold: 0.1 });
        obs.observe(card);

        const nameEl = document.createElement('div');
        nameEl.style.cssText = 'padding:8px 10px;font-size:11px;color:#bbb;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
        nameEl.textContent = item.name;
        nameEl.title = item.name;
        card.appendChild(nameEl);

        card.onclick = () => { overlay.remove(); resolve({ file: item.file, name: item.name, category }); };
        grid.appendChild(card);
      });

      // Pagination
      pager.innerHTML = '';
      if (totalPages > 1) {
        const mkBtn = (text, enabled, fn) => {
          const b = document.createElement('button');
          b.textContent = text;
          b.style.cssText = 'padding:6px 14px;background:#1a1a1a;border:1px solid #333;border-radius:6px;color:#aaa;cursor:pointer;font-family:monospace;' + (!enabled ? 'opacity:0.3;' : '');
          if (enabled) b.onclick = fn;
          return b;
        };
        pager.appendChild(mkBtn('← Prev', currentPage > 0, () => { currentPage--; renderItems(); scrollArea.scrollTop = 0; }));
        const info = document.createElement('span');
        info.style.cssText = 'color:#666;font-size:13px;';
        info.textContent = 'Page ' + (currentPage + 1) + ' of ' + totalPages;
        pager.appendChild(info);
        pager.appendChild(mkBtn('Next →', currentPage < totalPages - 1, () => { currentPage++; renderItems(); scrollArea.scrollTop = 0; }));
      }
    }

    renderItems();
    document.body.appendChild(overlay);
    searchInput.focus();

    // ESC to close
    const escH = (e) => { if (e.key === 'Escape') { document.removeEventListener('keydown', escH); overlay.remove(); resolve(null); } };
    document.addEventListener('keydown', escH);
  });
}

// Single offscreen renderer for thumbnails
let _thumbRenderer = null;
function _renderThumb(file, container, fallbackIcon) {
  if (!_thumbRenderer) {
    const c = document.createElement('canvas');
    c.width = 320; c.height = 260;
    _thumbRenderer = new THREE.WebGLRenderer({ canvas: c, antialias: true, preserveDrawingBuffer: true });
    _thumbRenderer.setSize(320, 260);
    _thumbRenderer.setClearColor(0x0d0d0d, 1);
  }
  const s = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(40, 320/260, 0.1, 100);
  cam.position.set(0, 1.2, 3.5);
  cam.lookAt(0, 0.6, 0);
  s.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dl = new THREE.DirectionalLight(0xffffff, 1.2);
  dl.position.set(2, 4, 3);
  s.add(dl);

  gltfLoader.load('/models/' + (file.endsWith('.glb') ? file : file + '.glb'), (gltf) => {
    const m = gltf.scene;
    const box = new THREE.Box3().setFromObject(m);
    const sz = box.getSize(new THREE.Vector3());
    m.scale.setScalar(2 / Math.max(Math.max(sz.x, sz.y, sz.z), 0.001));
    const b2 = new THREE.Box3().setFromObject(m);
    const c = b2.getCenter(new THREE.Vector3());
    m.position.sub(c);
    const b3 = new THREE.Box3().setFromObject(m);
    m.position.y -= b3.min.y;
    m.rotation.y = Math.PI * 0.25;
    s.add(m);
    _thumbRenderer.render(s, cam);
    const img = document.createElement('img');
    img.src = _thumbRenderer.domElement.toDataURL('image/jpeg', 0.8);
    img.style.cssText = 'width:100%;height:130px;display:block;object-fit:cover;';
    container.replaceWith(img);
    // Cleanup
    s.traverse(obj => { if (obj.geometry) obj.geometry.dispose(); if (obj.material) { (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach(mt => { if(mt.map) mt.map.dispose(); mt.dispose(); }); } });
  }, undefined, () => {
    container.textContent = '❌';
  });
}

function showCategoryPicker() {
  return new Promise(async (resolve) => {
    showToast('📦 Opening asset library...');
    let catalog;
    try { catalog = await _loadAssetCatalog(); } catch(e) { catalog = {}; }
    // Remove any existing picker
    const existing = document.getElementById('_catPicker');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.id = '_catPicker';
    // Use maximum possible z-index to avoid stacking context issues
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.96);z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:monospace;';
    // Header stays fixed, grid scrolls
    const header = document.createElement('div');
    header.style.cssText = 'text-align:center;padding:24px 24px 16px;flex-shrink:0;width:100%;';
    header.innerHTML = '<div style="font-size:28px;color:#ffd700;margin-bottom:6px;">📦 ASSET LIBRARY</div><div style="font-size:13px;color:#555;margin-bottom:16px;">4,122 models across 26 categories</div><input id="_catSearch" placeholder="🔍  Search categories..." style="background:#111;border:1px solid #333;color:#fff;padding:8px 14px;border-radius:8px;font-size:13px;width:260px;outline:none;" />';
    overlay.appendChild(header);
    // Scrollable grid wrapper
    const scrollWrap = document.createElement('div');
    scrollWrap.style.cssText = 'flex:1;overflow-y:auto;width:100%;padding:0 24px 24px;box-sizing:border-box;';
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,180px);gap:16px;justify-content:center;max-width:960px;margin:0 auto;';
    
    ['characters', ...Object.keys(catalog)].forEach(cat => {
      const m = _CAT_META[cat] || { icon: '📦', color: '#888', label: cat };
      const count = cat === 'characters' ? CHARACTER_LIBRARY.length : (catalog[cat]?.length || 0);
      if (!count) return;
      const card = document.createElement('div');
      card.style.cssText = 'padding:24px 16px;background:rgba(255,255,255,0.03);border:2px solid ' + m.color + '30;border-radius:12px;cursor:pointer;text-align:center;transition:all 0.2s;';
      card.dataset.cat = (cat + ' ' + m.label).toLowerCase();
      card.onmouseenter = () => { card.style.borderColor = m.color; card.style.transform = 'scale(1.04)'; };
      card.onmouseleave = () => { card.style.borderColor = m.color + '30'; card.style.transform = 'scale(1)'; };
      card.innerHTML = '<div style="font-size:40px;margin-bottom:8px;">' + m.icon + '</div><div style="font-size:15px;font-weight:bold;color:' + m.color + ';margin-bottom:4px;">' + m.label + '</div><div style="font-size:12px;color:#555;">' + count + ' models</div>';
      card.onclick = () => { overlay.remove(); if (cat === 'characters') { showCharacterGallery().then(resolve); } else { showGallery(cat).then(resolve); } };
      grid.appendChild(card);
    });
    scrollWrap.appendChild(grid);
    overlay.appendChild(scrollWrap);

    // Category search filter
    setTimeout(() => {
      const si = document.getElementById('_catSearch');
      if (si) si.addEventListener('input', () => {
        const q = si.value.toLowerCase();
        grid.querySelectorAll('[data-cat]').forEach(card => {
          card.style.display = card.dataset.cat.includes(q) || !q ? '' : 'none';
        });
      });
    }, 50);

    const closeBtn = document.createElement('div');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'position:fixed;top:15px;right:20px;font-size:28px;color:#fff;cursor:pointer;z-index:2147483647;background:rgba(0,0,0,0.5);border-radius:50%;width:40px;height:40px;display:flex;align-items:center;justify-content:center;';
    closeBtn.onclick = () => { overlay.remove(); resolve(null); };
    overlay.appendChild(closeBtn);
    document.body.appendChild(overlay);
    const esc = (e) => { if (e.key === 'Escape') { document.removeEventListener('keydown', esc); overlay.remove(); resolve(null); } };
    document.addEventListener('keydown', esc);
  });
}

function showAnimationGallery(targetName) {
  const ANIMS = [
    { id:'spin',name:'Spin',desc:'Rotation',icon:'🔄' },{ id:'bounce',name:'Bounce',desc:'Up/down',icon:'⬆️' },
    { id:'float',name:'Float',desc:'Floating',icon:'☁️' },{ id:'pulse',name:'Pulse',desc:'Scale pulse',icon:'💫' },
    { id:'wobble',name:'Wobble',desc:'Side sway',icon:'↔️' },{ id:'orbit',name:'Orbit',desc:'Circle',icon:'🌀' },
    { id:'swing',name:'Swing',desc:'Pendulum',icon:'🔔' },{ id:'breathe',name:'Breathe',desc:'Breathing',icon:'🫁' },
    { id:'shake',name:'Shake',desc:'Vibration',icon:'📳' },{ id:'walk',name:'Walk',desc:'Walk bob',icon:'🚶' },
    { id:'idle',name:'Idle',desc:'Subtle',icon:'🧍' },{ id:'dance',name:'Dance',desc:'Dance moves',icon:'💃' },
    { id:'attack',name:'Attack',desc:'Lunge',icon:'⚔️' },{ id:'die',name:'Die',desc:'Death fall',icon:'💀' },
    { id:'jump',name:'Jump',desc:'Jump',icon:'🦘' },
  ];
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.92);z-index:10005;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:monospace;';
    overlay.innerHTML = '<div style="font-size:24px;color:#ec4899;margin-bottom:6px;">🎬 ANIMATIONS</div><div style="font-size:13px;color:#666;margin-bottom:24px;">' + (targetName ? 'Apply to: ' + targetName : 'Choose animation') + '</div>';
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,130px);gap:14px;justify-content:center;max-width:700px;';
    ANIMS.forEach(a => {
      const card = document.createElement('div');
      card.style.cssText = 'padding:18px 10px;background:rgba(236,72,153,0.05);border:2px solid rgba(236,72,153,0.2);border-radius:10px;cursor:pointer;text-align:center;transition:all 0.2s;';
      card.onmouseenter = () => { card.style.borderColor = '#ec4899'; card.style.transform = 'scale(1.05)'; };
      card.onmouseleave = () => { card.style.borderColor = 'rgba(236,72,153,0.2)'; card.style.transform = 'scale(1)'; };
      card.innerHTML = '<div style="font-size:28px;margin-bottom:6px;">' + a.icon + '</div><div style="font-size:13px;color:#ec4899;font-weight:bold;">' + a.name + '</div><div style="font-size:10px;color:#666;">' + a.desc + '</div>';
      card.onclick = () => { overlay.remove(); resolve({ animId: a.id, animName: a.name, target: targetName }); };
      grid.appendChild(card);
    });
    overlay.appendChild(grid);
    const closeBtn = document.createElement('div'); closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'position:fixed;top:15px;right:20px;font-size:28px;color:#fff;cursor:pointer;z-index:2147483647;background:rgba(0,0,0,0.5);border-radius:50%;width:40px;height:40px;display:flex;align-items:center;justify-content:center;';
    closeBtn.onclick = () => { overlay.remove(); resolve(null); };
    overlay.appendChild(closeBtn);
    document.body.appendChild(overlay);
    const esc = (e) => { if (e.key === 'Escape') { document.removeEventListener('keydown', esc); overlay.remove(); resolve(null); } };
    document.addEventListener('keydown', esc);
  });
}
// === END INLINE ASSET GALLERY ===

async function execSingle(cmd) {

  // === FAB ASSET COMMANDS ===
  if (cmd === 'fab' || cmd === 'fab assets' || cmd === 'show fab') {
    showFabGallery();
    return;
  }
  if (cmd.startsWith('add fab ') || cmd.startsWith('spawn fab ')) {
    const fabName = cmd.replace(/^(add|spawn) fab /, '').trim().replace(/ /g, '_').toLowerCase();
    const fabAliases = window._fabAliases || {};
    const modelPath = fabAliases[fabName] || GLB_MODELS[fabName];
    if (modelPath) {
      spawnGLB(modelPath, fabName);
      if (typeof addMsg === 'function') addMsg('✅ ' + fabName + ' spawned');
    } else {
      addMsg('❌ Fab model not found: ' + fabName + '. Try: fab assets');
    }
    return;
  }

  sceneHistory.push(cmd);
  const lower = cmd.toLowerCase().trim();

  // === V215 NEW COMMANDS ===
  if (lower === 'photo mode' || lower === 'photo' || lower === 'camera mode') {
    if (window._togglePhotoMode) window._togglePhotoMode();
    return '📸 Photo mode ' + (_photoMode ? 'ON' : 'OFF');
  }
  if (lower === 'compass' || lower === 'show compass' || lower === 'toggle compass') {
    createCompass();
    return '🧭 Compass enabled';
  }
  if (lower === 'crosshair' || lower === 'show crosshair' || lower === 'toggle crosshair') {
    const ch = document.getElementById('crosshair');
    showCrosshair(!ch || ch.style.display === 'none');
    return '🎯 Crosshair toggled';
  }
  if (lower === 'grapple' || lower === 'grappling hook' || lower === 'hook') {
    if (window._grappleHook) window._grappleHook();
    return '🪝 Grappling hook fired! (Press G in play mode)';
  }
  if (lower === 'first person' || lower === 'fps' || lower === 'fp' || lower === '1st person') {
    if (characterController) { characterController._firstPerson = true; if (characterController.model) characterController.model.visible = false; }
    return '👁 First person mode';
  }
  if (lower === 'third person' || lower === 'tps' || lower === 'tp' || lower === '3rd person') {
    if (characterController) { characterController._firstPerson = false; if (characterController.model) characterController.model.visible = true; }
    return '👤 Third person mode';
  }
  if (lower.match(/^make .+ destructible$/) || lower.match(/^destructible$/)) {
    // Make last placed or selected object destructible
    const target = selectedObj || (window._sceneObjects && window._sceneObjects[window._sceneObjects.length - 1]);
    if (target) { makeDestructible(target); return '💥 Object is now destructible (shoot or press E to break)'; }
    return '⚠ No object to make destructible';
  }
  if (lower === 'destroy all' || lower === 'break all') {
    const list = [..._destructibles];
    list.forEach(m => shatterObject(m));
    return '💥 Destroyed ' + list.length + ' objects';
  }
  if (lower === 'double jump' || lower === 'enable double jump') {
    window._setMaxJumps(2);
    return '⬆ Double jump enabled';
  }
  if (lower === 'triple jump') {
    window._setMaxJumps(3);
    return '⬆ Triple jump enabled';
  }
  if (lower === 'slide' || lower === 'enable slide') {
    return '🏃 Slide: Press C while sprinting';
  }

  // === WEATHER COMMANDS ===
  if (lower === 'rain' || lower === 'make it rain' || lower === 'start rain') {
    setWeather('rain'); return '🌧️ Rain started';
  }
  if (lower === 'snow' || lower === 'make it snow' || lower === 'start snow') {
    setWeather('snow'); return '❄️ Snow started';
  }
  if (lower === 'storm' || lower === 'thunderstorm' || lower === 'thunder') {
    setWeather('storm'); return '⛈️ Thunderstorm!';
  }
  if (lower === 'clear weather' || lower === 'stop rain' || lower === 'stop snow' || lower === 'weather off' || lower === 'weather clear') {
    setWeather(null); scene.fog = null; return '☀️ Weather cleared';
  }

  // === TIME OF DAY COMMANDS (v215) ===
  const _timeMatch = lower.match(/^(?:set )?time\s+(morning|sunrise|dawn|day|noon|afternoon|evening|sunset|dusk|night|midnight)/);
  if (_timeMatch) {
    const timeMap = { morning: 7, sunrise: 6, dawn: 5.5, day: 12, noon: 12, afternoon: 15, evening: 18, sunset: 19, dusk: 20, night: 22, midnight: 0 };
    const t = _timeMatch[1];
    _dayTime = timeMap[t] || 12;
    _dayNightCycle = true;
    if (typeof setSkyTime === 'function') {
      const hourAngle = (_dayTime - 6) / 12 * Math.PI;
      const elevation = Math.sin(hourAngle) * 60;
      const azimuth = 180 + (_dayTime / 24) * 360;
      if (elevation > -5) setSkyTime(Math.max(elevation, 0.5), azimuth % 360);
    }
    // Adjust lighting
    const hourAngle = (_dayTime - 6) / 12 * Math.PI;
    const brightness = Math.max(0.1, Math.sin(hourAngle) * 0.8 + 0.2);
    scene.traverse(c => {
      if (c.isAmbientLight) c.intensity = brightness * 0.6;
      if (c.isDirectionalLight) c.intensity = brightness * 1.2;
    });
    if (_dayTime > 19 || _dayTime < 5) {
      scene.fog = new THREE.FogExp2(0x0a0a1a, 0.005);
    } else {
      scene.fog = null;
    }
    return '🕐 Time set to ' + t + ' (' + _dayTime + ':00)';
  }

  // Fog commands
  if (lower === 'fog on' || lower === 'add fog' || lower === 'enable fog') {
    scene.fog = new THREE.FogExp2(0x888888, 0.008);
    return '🌫️ Fog enabled';
  }
  if (lower === 'fog off' || lower === 'remove fog' || lower === 'disable fog' || lower === 'clear fog') {
    scene.fog = null;
    return '☀️ Fog cleared';
  }
  const _fogMatch = lower.match(/^fog\s+([\d.]+)/);
  if (_fogMatch) {
    const density = parseFloat(_fogMatch[1]);
    scene.fog = new THREE.FogExp2(0x888888, density);
    return '🌫️ Fog density: ' + density;
  }


  if (lower === 'clouds' || lower === 'add clouds' || lower === 'create clouds') {
    createClouds();
    return '☁️ Clouds added';
  }
  if (lower === 'remove clouds' || lower === 'no clouds' || lower === 'clear clouds') {
    if (_cloudGroup) { scene.remove(_cloudGroup); _cloudGroup = null; }
    return '☀️ Clouds removed';
  }

  // === QUICK COMMANDS (v217) ===
  if (lower === 'clear scene' || lower === 'clear all' || lower === 'reset') {
    if (window._runCommand) window._runCommand('clear');
    return '🧹 Scene cleared';
  }
  if (lower === 'fullscreen' || lower === 'full screen' || lower === 'fs') {
    if (window.toggleFullscreen) window.toggleFullscreen();
    return '🖥️ Toggled fullscreen';
  }
  if (lower === 'wireframe' || lower === 'toggle wireframe') {
    scene.traverse(c => { if (c.isMesh && c.material) c.material.wireframe = !c.material.wireframe; });
    return '🔲 Wireframe toggled';
  }
  if (lower === 'stats' || lower === 'show stats' || lower === 'engine stats') {
    const objCount = (window._sceneObjects || []).length;
    const npcCount = npcController ? npcController.npcs.length : 0;
    const tri = renderer.info.render.triangles;
    const calls = renderer.info.render.calls;
    return `📊 Objects: ${objCount} | NPCs: ${npcCount} | Triangles: ${tri.toLocaleString()} | Draw calls: ${calls}`;
  }
  if (lower === 'gravity off' || lower === 'no gravity' || lower === 'fly' || lower === 'fly mode') {
    if (characterController) { characterController._fly = true; }
    return '🕊️ Fly mode ON — Space to go up, Shift to go down';
  }
  if (lower === 'gravity on' || lower === 'walk' || lower === 'walk mode') {
    if (characterController) { characterController._fly = false; }
    return '🚶 Walk mode ON';
  }
  if (lower === 'speed 2x' || lower === 'fast') {
    if (characterController) characterController._speedMultiplier = 2;
    return '⚡ Speed 2x';
  }
  if (lower === 'speed 1x' || lower === 'normal speed') {
    if (characterController) characterController._speedMultiplier = 1;
    return '🚶 Normal speed';
  }
  if (lower === 'god mode' || lower === 'godmode' || lower === 'invincible') {
    if (characterController) { characterController.hp = 99999; characterController.maxHp = 99999; }
    return '⭐ God mode — invincible!';
  }


  if (lower === 'help' || lower === 'commands' || lower === '?') {
    const helpHTML = `
      <div style="position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:10020;overflow-y:auto;font-family:-apple-system,sans-serif;color:#e0e0e0;padding:40px;backdrop-filter:blur(10px);">
        <div style="max-width:800px;margin:0 auto;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;">
            <h1 style="margin:0;font-size:24px;color:#ff6b35;">📖 Crate Engine Commands</h1>
            <div onclick="this.parentElement.parentElement.parentElement.remove()" style="cursor:pointer;font-size:24px;color:#666;">✕</div>
          </div>
          
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
            <div>
              <h3 style="color:#4ade80;margin:0 0 8px;">🏗️ Building</h3>
              <div style="font-size:13px;line-height:2;color:#aaa;">
                <code>add house</code> / <code>add modern house</code><br>
                <code>add skyscraper</code> / <code>add mansion</code><br>
                <code>add road</code> / <code>add intersection</code><br>
                <code>add tree</code> / <code>add car</code><br>
                <code>add [any model name]</code>
              </div>
            </div>
            
            <div>
              <h3 style="color:#3b82f6;margin:0 0 8px;">🗺️ Generation</h3>
              <div style="font-size:13px;line-height:2;color:#aaa;">
                <code>generate city</code> / <code>generate town</code><br>
                <code>generate kingdom</code> / <code>generate pirate</code><br>
                <code>generate dungeon</code> / <code>generate space</code><br>
                <code>zombie game</code> / <code>racing mode</code>
              </div>
            </div>
            
            <div>
              <h3 style="color:#f59e0b;margin:0 0 8px;">🌍 Environment</h3>
              <div style="font-size:13px;line-height:2;color:#aaa;">
                <code>set time morning/night/sunset</code><br>
                <code>rain</code> / <code>snow</code> / <code>fog on/off</code><br>
                <code>clouds</code> / <code>ocean</code><br>
                <code>sky sunset</code> / <code>sky night</code>
              </div>
            </div>
            
            <div>
              <h3 style="color:#ec4899;margin:0 0 8px;">🎮 Play Mode</h3>
              <div style="font-size:13px;line-height:2;color:#aaa;">
                <b>WASD</b> — Move | <b>Mouse</b> — Look<br>
                <b>Space</b> — Jump | <b>Shift</b> — Sprint<br>
                <b>G</b> — Grapple | <b>P</b> — Photo mode<br>
                <b>V</b> — First/Third person<br>
                <b>C</b> — Crouch | <b>E</b> — Interact<br>
                <b>F</b> — Enter vehicle | <b>ESC</b> — Pause
              </div>
            </div>
            
            <div>
              <h3 style="color:#8b5cf6;margin:0 0 8px;">🛠️ Utility</h3>
              <div style="font-size:13px;line-height:2;color:#aaa;">
                <code>stats</code> — Engine statistics<br>
                <code>wireframe</code> — Toggle wireframe<br>
                <code>fly</code> / <code>walk</code> — Fly mode<br>
                <code>god mode</code> — Invincible<br>
                <code>speed 2x</code> / <code>normal speed</code><br>
                <code>save</code> / <code>load</code> / <code>screenshot</code>
              </div>
            </div>
            
            <div>
              <h3 style="color:#06b6d4;margin:0 0 8px;">📦 Assets</h3>
              <div style="font-size:13px;line-height:2;color:#aaa;">
                <code>buildings</code> — Browse 333 buildings<br>
                <code>vehicles</code> — Browse 130 vehicles<br>
                <code>weapons</code> — Browse 235 weapons<br>
                <code>characters</code> — Browse 176 characters<br>
                <code>search [term]</code> — Find any model<br>
                <b>3,519 total models available!</b>
              </div>
            </div>
          </div>
          
          <div style="text-align:center;margin-top:24px;color:#555;font-size:12px;">
            Press ESC or click ✕ to close | Crate Engine v217
          </div>
        </div>
      </div>
    `;
    const div = document.createElement('div');
    div.innerHTML = helpHTML;
    document.body.appendChild(div.firstElementChild);
    const helpEl = document.body.lastElementChild;
    document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { helpEl.remove(); document.removeEventListener('keydown', esc); } });
    return '📖 Help panel opened';
  }


  if (lower === 'settings' || lower === 'options' || lower === 'preferences') {
    showSettings();
    return '⚙️ Settings opened';
  }
  // 3D Generator commands
  
  
  // === AAA Ocean & Sky Commands (v61) ===
  if (lower === 'ocean' || lower === 'add ocean' || lower === 'create ocean' || lower.match(/^add ocean at/) || lower.match(/^(add |create )?ocean\s+\d/) || lower.match(/^add (lake|pond|sea)/)) {
    const posMatch = lower.match(/at\s+(-?[\d.]+)\s+(-?[\d.]+)\s*(-?[\d.]+)?/);
    const sizeMatch = lower.match(/(\d+)/);
    const isLake = lower.includes('lake') || lower.includes('pond');
    const isSea = lower.includes('sea');
    const defaultSize = isLake ? 30 : isSea ? 300 : 500;
    const oceanSize = sizeMatch ? Math.max(10, parseInt(sizeMatch[1])) : defaultSize;
    const ox = posMatch ? parseFloat(posMatch[1]) : 0;
    const oz = posMatch ? parseFloat(posMatch[2]) : 0;
    // Don't remove existing ocean for lakes — allow multiple water bodies
    if (!isLake) {
      for (let i = objects.length - 1; i >= 0; i--) {
        if (objects[i] && objects[i].userData && objects[i].userData.name === 'ocean') {
          scene.remove(objects[i]); objects.splice(i, 1);
        }
      }
    }
    const w = createWater(oceanSize); // Always use Gerstner water for preset support
    // Ocean sits BELOW ground — terrain/land rises above water naturally
    // Lakes sit slightly above ground for inland water
    w.position.y = isLake ? 0.15 : -0.3;
    const label = isLake ? 'lake' : isSea ? 'sea' : 'ocean';
    w.userData.name = isLake ? 'lake' : 'ocean';
    addObj(label.charAt(0).toUpperCase() + label.slice(1), w, ox, oz);
    // Kill ambient particles for ocean — ocean should be clean
    if (!isLake && ambientParticles) { scene.remove(ambientParticles); ambientParticles.geometry.dispose(); ambientParticles.material.dispose(); ambientParticles = null; }
    // Apply pending water preset from map template
    if (window._pendingWaterPreset && w.userData.isGerstnerWater && w.material.uniforms) {
      const p = WATER_PRESETS[window._pendingWaterPreset];
      if (p) {
        w.material.uniforms.waveA.value.set(p.waveA[0], p.waveA[1], p.waveA[2], p.waveA[3]);
        w.material.uniforms.waveB.value.set(p.waveB[0], p.waveB[1], p.waveB[2], p.waveB[3]);
        w.material.uniforms.waveC.value.set(p.waveC[0], p.waveC[1], p.waveC[2], p.waveC[3]);
        w.material.uniforms.waterColor.value.copy(p.color);
        w.material.uniforms.deepColor.value.copy(p.deepColor);
        w.material.uniforms.foamIntensity.value = p.foamIntensity;
        w.material.uniforms.specularPower.value = p.specularPower;
        w.material.uniforms.fresnelPower.value = p.fresnelPower;
        w.material.uniforms.opacity.value = p.opacity;
        w.userData.waterPreset = window._pendingWaterPreset;
      }
      window._pendingWaterPreset = null;
    }
    // Register water zone for swimming
    const halfS = oceanSize / 2;
    const waterY = isLake ? 0.15 : -0.3;
    registerWaterZone(new THREE.Box3(
      new THREE.Vector3(ox - halfS, waterY - 5, oz - halfS),
      new THREE.Vector3(ox + halfS, waterY + 0.3, oz + halfS)
    ));
    return '🌊 ' + label.charAt(0).toUpperCase() + label.slice(1) + ' created! (' + oceanSize + 'm)';
  }
  // Resize ocean command
  if (lower.match(/^resize ocean\s+(\d+)/) || lower.match(/^(make |set )?ocean\s+(bigger|smaller|\d+)/)) {
    const numMatch = lower.match(/(\d+)/);
    let newSize = 500;
    if (numMatch) newSize = Math.max(50, parseInt(numMatch[1]));
    else if (lower.includes('bigger')) newSize = 1000;
    else if (lower.includes('smaller')) newSize = 200;
    // Remove old ocean
    for (let i = objects.length - 1; i >= 0; i--) {
      if (objects[i] && objects[i].userData && objects[i].userData.name === 'ocean') {
        scene.remove(objects[i]); objects.splice(i, 1);
      }
    }
    const w = createWater(newSize);
    w.position.y = -0.3;
    addObj('Ocean', w, 0, 0);
    return '🌊 Ocean resized to ' + newSize + 'm';
  }
  if (lower === 'aaa sky' || lower === 'realistic sky') {
    createAAASky();
    return '☀️ Realistic sky enabled!';
  }
  if (lower.match(/^(sunrise|dawn)$/)) { setSkyTime(5, 180); return '🌅 Sunrise!'; }
  if (lower.match(/^(sunset|dusk)$/)) { setSkyTime(2, 45); return '🌇 Sunset!'; }
  if (lower.match(/^(noon|midday)$/)) { setSkyTime(45, 180); return '☀️ Noon!'; }
  
  // === Shooter Mode (v61) ===
  if (lower === 'shooter mode' || lower === 'fps mode' || lower === 'enable shooter') {
    shooterMode = true; playerHP = 100; ammo = maxAmmo;
    createShooterHUD();
    // Spawn some enemies
    for (let i = 0; i < 5; i++) {
      const ex = (Math.random()-0.5)*60, ez = (Math.random()-0.5)*60;
      const enemy = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.5, 1.5, 4, 8),
        new THREE.MeshStandardMaterial({color: 0xff2222, roughness: 0.4})
      );
      enemy.position.set(ex, 1.25, ez);
      enemy.userData.hp = 50;
      enemy.userData.isEnemy = true;
      enemy.userData.name = 'enemy_'+i;
      enemy.castShadow = true;
      scene.add(enemy);
      objects.push(enemy);
      enemies.push(enemy);
    }
    if (typeof showToast === 'function') showToast('🔫 Shooter mode ON! Click to fire. R to reload.');
    return '🔫 Shooter mode enabled! 5 enemies spawned. Click to fire!';
  }
  


  // ═══ MAP / LEVEL GENERATOR (JSON Template System v67) ═══
const GAME_PRESETS = {}; // removed game presets

// ═══ GAME PRESET COMMAND HANDLER ═══
// Matches: "make this a zombie game", "zombie mode", "start zombie survival", etc.
const gamePresetRegex = /^(?:make\s+(?:this\s+)?(?:a\s+)?|start\s+|play\s+|mode\s+|game\s*mode\s+)?(\w+)\s*(?:game|mode|survival|match)?$/i;
function tryApplyGamePreset(input) {
  const lower = input.toLowerCase().trim();
  
  // Direct match attempts
  for (const [key, preset] of Object.entries(GAME_PRESETS)) {
    if (lower === key || lower === key + ' game' || lower === key + ' mode' ||
        lower === 'make this a ' + key + ' game' || lower === 'make ' + key + ' game' ||
        lower === 'start ' + key || lower === 'play ' + key ||
        lower === preset.name.toLowerCase()) {
      return applyGamePreset(key, preset);
    }
  }
  return null;
}

async function applyGamePreset(key, preset) {
  appendToOutput('🎮 Loading game mode: ' + preset.name + '...\n' + preset.description);
  // Generate quests for this game mode
  if (typeof generatePresetQuests === 'function') generatePresetQuests(key);
  
  // Clear existing scene
  execSingle('clear');
  
  // Apply environment
  if (preset.env) {
    for (const envCmd of preset.env) {
      execSingle(envCmd);
      await new Promise(r => setTimeout(r, 200));
    }
  }
  
  // Run commands sequentially
  for (const cmd of preset.commands) {
    appendToOutput('  → ' + cmd);
    execSingle(cmd);
    await new Promise(r => setTimeout(r, 300));
  }
  
  // Set game state
  window._currentGameMode = key;
  window._gamePreset = preset;
  
  // Show HUD overlay
  if (preset.hud && Object.keys(preset.hud).length > 0) {
    showGameHUD(preset);
  }
  
  appendToOutput('\n✅ ' + preset.name + ' loaded! Use voice or text commands to play.');
  return '🎮 ' + preset.name + ' — Ready!';
}

// ═══ GAME HUD OVERLAY ═══
function showGameHUD(preset) {
  hud = document.getElementById('game-hud');
  if (hud) hud.remove();
  
  hud = document.createElement('div');
  hud.id = 'game-hud';
  hud.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;gap:16px;background:rgba(0,0,0,0.6);padding:8px 20px;border-radius:20px;font-family:-apple-system,sans-serif;color:#fff;font-size:14px;backdrop-filter:blur(8px);pointer-events:none';
  
  const items = [];
  if (preset.hud.showHealth) items.push('<span>❤️ <span id="hud-health">100</span></span>');
  if (preset.hud.showKills) items.push('<span>💀 <span id="hud-kills">0</span></span>');
  if (preset.hud.showWaves) items.push('<span>🌊 Wave <span id="hud-wave">1</span></span>');
  if (preset.hud.showSpeed) items.push('<span>🏎️ <span id="hud-speed">0</span> mph</span>');
  if (preset.hud.showLap) items.push('<span>🏁 Lap <span id="hud-lap">1</span>/3</span>');
  if (preset.hud.showXP) items.push('<span>⭐ <span id="hud-xp">0</span> XP</span>');
  if (preset.hud.showAmmo) items.push('<span>🔫 <span id="hud-ammo">30</span></span>');
  if (preset.hud.showMoney) items.push('<span>💰 $<span id="hud-money">10000</span></span>');
  if (preset.hud.showPopulation) items.push('<span>👥 <span id="hud-pop">0</span></span>');
  if (preset.hud.showHunger) items.push('<span>🍖 <span id="hud-hunger">100</span></span>');
  if (preset.hud.showQuests) items.push('<span>📜 <span id="hud-quests">0</span></span>');
  if (preset.hud.showPosition) items.push('<span>🏆 <span id="hud-position">1st</span></span>');
  if (preset.hud.showFlashlight) items.push('<span>🔦 <span id="hud-flashlight">ON</span></span>');
  if (preset.hud.showInventory) items.push('<span>🎒 <span id="hud-inv">Empty</span></span>');
  
  hud.innerHTML = items.join('');
  document.body.appendChild(hud);
}


  
  // Desert/Snow/Jungle themed city commands
  if (lower.match(/^generate\s+(desert|snow|arctic|jungle|swamp|volcanic)\s*(city|town|village)?/)) {
    const biomeMatch = lower.match(/^generate\s+(\w+)/);
    const biome = biomeMatch[1];
    const type = lower.includes('city') ? 'city' : lower.includes('village') ? 'town' : 'city';
    await parseAndExecute('generate ' + type);
    await parseAndExecute('biome ' + biome);
    // Add biome-specific props
    if (biome === 'desert') {
      await parseAndExecute('time noon');
      for (let i = 0; i < 8; i++) await parseAndExecute('add rock at ' + ((Math.random()-0.5)*80) + ' 0 ' + ((Math.random()-0.5)*80));
    }
    if (biome === 'snow' || biome === 'arctic') {
      await parseAndExecute('time morning');
      await parseAndExecute('particles snow');
    }
    if (biome === 'jungle') {
      await parseAndExecute('time noon');
      await parseAndExecute('fog on');
    }
    return '🌍 Generated ' + biome + ' ' + type + '!';
  }

  if (lower.match(/^(generate|create|build|make)\s+(a\s+|an\s+|the\s+)?(map|level|world|scene|hurricane|tropical paradise|arctic storm|dark swamp|war zone|enchanted forest|pirate cove|dragon lair|medieval siege|ocean voyage|town|city|suburban|urban|village|dungeon|arena|battlefield|kingdom|island|forest|camp|farm|graveyard|pirate|cyberpunk|desert|frozen|jungle|space|swamp|mountain|zen|western|ruins|volcano|floating|haunted|underwater|reef|castle|siege|outpost|rpg|tropical)\b/i)) {
    const mapMatch = lower.match(/(hurricane|tropical paradise|arctic storm|dark swamp|war zone|enchanted forest|pirate cove|dragon lair|medieval siege|ocean voyage|town|city|suburban|urban|village|dungeon|arena|battlefield|kingdom|island|forest|camp|farm|graveyard|pirate|cyberpunk|desert|frozen|jungle|space|swamp|mountain|zen|western|ruins|volcano|floating|haunted|underwater|reef|castle|siege|outpost|rpg|tropical)/i);
    const mapType = mapMatch ? mapMatch[1].toLowerCase() : 'town';
    const mapTheme = lower.replace(/^(generate|create|build|make)\s+(a\s+)?/i, '').trim();
    showToast('🗺️ Generating ' + mapTheme + '...');

    // Route matching map types to Phase 5 world compiler (14 templates)
    const WORLD_COMPILER_MAP = {
      city: 'CITY_MODERN', suburban: 'CITY_MODERN', urban: 'CITY_MODERN',
      town: 'MEDIEVAL_VILLAGE', village: 'MEDIEVAL_VILLAGE', medieval: 'MEDIEVAL_VILLAGE', 'medieval siege': 'MEDIEVAL_VILLAGE',
      zombie: 'ZOMBIELAND', graveyard: 'ZOMBIELAND',
      space: 'SPACE_STATION', station: 'SPACE_STATION',
      island: 'TROPICAL_ISLAND', 'tropical paradise': 'TROPICAL_ISLAND', jungle: 'TROPICAL_ISLAND', tropical: 'TROPICAL_ISLAND',
      desert: 'DESERT_OUTPOST', outpost: 'DESERT_OUTPOST', volcano: 'DESERT_OUTPOST',
      pirate: 'PIRATE_COVE', 'pirate cove': 'PIRATE_COVE',
      haunted: 'HAUNTED_GRAVEYARD',
      dungeon: 'DUNGEON_CRAWL',
      cyberpunk: 'CYBERPUNK_CITY',
      camp: 'FARM_COUNTRY', farm: 'FARM_COUNTRY',
      kingdom: 'RPG_VILLAGE', rpg: 'RPG_VILLAGE',
      ruins: 'CASTLE_SIEGE', castle: 'CASTLE_SIEGE', siege: 'CASTLE_SIEGE', frozen: 'CASTLE_SIEGE',
      underwater: 'UNDERWATER_REEF', reef: 'UNDERWATER_REEF',
    };
    const worldTemplate = WORLD_COMPILER_MAP[mapType];
    // Route city/urban directly to Ultra City builder (all new assets)
    if (worldTemplate === 'CITY_MODERN') {
      buildCityWorld3();
      return '🏙️ Building Ultra City with all new assets...';
    }
    if (worldTemplate) {
      try {
        const { buildAndApply } = await import('./runtime/world-client.mjs');
        await buildAndApply({ template: worldTemplate, size: 'medium' });
        return '✅ Built ' + worldTemplate + ' world';
      } catch(e) {
        console.warn('[Generate] World compiler failed for ' + worldTemplate + ', falling back to legacy:', e.message);
      }
    }

    // JSON Map Templates — structured layouts with positions (legacy fallback)

    // ═══════════════════════════════════════════════════════════════
    // GAME PRESETS — "make this a zombie game" auto-configures everything
    // Each preset defines: map template, NPC behavior, objectives, HUD, rules
    // ═══════════════════════════════════════════════════════════════
    const MAP_TEMPLATES = {
      // ===== MEDIEVAL FANTASY =====
      town: {
        terrain: { type: 'flat', height: 0 },
        ground: 'grass', env: ['time afternoon'],
        water: null, weather: null, particles: null,
        items: [
          // === TOWN SQUARE — open plaza with well ===
          { cmd: 'add well', pos: [0, 0] },
          { cmd: 'add market stall', pos: [-8, 6] }, { cmd: 'add market stall', pos: [8, 6] },
          { cmd: 'add market stall', pos: [0, -8] },
          { cmd: 'add barrel', pos: [-10, 8] }, { cmd: 'add barrel', pos: [10, 8] },
          { cmd: 'add cart', pos: [12, -3] },
          // === NORTH STREET — wide spacing (15+ units between buildings) ===
          { cmd: 'add tavern', pos: [-30, 35] },
          { cmd: 'add blacksmith', pos: [0, 38] },
          { cmd: 'add modern house', pos: [30, 35] },
          // === SOUTH STREET ===
          { cmd: 'add modern house', pos: [-30, -35] },
          { cmd: 'add modern house', pos: [0, -38] },
          { cmd: 'add modern house', pos: [30, -35] },
          // === EAST STREET ===
          { cmd: 'add modern house', pos: [45, 0] },
          { cmd: 'add modern house', pos: [45, 25] },
          // === WEST STREET ===
          { cmd: 'add modern house', pos: [-45, 0] },
          { cmd: 'add modern house', pos: [-45, -25] },
          // === TORCHES — line the wide paths ===
          { cmd: 'add torch', pos: [-15, 18] }, { cmd: 'add torch', pos: [15, 18] },
          { cmd: 'add torch', pos: [-15, -18] }, { cmd: 'add torch', pos: [15, -18] },
          { cmd: 'add torch', pos: [-30, 0] }, { cmd: 'add torch', pos: [30, 0] },
          { cmd: 'add torch', pos: [0, 18] }, { cmd: 'add torch', pos: [0, -18] },
          // === ROADS — connecting paths ===
          { cmd: 'add road at 0 18', pos: [0, 18] },   // center to north
          { cmd: 'add road at 0 -18', pos: [0, -18] },  // center to south  
          { cmd: 'add road', pos: [0, 0] },              // center crossroad
          // === PERIMETER — nature ring far from buildings ===
          { cmd: 'add tree', scatter: { count: 35, radius: 80, avoidCenter: 50 } },
          { cmd: 'add bush', scatter: { count: 18, radius: 70, avoidCenter: 45 } },
          { cmd: 'add rock', scatter: { count: 8, radius: 75, avoidCenter: 50 } },
          // === NPCs — spread around the plaza ===
          { cmd: 'spawn villager', scatter: { count: 6, radius: 25 } },
          { cmd: 'spawn guard', pos: [-18, 20] }, { cmd: 'spawn guard', pos: [18, 20] },
        ]
      },
      village: {
        terrain: { type: 'flat', height: 0 },
        ground: 'grass', env: ['time morning'],
        items: [
          { cmd: 'add modern house', pos: [12, -8] }, { cmd: 'add modern house', pos: [-14, 6] },
          { cmd: 'add modern house', pos: [6, 18] }, { cmd: 'add modern house', pos: [-10, -20] },
          { cmd: 'add campfire', pos: [0, 0] },
          { cmd: 'add well', pos: [8, -4] },
          { cmd: 'add log', pos: [-2, 2] }, { cmd: 'add log', pos: [2, -2] },
          { cmd: 'add chicken', scatter: { count: 6, radius: 18 } },
          { cmd: 'add tree', scatter: { count: 25, radius: 60, avoidCenter: 10 } },
          { cmd: 'add bush', scatter: { count: 15, radius: 45 } },
          { cmd: 'add flower', scatter: { count: 10, radius: 30 } },
          { cmd: 'add rock', scatter: { count: 8, radius: 50 } },
          { cmd: 'spawn villager', scatter: { count: 4, radius: 25 } },
          { cmd: 'spawn farmer', scatter: { count: 2, radius: 20 } },
        ]
      },
      kingdom: {
        terrain: { type: 'hills', height: 0.4 },
        ground: 'grass', env: ['time afternoon'],
        items: [
          { cmd: 'add castle', pos: [0, -50] },
          { cmd: 'add tower', pos: [-40, -40] }, { cmd: 'add tower', pos: [40, -40] },
          { cmd: 'add tower', pos: [-40, 0] }, { cmd: 'add tower', pos: [40, 0] },
          { cmd: 'add wall', pos: [-20, -45] }, { cmd: 'add wall', pos: [20, -45] },
          { cmd: 'add gate', pos: [0, -30] },
          { cmd: 'add tavern', pos: [25, 10] }, { cmd: 'add blacksmith', pos: [-25, 10] },
          { cmd: 'add modern house', scatter: { count: 10, radius: 40, avoidCenter: 15 } },
          { cmd: 'add market stall', scatter: { count: 4, radius: 25 } },
          { cmd: 'add tree', scatter: { count: 15, radius: 70, avoidCenter: 25 } },
          { cmd: 'add torch', scatter: { count: 15, radius: 45 } },
          { cmd: 'spawn guard', scatter: { count: 6, radius: 40 } },
          { cmd: 'spawn knight', scatter: { count: 3, radius: 35 } },
          { cmd: 'spawn villager', scatter: { count: 8, radius: 35 } },
        ]
      },
      'medieval siege': {
        terrain: { type: 'hills', height: 0.5 },
        ground: 'dirt', env: ['time sunset', 'fog on'], weather: 'rain', particles: 'ash',
        items: [
          { cmd: 'add castle', pos: [0, -40] },
          { cmd: 'add tower', pos: [-30, -35] }, { cmd: 'add tower', pos: [30, -35] },
          { cmd: 'add wall', pos: [-15, -30] }, { cmd: 'add wall', pos: [15, -30] },
          { cmd: 'add campfire', pos: [20, 20] }, { cmd: 'add campfire', pos: [-20, 20] },
          { cmd: 'add tent', pos: [25, 25] }, { cmd: 'add tent', pos: [-25, 25] },
          { cmd: 'add barrel', scatter: { count: 8, radius: 25 } },
          { cmd: 'add rock', scatter: { count: 10, radius: 50 } },
          { cmd: 'add dead tree', scatter: { count: 6, radius: 60 } },
          { cmd: 'spawn soldier', scatter: { count: 8, radius: 30 } },
          { cmd: 'spawn knight', scatter: { count: 4, radius: 20 } },
        ]
      },
      dungeon: {
        terrain: { type: 'flat' },
        ground: 'stone', env: ['time night', 'fog on'], particles: 'embers',
        items: [
          { cmd: 'add castle', pos: [0, 0] },
          { cmd: 'add torch', scatter: { count: 12, radius: 25 } },
          { cmd: 'add barrel', scatter: { count: 6, radius: 20 } },
          { cmd: 'add chest', scatter: { count: 3, radius: 15 } },
          { cmd: 'add rock', scatter: { count: 8, radius: 30 } },
          { cmd: 'spawn skeleton', scatter: { count: 5, radius: 25 } },
          { cmd: 'spawn enemies', scatter: { count: 3, radius: 20 } },
        ]
      },
      
      // ===== NATURE & WILDERNESS =====
      forest: {
        terrain: { type: 'hills', height: 0.4 },
        ground: 'grass', env: ['time morning'], particles: 'fireflies',
        items: [
          { cmd: 'add pine tree', scatter: { count: 40, radius: 80 } },
          { cmd: 'add tree', scatter: { count: 25, radius: 70 } },
          { cmd: 'add bush', scatter: { count: 20, radius: 60 } },
          { cmd: 'add flower', scatter: { count: 15, radius: 50 } },
          { cmd: 'add mushroom', scatter: { count: 10, radius: 40 } },
          { cmd: 'add rock', scatter: { count: 12, radius: 65 } },
          { cmd: 'add boulder', scatter: { count: 4, radius: 55 } },
          { cmd: 'add log', scatter: { count: 6, radius: 50 } },
          { cmd: 'add deer', scatter: { count: 3, radius: 50 } },
          { cmd: 'add fox', scatter: { count: 2, radius: 40 } },
          { cmd: 'add campfire', pos: [0, 0] },
        ]
      },
      'enchanted forest': {
        terrain: { type: 'hills', height: 0.5 },
        ground: 'grass', env: ['time night'], particles: 'fireflies',
        items: [
          { cmd: 'add cherry blossom', scatter: { count: 15, radius: 60 } },
          { cmd: 'add tree', scatter: { count: 30, radius: 80 } },
          { cmd: 'add mushroom', scatter: { count: 15, radius: 50 } },
          { cmd: 'add flower', scatter: { count: 20, radius: 50 } },
          { cmd: 'add crystal', scatter: { count: 8, radius: 40 } },
          { cmd: 'add rock', scatter: { count: 10, radius: 60 } },
          { cmd: 'add fountain', pos: [0, 0] },
          { cmd: 'add torch', scatter: { count: 8, radius: 30 } },
          { cmd: 'spawn witch', scatter: { count: 2, radius: 30 } },
          { cmd: 'spawn villager', scatter: { count: 3, radius: 25 } },
        ]
      },
      mountain: {
        terrain: { type: 'mountains', height: 1.2 },
        ground: 'gravel', env: ['time afternoon'], particles: 'dust',
        items: [
          { cmd: 'add pine tree', scatter: { count: 20, radius: 60, avoidCenter: 10 } },
          { cmd: 'add boulder', scatter: { count: 15, radius: 70 } },
          { cmd: 'add rock', scatter: { count: 20, radius: 80 } },
          { cmd: 'add eagle', scatter: { count: 2, radius: 40 } },
          { cmd: 'add campfire', pos: [0, 0] },
          { cmd: 'add tent', pos: [5, 5] },
        ]
      },
      island: {
        terrain: { type: 'island', height: 1.0 },
        ground: 'sand', env: ['time afternoon'],
        water: 'tropical', particles: null,
        items: [
          { cmd: 'add ocean' },
          { cmd: 'add palm tree', scatter: { count: 20, radius: 40, avoidCenter: 5 } },
          { cmd: 'add bush', scatter: { count: 10, radius: 35 } },
          { cmd: 'add rock', scatter: { count: 8, radius: 45 } },
          { cmd: 'add flower', scatter: { count: 8, radius: 30 } },
          { cmd: 'add boat', pos: [40, 0] },
          { cmd: 'add campfire', pos: [0, 5] },
          { cmd: 'add chest', pos: [15, -10] },
        ]
      },
      'tropical paradise': {
        terrain: { type: 'island', height: 1.0 },
        ground: 'sand', env: ['time afternoon'],
        water: 'tropical',
        items: [
          { cmd: 'add ocean' },
          { cmd: 'add palm tree', scatter: { count: 30, radius: 45 } },
          { cmd: 'add bush', scatter: { count: 15, radius: 40 } },
          { cmd: 'add flower', scatter: { count: 12, radius: 35 } },
          { cmd: 'add rock', scatter: { count: 10, radius: 50 } },
          { cmd: 'add boat', pos: [45, 0] }, { cmd: 'add boat', pos: [-40, 15] },
          { cmd: 'add campfire', pos: [5, 8] },
          { cmd: 'add tent', pos: [10, 10] },
          { cmd: 'add chest', pos: [-8, -5] },
          { cmd: 'add parrot', scatter: { count: 3, radius: 30 } },
          { cmd: 'spawn villager', scatter: { count: 3, radius: 25 } },
        ]
      },
      jungle: {
        terrain: { type: 'hills', height: 0.6 },
        ground: 'mud', env: ['time morning'], weather: 'rain', particles: 'spores',
        items: [
          { cmd: 'add tree', scatter: { count: 45, radius: 80 } },
          { cmd: 'add palm tree', scatter: { count: 15, radius: 60 } },
          { cmd: 'add bush', scatter: { count: 25, radius: 65 } },
          { cmd: 'add flower', scatter: { count: 15, radius: 50 } },
          { cmd: 'add mushroom', scatter: { count: 12, radius: 45 } },
          { cmd: 'add vine', scatter: { count: 8, radius: 50 } },
          { cmd: 'add boulder', scatter: { count: 6, radius: 55 } },
          { cmd: 'add rock', scatter: { count: 10, radius: 60 } },
          { cmd: 'add snake', scatter: { count: 3, radius: 30 } },
          { cmd: 'add parrot', scatter: { count: 4, radius: 40 } },
          { cmd: 'add campfire', pos: [0, 0] },
        ]
      },
      
      // ===== HARSH ENVIRONMENTS =====
      desert: {
        terrain: { type: 'dunes', height: 0.8 },
        ground: 'sand', env: ['time noon'], particles: 'dust',
        items: [
          { cmd: 'add cactus', scatter: { count: 15, radius: 70 } },
          { cmd: 'add rock', scatter: { count: 20, radius: 80 } },
          { cmd: 'add boulder', scatter: { count: 6, radius: 60 } },
          { cmd: 'add dead tree', scatter: { count: 4, radius: 55 } },
          { cmd: 'add skull', scatter: { count: 3, radius: 40 } },
          { cmd: 'add tent', pos: [0, 0] },
          { cmd: 'add campfire', pos: [5, 0] },
          { cmd: 'add barrel', pos: [3, 3] },
          { cmd: 'add camel', scatter: { count: 2, radius: 30 } },
        ]
      },
      'arctic storm': {
        terrain: { type: 'hills', height: 0.6 },
        ground: 'snow', env: ['time morning'], weather: 'snow',
        water: 'arctic', particles: 'snow',
        items: [
          { cmd: 'add ocean 300' },
          { cmd: 'add pine tree', scatter: { count: 15, radius: 60 } },
          { cmd: 'add rock', scatter: { count: 15, radius: 70 } },
          { cmd: 'add boulder', scatter: { count: 8, radius: 60 } },
          { cmd: 'add modern house', pos: [0, 0] },
          { cmd: 'add campfire', pos: [8, 0] },
          { cmd: 'add barrel', scatter: { count: 4, radius: 15 } },
          { cmd: 'add wolf', scatter: { count: 3, radius: 40 } },
          { cmd: 'add husky', scatter: { count: 2, radius: 20 } },
        ]
      },
      frozen: {
        terrain: { type: 'plateau', height: 0.7 },
        ground: 'ice', env: ['time dawn'], weather: 'snow', particles: 'snow',
        items: [
          { cmd: 'add pine tree', scatter: { count: 10, radius: 50 } },
          { cmd: 'add rock', scatter: { count: 20, radius: 70 } },
          { cmd: 'add boulder', scatter: { count: 10, radius: 60 } },
          { cmd: 'add crystal', scatter: { count: 5, radius: 30 } },
          { cmd: 'add chest', pos: [0, 0] },
          { cmd: 'add wolf', scatter: { count: 4, radius: 45 } },
        ]
      },
      volcano: {
        terrain: { type: 'volcano', height: 1.5 },
        ground: 'lava', env: ['time night'], particles: 'embers',
        items: [
          { cmd: 'add rock', scatter: { count: 25, radius: 80 } },
          { cmd: 'add boulder', scatter: { count: 10, radius: 60 } },
          { cmd: 'add dead tree', scatter: { count: 6, radius: 50 } },
          { cmd: 'add torch', scatter: { count: 8, radius: 30 } },
          { cmd: 'spawn enemies', scatter: { count: 5, radius: 40 } },
        ]
      },
      
      // ===== WATER WORLDS =====
      hurricane: {
        terrain: { type: 'island', height: 0.8 },
        ground: 'mud', env: ['time night'],
        water: 'hurricane', weather: 'rain', particles: 'rain',
        items: [
          { cmd: 'add ocean 400' },
          { cmd: 'add palm tree', scatter: { count: 8, radius: 35 } },
          { cmd: 'add rock', scatter: { count: 12, radius: 40 } },
          { cmd: 'add boat', pos: [45, 10] },
          { cmd: 'add barrel', scatter: { count: 6, radius: 25 } },
          { cmd: 'add modern house', pos: [0, 0] },
        ]
      },
      'ocean voyage': {
        terrain: { type: 'flat' },
        ground: 'sand', env: ['time afternoon'],
        water: 'ocean',
        items: [
          { cmd: 'add ocean 500' },
          { cmd: 'add boat', pos: [0, 0] }, { cmd: 'add boat', pos: [30, 20] },
          { cmd: 'add boat', pos: [-25, -15] },
          { cmd: 'add barrel', pos: [3, 0] },
          { cmd: 'add chest', pos: [-2, 0] },
        ]
      },
      'dark swamp': {
        terrain: { type: 'hills', height: 0.15 },
        ground: 'mud', env: ['time night', 'fog on'],
        water: 'swamp', particles: 'spores',
        items: [
          { cmd: 'add lake 80' },
          { cmd: 'add dead tree', scatter: { count: 20, radius: 60 } },
          { cmd: 'add tree', scatter: { count: 10, radius: 50 } },
          { cmd: 'add bush', scatter: { count: 15, radius: 45 } },
          { cmd: 'add mushroom', scatter: { count: 12, radius: 40 } },
          { cmd: 'add rock', scatter: { count: 10, radius: 50 } },
          { cmd: 'add log', scatter: { count: 6, radius: 35 } },
          { cmd: 'add frog', scatter: { count: 4, radius: 30 } },
          { cmd: 'add snake', scatter: { count: 3, radius: 25 } },
          { cmd: 'add torch', scatter: { count: 6, radius: 25 } },
          { cmd: 'spawn witch', scatter: { count: 2, radius: 30 } },
        ]
      },
      'pirate cove': {
        terrain: { type: 'island', height: 0.8 },
        ground: 'sand', env: ['time sunset'],
        water: 'ocean',
        items: [
          { cmd: 'add ocean 400' },
          { cmd: 'add boat', pos: [50, 0] }, { cmd: 'add boat', pos: [-45, 20] },
          { cmd: 'add palm tree', scatter: { count: 15, radius: 35 } },
          { cmd: 'add barrel', scatter: { count: 8, radius: 20 } },
          { cmd: 'add chest', pos: [0, -10] }, { cmd: 'add chest', pos: [8, -8] },
          { cmd: 'add campfire', pos: [0, 5] },
          { cmd: 'add tent', pos: [10, 8] },
          { cmd: 'add torch', scatter: { count: 6, radius: 20 } },
          { cmd: 'add skull', scatter: { count: 3, radius: 15 } },
          { cmd: 'spawn villager', scatter: { count: 4, radius: 20 } },
        ]
      },
      
      // ===== COMBAT ARENAS =====
      arena: {
        terrain: { type: 'flat' },
        ground: 'sand', env: ['time afternoon'],
        items: [
          { cmd: 'add column', pos: [15, 15] }, { cmd: 'add column', pos: [-15, 15] },
          { cmd: 'add column', pos: [15, -15] }, { cmd: 'add column', pos: [-15, -15] },
          { cmd: 'add column', pos: [25, 0] }, { cmd: 'add column', pos: [-25, 0] },
          { cmd: 'add column', pos: [0, 25] }, { cmd: 'add column', pos: [0, -25] },
          { cmd: 'add torch', scatter: { count: 12, radius: 28 } },
          { cmd: 'add barrel', scatter: { count: 6, radius: 20 } },
          { cmd: 'spawn enemies 5' },
        ]
      },
      battlefield: {
        terrain: { type: 'hills', height: 0.3 },
        ground: 'dirt', env: ['time sunset', 'fog on'], particles: 'ash',
        items: [
          { cmd: 'add tent', pos: [40, 0] }, { cmd: 'add tent', pos: [45, 10] },
          { cmd: 'add tent', pos: [-40, 0] }, { cmd: 'add tent', pos: [-45, 10] },
          { cmd: 'add campfire', pos: [42, 5] }, { cmd: 'add campfire', pos: [-42, 5] },
          { cmd: 'add barrel', scatter: { count: 10, radius: 30 } },
          { cmd: 'add rock', scatter: { count: 12, radius: 50 } },
          { cmd: 'add dead tree', scatter: { count: 5, radius: 40 } },
          { cmd: 'spawn soldier', scatter: { count: 6, radius: 35 } },
          { cmd: 'spawn knight', scatter: { count: 4, radius: 30 } },
        ]
      },
      'war zone': {
        terrain: { type: 'hills', height: 0.4 },
        ground: 'dirt', env: ['time night'], weather: 'rain', particles: 'embers',
        items: [
          { cmd: 'add tank', pos: [20, 0] }, { cmd: 'add tank', pos: [-25, 10] },
          { cmd: 'add tent', scatter: { count: 4, radius: 30 } },
          { cmd: 'add barrel', scatter: { count: 10, radius: 35 } },
          { cmd: 'add rock', scatter: { count: 15, radius: 50 } },
          { cmd: 'add boulder', scatter: { count: 5, radius: 40 } },
          { cmd: 'add dead tree', scatter: { count: 8, radius: 45 } },
          { cmd: 'add campfire', scatter: { count: 3, radius: 25 } },
          { cmd: 'spawn soldier', scatter: { count: 8, radius: 35 } },
        ]
      },
      
      // ===== FANTASY =====
      'dragon lair': {
        terrain: { type: 'volcano', height: 1.0 },
        ground: 'stone', env: ['time night'], particles: 'embers',
        items: [
          { cmd: 'add boulder', scatter: { count: 15, radius: 60 } },
          { cmd: 'add rock', scatter: { count: 20, radius: 70 } },
          { cmd: 'add dead tree', scatter: { count: 6, radius: 50 } },
          { cmd: 'add chest', scatter: { count: 5, radius: 20 } },
          { cmd: 'add torch', scatter: { count: 10, radius: 30 } },
          { cmd: 'add crystal', scatter: { count: 4, radius: 25 } },
          { cmd: 'add dragon', pos: [0, 0] },
          { cmd: 'spawn enemies', scatter: { count: 4, radius: 35 } },
        ]
      },
      graveyard: {
        terrain: { type: 'flat', height: 0 },
        ground: 'dirt', env: ['time night', 'fog on'], particles: 'dust',
        items: [
          { cmd: 'add tombstone', scatter: { count: 20, radius: 40 } },
          { cmd: 'add dead tree', scatter: { count: 8, radius: 50 } },
          { cmd: 'add church', pos: [0, -30] },
          { cmd: 'add torch', scatter: { count: 6, radius: 30 } },
          { cmd: 'add fence', scatter: { count: 8, radius: 35 } },
          { cmd: 'add rock', scatter: { count: 10, radius: 45 } },
          { cmd: 'spawn skeleton', scatter: { count: 6, radius: 30 } },
        ]
      },
      haunted: {
        terrain: { type: 'hills', height: 0.3 },
        ground: 'stone', env: ['time night', 'fog on'], particles: 'fireflies',
        items: [
          { cmd: 'add castle', pos: [0, -35] },
          { cmd: 'add dead tree', scatter: { count: 15, radius: 60 } },
          { cmd: 'add tombstone', scatter: { count: 10, radius: 40 } },
          { cmd: 'add torch', scatter: { count: 8, radius: 30 } },
          { cmd: 'add rock', scatter: { count: 12, radius: 50 } },
          { cmd: 'add gate', pos: [0, -15] },
          { cmd: 'add fence', scatter: { count: 10, radius: 35 } },
          { cmd: 'spawn skeleton', scatter: { count: 5, radius: 35 } },
          { cmd: 'spawn witch', scatter: { count: 2, radius: 25 } },
        ]
      },
      ruins: {
        terrain: { type: 'canyon', height: 0.6 },
        ground: 'gravel', env: ['time sunset'], particles: 'dust',
        items: [
          { cmd: 'add column', scatter: { count: 12, radius: 30 } },
          { cmd: 'add arch', scatter: { count: 4, radius: 25 } },
          { cmd: 'add wall', scatter: { count: 6, radius: 35 } },
          { cmd: 'add rock', scatter: { count: 15, radius: 50 } },
          { cmd: 'add boulder', scatter: { count: 8, radius: 45 } },
          { cmd: 'add chest', scatter: { count: 3, radius: 20 } },
          { cmd: 'add torch', scatter: { count: 6, radius: 25 } },
          { cmd: 'add bush', scatter: { count: 8, radius: 40 } },
        ]
      },
      
      // ===== MODERN & SCI-FI =====
      cyberpunk: {
        terrain: { type: 'flat' },
        ground: 'concrete', env: ['time night'], particles: 'embers',
        items: [
          { cmd: 'add building', scatter: { count: 10, radius: 60 } },
          { cmd: 'add tower', scatter: { count: 4, radius: 50 } },
          { cmd: 'add car', scatter: { count: 6, radius: 40 } },
          { cmd: 'add motorcycle', scatter: { count: 3, radius: 30 } },
          { cmd: 'add barrel', scatter: { count: 8, radius: 35 } },
          { cmd: 'add dumpster', scatter: { count: 4, radius: 30 } },
          { cmd: 'add light', scatter: { count: 12, radius: 45 } },
          { cmd: 'spawn scifi', scatter: { count: 5, radius: 35 } },
        ]
      },
      space: {
        terrain: { type: 'crater', height: 0.8 },
        ground: 'stone', env: ['time night'], particles: 'dust',
        items: [
          { cmd: 'add boulder', scatter: { count: 20, radius: 70 } },
          { cmd: 'add rock', scatter: { count: 25, radius: 80 } },
          { cmd: 'add crystal', scatter: { count: 8, radius: 40 } },
          { cmd: 'add mech', scatter: { count: 2, radius: 30 } },
          { cmd: 'add console', scatter: { count: 3, radius: 20 } },
          { cmd: 'add crate', scatter: { count: 6, radius: 25 } },
          { cmd: 'spawn scifi', scatter: { count: 3, radius: 25 } },
        ]
      },
      
      // ===== PEACEFUL & ZEN =====
      zen: {
        terrain: { type: 'hills', height: 0.15 },
        ground: 'gravel', env: ['time morning'], particles: 'leaves',
        items: [
          { cmd: 'add cherry blossom', scatter: { count: 12, radius: 40 } },
          { cmd: 'add tree', scatter: { count: 8, radius: 50 } },
          { cmd: 'add bush', scatter: { count: 10, radius: 35 } },
          { cmd: 'add flower', scatter: { count: 15, radius: 30 } },
          { cmd: 'add rock', scatter: { count: 8, radius: 25 } },
          { cmd: 'add fountain', pos: [0, 0] },
          { cmd: 'add bench', pos: [8, 0] }, { cmd: 'add bench', pos: [-8, 0] },
          { cmd: 'add bridge', pos: [0, 15] },
          { cmd: 'add lantern', scatter: { count: 6, radius: 25 } },
        ]
      },
      camp: {
        terrain: { type: 'hills', height: 0.25 },
        ground: 'grass', env: ['time sunset'], particles: 'fireflies',
        items: [
          { cmd: 'add campfire', pos: [0, 0] },
          { cmd: 'add tent', pos: [8, 5] }, { cmd: 'add tent', pos: [-8, 5] },
          { cmd: 'add log', pos: [3, -3] }, { cmd: 'add log', pos: [-3, -3] },
          { cmd: 'add barrel', pos: [10, -2] },
          { cmd: 'add tree', scatter: { count: 25, radius: 60, avoidCenter: 10 } },
          { cmd: 'add bush', scatter: { count: 12, radius: 45 } },
          { cmd: 'add rock', scatter: { count: 8, radius: 50 } },
          { cmd: 'add horse', scatter: { count: 2, radius: 15 } },
          { cmd: 'spawn villager', scatter: { count: 3, radius: 15 } },
        ]
      },
      
      // ===== SPECIAL =====
      western: {
        terrain: { type: 'dunes', height: 0.4 },
        ground: 'sand', env: ['time noon'], particles: 'dust',
        items: [
          { cmd: 'add modern house', pos: [20, 0] }, { cmd: 'add modern house', pos: [-20, 0] },
          { cmd: 'add modern house', pos: [0, 20] }, { cmd: 'add tavern', pos: [0, -20] },
          { cmd: 'add well', pos: [0, 0] },
          { cmd: 'add barrel', scatter: { count: 6, radius: 20 } },
          { cmd: 'add cactus', scatter: { count: 10, radius: 50 } },
          { cmd: 'add horse', scatter: { count: 3, radius: 25 } },
          { cmd: 'add dead tree', scatter: { count: 4, radius: 40 } },
          { cmd: 'add rock', scatter: { count: 8, radius: 45 } },
          { cmd: 'spawn villager', scatter: { count: 4, radius: 20 } },
          { cmd: 'spawn guard', scatter: { count: 2, radius: 15 } },
        ]
      },
      floating: {
        terrain: { type: 'plateau', height: 1.0 },
        ground: 'grass', env: ['time afternoon'], particles: 'leaves',
        items: [
          { cmd: 'add tree', scatter: { count: 15, radius: 40 } },
          { cmd: 'add flower', scatter: { count: 12, radius: 30 } },
          { cmd: 'add bush', scatter: { count: 8, radius: 35 } },
          { cmd: 'add rock', scatter: { count: 10, radius: 45 } },
          { cmd: 'add crystal', scatter: { count: 5, radius: 25 } },
          { cmd: 'add fountain', pos: [0, 0] },
          { cmd: 'add bridge', pos: [20, 0] },
          { cmd: 'add torch', scatter: { count: 6, radius: 30 } },
        ]
      },
      swamp: {
        terrain: { type: 'hills', height: 0.1 },
        ground: 'mud', env: ['time night', 'fog on'],
        water: 'swamp', particles: 'spores',
        items: [
          { cmd: 'add lake 60' },
          { cmd: 'add dead tree', scatter: { count: 18, radius: 55 } },
          { cmd: 'add mushroom', scatter: { count: 15, radius: 40 } },
          { cmd: 'add bush', scatter: { count: 12, radius: 45 } },
          { cmd: 'add rock', scatter: { count: 10, radius: 50 } },
          { cmd: 'add log', scatter: { count: 8, radius: 35 } },
          { cmd: 'add frog', scatter: { count: 4, radius: 30 } },
          { cmd: 'add torch', scatter: { count: 4, radius: 20 } },
          { cmd: 'spawn witch', scatter: { count: 2, radius: 25 } },
        ]
      },

      city: {
        terrain: { type: 'flat', height: 0 },
        ground: 'grass', env: ['time afternoon'],
        items: [
          { cmd: 'add road', pos: [-200, -280] },
          { cmd: 'add road', pos: [-200, -240] },
          { cmd: 'add road', pos: [-200, -160] },
          { cmd: 'add road', pos: [-200, -120] },
          { cmd: 'add road', pos: [-200, -80] },
          { cmd: 'add road', pos: [-200, -40] },
          { cmd: 'add road', pos: [-200, 40] },
          { cmd: 'add road', pos: [-200, 80] },
          { cmd: 'add road', pos: [-200, 120] },
          { cmd: 'add road', pos: [-200, 160] },
          { cmd: 'add road', pos: [-200, 240] },
          { cmd: 'add road', pos: [-100, -280] },
          { cmd: 'add road', pos: [-100, -240] },
          { cmd: 'add road', pos: [-100, -160] },
          { cmd: 'add road', pos: [-100, -120] },
          { cmd: 'add road', pos: [-100, -80] },
          { cmd: 'add road', pos: [-100, -40] },
          { cmd: 'add road', pos: [-100, 40] },
          { cmd: 'add road', pos: [-100, 80] },
          { cmd: 'add road', pos: [-100, 120] },
          { cmd: 'add road', pos: [-100, 160] },
          { cmd: 'add road', pos: [-100, 240] },
          { cmd: 'add road', pos: [0, -280] },
          { cmd: 'add road', pos: [0, -240] },
          { cmd: 'add road', pos: [0, -160] },
          { cmd: 'add road', pos: [0, -120] },
          { cmd: 'add road', pos: [0, -80] },
          { cmd: 'add road', pos: [0, -40] },
          { cmd: 'add road', pos: [0, 40] },
          { cmd: 'add road', pos: [0, 80] },
          { cmd: 'add road', pos: [0, 120] },
          { cmd: 'add road', pos: [0, 160] },
          { cmd: 'add road', pos: [0, 240] },
          { cmd: 'add road', pos: [100, -280] },
          { cmd: 'add road', pos: [100, -240] },
          { cmd: 'add road', pos: [100, -160] },
          { cmd: 'add road', pos: [100, -120] },
          { cmd: 'add road', pos: [100, -80] },
          { cmd: 'add road', pos: [100, -40] },
          { cmd: 'add road', pos: [100, 40] },
          { cmd: 'add road', pos: [100, 80] },
          { cmd: 'add road', pos: [100, 120] },
          { cmd: 'add road', pos: [100, 160] },
          { cmd: 'add road', pos: [100, 240] },
          { cmd: 'add road', pos: [200, -280] },
          { cmd: 'add road', pos: [200, -240] },
          { cmd: 'add road', pos: [200, -160] },
          { cmd: 'add road', pos: [200, -120] },
          { cmd: 'add road', pos: [200, -80] },
          { cmd: 'add road', pos: [200, -40] },
          { cmd: 'add road', pos: [200, 40] },
          { cmd: 'add road', pos: [200, 80] },
          { cmd: 'add road', pos: [200, 120] },
          { cmd: 'add road', pos: [200, 160] },
          { cmd: 'add road', pos: [200, 240] },
          { cmd: 'add road at 0 0 ew', pos: [-280, -200] },
          { cmd: 'add road at 0 0 ew', pos: [-240, -200] },
          { cmd: 'add road at 0 0 ew', pos: [-160, -200] },
          { cmd: 'add road at 0 0 ew', pos: [-120, -200] },
          { cmd: 'add road at 0 0 ew', pos: [-80, -200] },
          { cmd: 'add road at 0 0 ew', pos: [-40, -200] },
          { cmd: 'add road at 0 0 ew', pos: [40, -200] },
          { cmd: 'add road at 0 0 ew', pos: [80, -200] },
          { cmd: 'add road at 0 0 ew', pos: [120, -200] },
          { cmd: 'add road at 0 0 ew', pos: [160, -200] },
          { cmd: 'add road at 0 0 ew', pos: [240, -200] },
          { cmd: 'add road at 0 0 ew', pos: [-280, -100] },
          { cmd: 'add road at 0 0 ew', pos: [-240, -100] },
          { cmd: 'add road at 0 0 ew', pos: [-160, -100] },
          { cmd: 'add road at 0 0 ew', pos: [-120, -100] },
          { cmd: 'add road at 0 0 ew', pos: [-80, -100] },
          { cmd: 'add road at 0 0 ew', pos: [-40, -100] },
          { cmd: 'add road at 0 0 ew', pos: [40, -100] },
          { cmd: 'add road at 0 0 ew', pos: [80, -100] },
          { cmd: 'add road at 0 0 ew', pos: [120, -100] },
          { cmd: 'add road at 0 0 ew', pos: [160, -100] },
          { cmd: 'add road at 0 0 ew', pos: [240, -100] },
          { cmd: 'add road at 0 0 ew', pos: [-280, 0] },
          { cmd: 'add road at 0 0 ew', pos: [-240, 0] },
          { cmd: 'add road at 0 0 ew', pos: [-160, 0] },
          { cmd: 'add road at 0 0 ew', pos: [-120, 0] },
          { cmd: 'add road at 0 0 ew', pos: [-80, 0] },
          { cmd: 'add road at 0 0 ew', pos: [-40, 0] },
          { cmd: 'add road at 0 0 ew', pos: [40, 0] },
          { cmd: 'add road at 0 0 ew', pos: [80, 0] },
          { cmd: 'add road at 0 0 ew', pos: [120, 0] },
          { cmd: 'add road at 0 0 ew', pos: [160, 0] },
          { cmd: 'add road at 0 0 ew', pos: [240, 0] },
          { cmd: 'add road at 0 0 ew', pos: [-280, 100] },
          { cmd: 'add road at 0 0 ew', pos: [-240, 100] },
          { cmd: 'add road at 0 0 ew', pos: [-160, 100] },
          { cmd: 'add road at 0 0 ew', pos: [-120, 100] },
          { cmd: 'add road at 0 0 ew', pos: [-80, 100] },
          { cmd: 'add road at 0 0 ew', pos: [-40, 100] },
          { cmd: 'add road at 0 0 ew', pos: [40, 100] },
          { cmd: 'add road at 0 0 ew', pos: [80, 100] },
          { cmd: 'add road at 0 0 ew', pos: [120, 100] },
          { cmd: 'add road at 0 0 ew', pos: [160, 100] },
          { cmd: 'add road at 0 0 ew', pos: [240, 100] },
          { cmd: 'add road at 0 0 ew', pos: [-280, 200] },
          { cmd: 'add road at 0 0 ew', pos: [-240, 200] },
          { cmd: 'add road at 0 0 ew', pos: [-160, 200] },
          { cmd: 'add road at 0 0 ew', pos: [-120, 200] },
          { cmd: 'add road at 0 0 ew', pos: [-80, 200] },
          { cmd: 'add road at 0 0 ew', pos: [-40, 200] },
          { cmd: 'add road at 0 0 ew', pos: [40, 200] },
          { cmd: 'add road at 0 0 ew', pos: [80, 200] },
          { cmd: 'add road at 0 0 ew', pos: [120, 200] },
          { cmd: 'add road at 0 0 ew', pos: [160, 200] },
          { cmd: 'add road at 0 0 ew', pos: [240, 200] },
          { cmd: 'add intersection', pos: [-200, -200] },
          { cmd: 'add intersection', pos: [-200, -100] },
          { cmd: 'add intersection', pos: [-200, 0] },
          { cmd: 'add intersection', pos: [-200, 100] },
          { cmd: 'add intersection', pos: [-200, 200] },
          { cmd: 'add intersection', pos: [-100, -200] },
          { cmd: 'add intersection', pos: [-100, -100] },
          { cmd: 'add intersection', pos: [-100, 0] },
          { cmd: 'add intersection', pos: [-100, 100] },
          { cmd: 'add intersection', pos: [-100, 200] },
          { cmd: 'add intersection', pos: [0, -200] },
          { cmd: 'add intersection', pos: [0, -100] },
          { cmd: 'add intersection', pos: [0, 0] },
          { cmd: 'add intersection', pos: [0, 100] },
          { cmd: 'add intersection', pos: [0, 200] },
          { cmd: 'add intersection', pos: [100, -200] },
          { cmd: 'add intersection', pos: [100, -100] },
          { cmd: 'add intersection', pos: [100, 0] },
          { cmd: 'add intersection', pos: [100, 100] },
          { cmd: 'add intersection', pos: [100, 200] },
          { cmd: 'add intersection', pos: [200, -200] },
          { cmd: 'add intersection', pos: [200, -100] },
          { cmd: 'add intersection', pos: [200, 0] },
          { cmd: 'add intersection', pos: [200, 100] },
          { cmd: 'add intersection', pos: [200, 200] },
          { cmd: 'add skyscraper', pos: [-50, -50] },
          { cmd: 'add apartment', pos: [-20, -50] },
          { cmd: 'add skyscraper', pos: [50, -50] },
          { cmd: 'add apartment', pos: [80, -50] },
          { cmd: 'add skyscraper', pos: [-50, 50] },
          { cmd: 'add apartment', pos: [-20, 50] },
          { cmd: 'add skyscraper', pos: [50, 50] },
          { cmd: 'add apartment', pos: [80, 50] },
          { cmd: 'add grocery', pos: [-75, -165], rot: 1.5708 },
          { cmd: 'add restaurant', pos: [-75, -135], rot: 1.5708 },
          { cmd: 'add apartment', pos: [-50, -150] },
          { cmd: 'add restaurant', pos: [25, -165], rot: 1.5708 },
          { cmd: 'add bank', pos: [25, -135], rot: 1.5708 },
          { cmd: 'add apartment', pos: [50, -150] },
          { cmd: 'add bank', pos: [-75, 135], rot: 1.5708 },
          { cmd: 'add cafe', pos: [-75, 165], rot: 1.5708 },
          { cmd: 'add apartment', pos: [-50, 150] },
          { cmd: 'add cafe', pos: [25, 135], rot: 1.5708 },
          { cmd: 'add salon', pos: [25, 165], rot: 1.5708 },
          { cmd: 'add apartment', pos: [50, 150] },
          { cmd: 'add salon', pos: [-175, -65], rot: 1.5708 },
          { cmd: 'add pharmacy', pos: [-175, -35], rot: 1.5708 },
          { cmd: 'add apartment', pos: [-150, -50] },
          { cmd: 'add pharmacy', pos: [-175, 35], rot: 1.5708 },
          { cmd: 'add clothing', pos: [-175, 65], rot: 1.5708 },
          { cmd: 'add apartment', pos: [-150, 50] },
          { cmd: 'add clothing', pos: [125, -65], rot: 1.5708 },
          { cmd: 'add barber', pos: [125, -35], rot: 1.5708 },
          { cmd: 'add apartment', pos: [150, -50] },
          { cmd: 'add barber', pos: [125, 35], rot: 1.5708 },
          { cmd: 'add grocery', pos: [125, 65], rot: 1.5708 },
          { cmd: 'add apartment', pos: [150, 50] },
          { cmd: 'add modern house', pos: [-170, -170], rot: 0 },
          { cmd: 'add modern house 2 floors', pos: [-130, -170], rot: 0 },
          { cmd: 'add pitched house', pos: [-170, -130], rot: 3.1416 },
          { cmd: 'add ranch', pos: [-130, -130], rot: 3.1416 },
          { cmd: 'add fence', pos: [-188, -150] },
          { cmd: 'add fence', pos: [-112, -150] },
          { cmd: 'add fence', pos: [-150, -188] },
          { cmd: 'add fence', pos: [-150, -112] },
          { cmd: 'add pool', pos: [-138, -140] },
          { cmd: 'add tree', pos: [-158, -150] },
          { cmd: 'add tree', pos: [-142, -150] },
          { cmd: 'add tree', pos: [-150, -158] },
          { cmd: 'add mansion', pos: [130, -170], rot: 0 },
          { cmd: 'add duplex', pos: [170, -170], rot: 0 },
          { cmd: 'add modern house', pos: [130, -130], rot: 3.1416 },
          { cmd: 'add modern house 2 floors', pos: [170, -130], rot: 3.1416 },
          { cmd: 'add fence', pos: [112, -150] },
          { cmd: 'add fence', pos: [188, -150] },
          { cmd: 'add fence', pos: [150, -188] },
          { cmd: 'add fence', pos: [150, -112] },
          { cmd: 'add pool', pos: [162, -140] },
          { cmd: 'add tree', pos: [142, -150] },
          { cmd: 'add tree', pos: [158, -150] },
          { cmd: 'add tree', pos: [150, -158] },
          { cmd: 'add pitched house', pos: [-170, 130], rot: 0 },
          { cmd: 'add ranch', pos: [-130, 130], rot: 0 },
          { cmd: 'add mansion', pos: [-170, 170], rot: 3.1416 },
          { cmd: 'add duplex', pos: [-130, 170], rot: 3.1416 },
          { cmd: 'add fence', pos: [-188, 150] },
          { cmd: 'add fence', pos: [-112, 150] },
          { cmd: 'add fence', pos: [-150, 112] },
          { cmd: 'add fence', pos: [-150, 188] },
          { cmd: 'add pool', pos: [-138, 160] },
          { cmd: 'add tree', pos: [-158, 150] },
          { cmd: 'add tree', pos: [-142, 150] },
          { cmd: 'add tree', pos: [-150, 142] },
          { cmd: 'add modern house', pos: [130, 130], rot: 0 },
          { cmd: 'add modern house 2 floors', pos: [170, 130], rot: 0 },
          { cmd: 'add pitched house', pos: [130, 170], rot: 3.1416 },
          { cmd: 'add ranch', pos: [170, 170], rot: 3.1416 },
          { cmd: 'add fence', pos: [112, 150] },
          { cmd: 'add fence', pos: [188, 150] },
          { cmd: 'add fence', pos: [150, 112] },
          { cmd: 'add fence', pos: [150, 188] },
          { cmd: 'add pool', pos: [162, 160] },
          { cmd: 'add tree', pos: [142, 150] },
          { cmd: 'add tree', pos: [158, 150] },
          { cmd: 'add tree', pos: [150, 142] },
          { cmd: 'add traffic light', pos: [-108, -8] },
          { cmd: 'add traffic light', pos: [-92, 8] },
          { cmd: 'add traffic light', pos: [92, -8] },
          { cmd: 'add traffic light', pos: [108, 8] },
          { cmd: 'add traffic light', pos: [-8, -108] },
          { cmd: 'add traffic light', pos: [8, -92] },
          { cmd: 'add traffic light', pos: [-8, 92] },
          { cmd: 'add traffic light', pos: [8, 108] },
          { cmd: 'add traffic light', pos: [-8, -8] },
          { cmd: 'add traffic light', pos: [8, 8] },
          { cmd: 'add stop sign', pos: [-193, -193] },
          { cmd: 'add stop sign', pos: [-193, 207] },
          { cmd: 'add stop sign', pos: [207, -193] },
          { cmd: 'add stop sign', pos: [207, 207] },
          { cmd: 'add ph_street_lamp_01', pos: [-9, -250] },
          { cmd: 'add ph_street_lamp_01', pos: [9, -250] },
          { cmd: 'add ph_street_lamp_01', pos: [-9, -210] },
          { cmd: 'add ph_street_lamp_01', pos: [9, -210] },
          { cmd: 'add ph_street_lamp_01', pos: [-9, -170] },
          { cmd: 'add ph_street_lamp_01', pos: [9, -170] },
          { cmd: 'add ph_street_lamp_01', pos: [-9, -130] },
          { cmd: 'add ph_street_lamp_01', pos: [9, -130] },
          { cmd: 'add ph_street_lamp_01', pos: [-9, -90] },
          { cmd: 'add ph_street_lamp_01', pos: [9, -90] },
          { cmd: 'add ph_street_lamp_01', pos: [-9, -50] },
          { cmd: 'add ph_street_lamp_01', pos: [9, -50] },
          { cmd: 'add ph_street_lamp_01', pos: [-9, -10] },
          { cmd: 'add ph_street_lamp_01', pos: [9, -10] },
          { cmd: 'add ph_street_lamp_01', pos: [-9, 30] },
          { cmd: 'add ph_street_lamp_01', pos: [9, 30] },
          { cmd: 'add ph_street_lamp_01', pos: [-9, 70] },
          { cmd: 'add ph_street_lamp_01', pos: [9, 70] },
          { cmd: 'add ph_street_lamp_01', pos: [-9, 110] },
          { cmd: 'add ph_street_lamp_01', pos: [9, 110] },
          { cmd: 'add ph_street_lamp_01', pos: [-9, 150] },
          { cmd: 'add ph_street_lamp_01', pos: [9, 150] },
          { cmd: 'add ph_street_lamp_01', pos: [-9, 190] },
          { cmd: 'add ph_street_lamp_01', pos: [9, 190] },
          { cmd: 'add ph_street_lamp_01', pos: [-9, 230] },
          { cmd: 'add ph_street_lamp_01', pos: [9, 230] },
          { cmd: 'add ph_fire_hydrant', pos: [-9, -200] },
          { cmd: 'add ph_fire_hydrant', pos: [-9, -100] },
          { cmd: 'add ph_fire_hydrant', pos: [-9, 0] },
          { cmd: 'add ph_fire_hydrant', pos: [-9, 100] },
          { cmd: 'add ph_fire_hydrant', pos: [-9, 200] },
          { cmd: 'add bench', pos: [-9, -150] },
          { cmd: 'add bench', pos: [-9, -90] },
          { cmd: 'add bench', pos: [-9, -30] },
          { cmd: 'add bench', pos: [-9, 30] },
          { cmd: 'add bench', pos: [-9, 90] },
          { cmd: 'add bench', pos: [-9, 150] },
          { cmd: 'add tree', pos: [-165, 135] },
          { cmd: 'add tree', pos: [-165, 147] },
          { cmd: 'add tree', pos: [-165, 159] },
          { cmd: 'add tree', pos: [-155, 135] },
          { cmd: 'add tree', pos: [-155, 147] },
          { cmd: 'add tree', pos: [-155, 159] },
          { cmd: 'add tree', pos: [-145, 135] },
          { cmd: 'add tree', pos: [-145, 147] },
          { cmd: 'add tree', pos: [-145, 159] },
          { cmd: 'add ph_park_bench', pos: [-155, 150] },
          { cmd: 'add ph_park_bench', pos: [-145, 155] },
          { cmd: 'add gas station', pos: [150, -150] },
          { cmd: 'add parking lot', pos: [-150, -150] },
          { cmd: 'spawn villager', scatter: { count: 4, radius: 100 } },
          { cmd: 'spawn woman', scatter: { count: 3, radius: 80 } },
        ]
      },
      suburban: {
        terrain: { type: 'flat', height: 0 },
        ground: 'grass', env: ['time morning'],
        items: [
          // Quiet residential street
          { cmd: 'add road', pos: [0, -40] },
          { cmd: 'add road', pos: [0, 0] },
          { cmd: 'add road', pos: [0, 40] },
          { cmd: 'add road', pos: [0, 80] },
          // Houses with yards — spaced out
          { cmd: 'add modern house', pos: [-25, -35], rot: Math.PI/2 },
          { cmd: 'add pitched house', pos: [-25, -10], rot: Math.PI/2 },
          { cmd: 'add ranch', pos: [-25, 15], rot: Math.PI/2 },
          { cmd: 'add modern house 2 floors', pos: [-25, 40], rot: Math.PI/2 },
          { cmd: 'add mansion', pos: [-25, 65], rot: Math.PI/2 },
          { cmd: 'add pitched house', pos: [25, -35], rot: -Math.PI/2 },
          { cmd: 'add modern house 2 floors', pos: [25, -10], rot: -Math.PI/2 },
          { cmd: 'add duplex', pos: [25, 15], rot: -Math.PI/2 },
          { cmd: 'add modern house', pos: [25, 40], rot: -Math.PI/2 },
          { cmd: 'add ranch', pos: [25, 65], rot: -Math.PI/2 },
          // Pools in backyards
          { cmd: 'add pool', pos: [-35, -8] },
          { cmd: 'add pool', pos: [35, 42] },
          { cmd: 'add pool', pos: [-35, 67] },
          // Trees in yards
          { cmd: 'add tree', pos: [-20, -25] }, { cmd: 'add tree', pos: [-20, 5] },
          { cmd: 'add tree', pos: [20, -20] }, { cmd: 'add tree', pos: [20, 25] },
          { cmd: 'add tree', pos: [-20, 50] }, { cmd: 'add tree', pos: [20, 55] },
          { cmd: 'add tree', pos: [-32, -30] }, { cmd: 'add tree', pos: [32, 10] },
          // Street lamps
          { cmd: 'add ph_street_lamp_01', pos: [-7, -30] },
          { cmd: 'add ph_street_lamp_01', pos: [7, -10] },
          { cmd: 'add ph_street_lamp_01', pos: [-7, 20] },
          { cmd: 'add ph_street_lamp_01', pos: [7, 50] },
          { cmd: 'add ph_street_lamp_01', pos: [-7, 75] },
          // Fire hydrants
          { cmd: 'add ph_fire_hydrant', pos: [-7, -20] },
          { cmd: 'add ph_fire_hydrant', pos: [7, 30] },
          // Mailboxes (just small boxes for now)
          { cmd: 'add trash can', pos: [-14, -34] },
          { cmd: 'add trash can', pos: [14, -9] },
          { cmd: 'add trash can', pos: [-14, 16] },
          // Parked cars
          // Park at the end
          { cmd: 'add tree', pos: [0, 90] }, { cmd: 'add tree', pos: [-8, 95] },
          { cmd: 'add tree', pos: [8, 95] }, { cmd: 'add tree', pos: [-4, 100] },
          { cmd: 'add tree', pos: [4, 100] },
          { cmd: 'add ph_park_bench', pos: [0, 92] },
        ],
        npcs: { count: 6 },
      },
    }
    
    const template = MAP_TEMPLATES[mapType] || MAP_TEMPLATES['town'];
    
    // Apply water preset if template has one
    if (template.water && WATER_PRESETS[template.water]) {
      // Will be applied after ocean/lake is created
      window._pendingWaterPreset = template.water;
    }
    
    // Build command queue from JSON template
    const commands = [];
    
    // Terrain first
    if (template.terrain) {
      const tType = template.terrain.type || 'hills';
      commands.push('terrain ' + tType);
      // Set terrain height scale
      if (template.terrain.height) {
        // Height is applied via createTerrain params
      }
    }
    
    // Ground type (color scheme)
    if (template.ground) {
      commands.push('ground ' + template.ground);
    }
    
    // Environment commands
    if (template.env) {
      template.env.forEach(e => commands.push(e));
    }
    
    // Weather
    if (template.weather) {
      commands.push(template.weather);
    }
    
    // Particles
    if (template.particles) {
      commands.push('particles ' + template.particles);
    }
    
    // Items with positioning
    for (const item of (template.items || [])) {
      if (item.scatter) {
        const s = item.scatter;
        const count = s.count || 1;
        const radius = s.radius || 30;
        const avoidCenter = s.avoidCenter || 0;
        for (let j = 0; j < count; j++) {
          let px, pz, attempts = 0;
          do {
            const angle = Math.random() * Math.PI * 2;
            const dist = avoidCenter + Math.random() * (radius - avoidCenter);
            px = Math.round(Math.cos(angle) * dist);
            pz = Math.round(Math.sin(angle) * dist);
            attempts++;
          } while (attempts < 10 && avoidCenter > 0 && Math.sqrt(px*px + pz*pz) < avoidCenter);
          commands.push(item.cmd + ' at ' + px + ' ' + pz);
        }
      } else if (item.pos) {
        commands.push(item.cmd + ' at ' + item.pos[0] + ' ' + item.pos[1]);
        if (item.rot !== undefined) {
          // Store rotation to apply after placement
          if (!window._pendingRotations) window._pendingRotations = {};
          window._pendingRotations[item.pos[0] + ',' + item.pos[1]] = item.rot;
        }
      } else {
        commands.push(item.cmd);
      }
    }
    
    // Execute all commands sequentially
    let ci = 0;
    const runNext = () => {
      if (ci >= commands.length) {
        showToast('🗺️ ' + mapTheme + ' generated! ' + commands.length + ' elements placed.');
        if (mapType === 'city') setAmbientSound('city');
        // Spawn driving cars for city
        if (mapType === 'city' || mapType === 'cyberpunk') {
          setTimeout(function() {
            // Smart traffic cars with GLB models and AI
            console.log("[Traffic] Spawning smart traffic cars on city grid...");
            // N-S roads at x = -200, -100, 0, 100, 200
            const nsRoads = [-200, -100, 0, 100, 200];
            const ewRoads = [-200, -100, 0, 100, 200];
            let carIdx = 0;
            // Cars on N-S roads
            for (const rx of nsRoads) {
              for (let ci = 0; ci < 3; ci++) {
                const lane = ci % 2 === 0 ? -2.5 : 2.5;
                const startZ = -180 + ci * 120;
                const dir = new THREE.Vector3(0, 0, lane < 0 ? 1 : -1);
                setTimeout(() => spawnTrafficCar(rx + lane, startZ, dir, 0), carIdx * 400);
                carIdx++;
              }
            }
            // Cars on E-W roads
            for (const rz of ewRoads) {
              for (let ci = 0; ci < 2; ci++) {
                const lane = ci % 2 === 0 ? -2.5 : 2.5;
                const startX = -150 + ci * 200;
                const dir = new THREE.Vector3(ci % 2 === 0 ? 1 : -1, 0, 0);
                setTimeout(() => spawnTrafficCar(startX, rz + lane, dir, 0), carIdx * 400);
                carIdx++;
              }
            }
            console.log("[Traffic] Queued " + carIdx + " cars");
          }, 1000);
        }
        // Spawn GPU instanced grass for any generated world
        try {
          if (window._grassSystem) { window._grassSystem.dispose(); window._grassSystem = null; }
          Promise.resolve() /* grass-system disabled */.then(({ createGrassForWorld }) => {
            if (window._scene) {
              const manifest = { spawn: { position: [0, 0, 0] }, world_size: [200, 200] };
              window._grassSystem = createGrassForWorld(window._scene, manifest);
              console.log('[Grass] Spawned ' + window._grassSystem.count + ' blades');
            }
          }).catch(e => console.warn('[Grass] Failed:', e.message));
        } catch(e) {}
        return;
      }
      const cmd = commands[ci];
      execSingle(cmd).then(() => {
        // Apply pending rotation if any
        const posMatch = cmd.match(/at\s+(-?[\d.]+)\s+(-?[\d.]+)/);
        if (posMatch && window._pendingRotations) {
          const key = posMatch[1] + ',' + posMatch[2];
          if (window._pendingRotations[key] !== undefined) {
            // Find the last added object at this position
            const tx = parseFloat(posMatch[1]), tz = parseFloat(posMatch[2]);
            for (let oi = objects.length - 1; oi >= 0; oi--) {
              const o = objects[oi];
              if (Math.abs(o.position.x - tx) < 2 && Math.abs(o.position.z - tz) < 2) {
                o.rotation.y = window._pendingRotations[key];
                break;
              }
            }
            delete window._pendingRotations[key];
          }
        }
      });
      ci++;
      setTimeout(runNext, 80);
    };
    runNext();
    return '🗺️ Generating ' + mapTheme + ' (' + commands.length + ' elements)...';
  }

  if (window._handleGenerateCommand) { const r = window._handleGenerateCommand(lower); if (r) return r; }
  
  // Game preset commands — "make this a zombie game", "zombie mode", etc.
  const presetResult = tryApplyGamePreset(lower);
  if (presetResult) return presetResult;
  
  if (lower === "3d generator" || lower === "generator" || lower === "generate 3d") { showGeneratorModal(); return "🎨 Opening 3D Generator..."; }
  
  // Smart model search — "search car", "find zombie", "browse weapons"
  const searchMatch = lower.match(/^(?:search|find|browse|look for|show)\s+(.+)/);
  if (searchMatch) {
    const query = searchMatch[1];
    const results = searchModels(query, 15);
    if (results.length === 0) {
      return '🔍 No models found for "' + query + '"';
    }
    let msg = '🔍 Found ' + results.length + ' models for "' + query + '":\n';
    for (const r of results) {
      msg += '  • ' + r.name + ' [' + r.tags.slice(0,3).join(', ') + ']\n';
    }
    msg += '\nUse: add <model-name> to place one';
    appendToOutput(msg);
    return msg;
  }

  
  if (lower === "models" || lower === "model count" || lower === "how many models") {
    const count = Object.keys(GLB_MODELS).length;
    return "📚 Crate Engine Model Library: " + count + "+ models\n\nCategories:\n  🚗 Vehicles: sedan, SUV, taxi, ambulance, ferrari, truck\n  🏢 Buildings: houses, offices, shops, skyscrapers\n  🛋️ Furniture: tables, chairs, sofas, beds, shelves\n  ⚔️ Weapons: swords, axes, bows, blasters, shields\n  🌿 Nature: trees, rocks, plants, flowers\n  🛤️ Roads: straight, curved, intersections\n  🧟 Characters: NPCs, zombies, skeletons, dragons\n  🏴‍☠️ Themed: pirate, medieval, dungeon, sci-fi, horror\n\nUse: search [keyword] to find specific models\nUse: add [name] to place in scene";
  }

  
  // ═══ MODEL SEARCH — "search car", "find weapon", "browse furniture" ═══
  const modelSearchMatch = lower.match(/^(?:search|find|browse|list|show)\s+(?:models?\s+)?(?:for\s+)?(.+)/);
  if (modelSearchMatch) {
    const query = modelSearchMatch[1].toLowerCase().trim();
    const results = [];
    const glbKeys = Object.keys(GLB_MODELS);
    for (const key of glbKeys) {
      if (key.includes(query) || GLB_MODELS[key].includes(query)) {
        results.push(key);
      }
    }
    if (results.length === 0) {
      return "🔍 No models found for '" + query + "'. Try: car, building, weapon, furniture, tree, road";
    }
    const shown = results.slice(0, 30);
    const msg = "🔍 Found " + results.length + " models for '" + query + "':\n" + 
      shown.map(r => "  • " + r).join("\n") +
      (results.length > 30 ? "\n  ... and " + (results.length - 30) + " more" : "") +
      "\n\nUse: add [name] to place one in your scene";
    return msg;
  }

  if (lower === "game modes" || lower === "games" || lower === "game mode" || lower === "modes") { showGameModesModal(); return "🎮 Opening Game Modes..."; }
  if (lower === "game modes" || lower === "games" || lower === "game mode" || lower === "modes") { showGameModesModal(); return "🎮 Opening Game Modes..."; }
  if (lower === "meshy" || lower === "meshy key" || lower === "meshy settings" || lower === "meshy api") { showMeshyKeyModal(); return "🔑 Opening Meshy AI settings..."; }

  // ─── RESIZE / SCALE COMMANDS ───
  // GPU instancing commands
  const scatterInstMatch = lower.match(/^scatter\s+(\d+)\s+(\w+)\s*(?:instanced|gpu)?/);
  if (scatterInstMatch && parseInt(scatterInstMatch[1]) >= 20) {
    const num = parseInt(scatterInstMatch[1]);
    const obj = scatterInstMatch[2];
    const glb = GLB_MODELS[obj] || obj;
    if (num >= 20) { return addToLog('⚡ ' + scatterInstanced(glb, num)); }
  }
  
  // Reflection/wetness commands
  const _wetMatch = lower.match(/^wet(?:ness)?\s+(\d+\.?\d*)/);
  if (_wetMatch) { setSceneWetness(parseFloat(_wetMatch[1])); return addToLog('✓ Wetness set'); }
  if (lower === 'wet' || lower === 'wet ground' || lower === 'puddles') { setSceneWetness(0.6); return addToLog('✓ Wet ground enabled'); }
  if (lower === 'dry' || lower === 'dry ground') { setSceneWetness(0); return addToLog('✓ Ground dried'); }
  
  // Particle commands
  const _partMatch = lower.match(/^particles?\s+(dust|fireflies|embers|fire|rain|snow|ash|spores|bubbles|leaves|petals|off|none|clear)/);
  if (_partMatch) {
    let pType = _partMatch[1]; if (pType === 'fire') pType = 'embers'; if (pType === 'rain') { setWeather('rain'); return '✓ Rain'; } if (pType === 'clear') pType = 'off';
    if (pType === 'off' || pType === 'none') { if (ambientParticles) { scene.remove(ambientParticles); ambientParticles = null; } return addToLog('✓ Particles off'); }
    createAmbientParticles(pType);
    return addToLog('✓ Ambient particles: ' + pType);
  }
  
  // Multiplayer commands
  if (lower === 'multiplayer' || lower === 'mp' || lower === 'lobby' || lower === 'join game' || lower === 'online' || lower === 'co-op' || lower === 'coop') {
    showMultiplayerLobby();
    return addToLog('🌐 Multiplayer lobby opened');
  }
  if (lower.match(/^join\s+(.+)/)) {
    const room = lower.match(/^join\s+(.+)/)[1];
    const server = localStorage.getItem('mp_server') || 'wss://crate-engine-mp.fly.dev';
    const name = localStorage.getItem('mp_name') || 'Player';
    if (window._mp) window._mp.connect(server, room, name);
    return addToLog('🌐 Joining room: ' + room);
  }
  if (lower === 'disconnect' || lower === 'leave room' || lower === 'leave mp') {
    if (window._mp) window._mp.disconnect();
    return addToLog('🌐 Disconnected from multiplayer');
  }
  if (lower.match(/^chat\s+(.+)/)) {
    const msg = lower.match(/^chat\s+(.+)/)[1];
    if (window._mp) window._mp.chat(msg);
    return addToLog('💬 ' + msg);
  }
  
  // Graphics quality commands
  if (lower.match(/^(graphics|quality|graphics quality|set quality|visual quality)\s*(low|medium|high|ultra)?$/)) {
    const lvl = lower.match(/(low|medium|high|ultra)/);
    if (lvl) return addToLog(setGraphicsQuality(lvl[1]));
    return addToLog('Current quality: ' + (ppEnabled ? 'HIGH' : 'LOW') + '. Use: graphics low/medium/high/ultra');
  }
  if (lower === 'bloom off') { if (bloomPass) bloomPass.enabled = false; return addToLog('✓ Bloom disabled'); }
  if (lower === 'bloom on') { if (bloomPass) bloomPass.enabled = true; return addToLog('✓ Bloom enabled'); }
  if (lower.match(/^bloom\s+(\d+\.?\d*)/)) { setBloomSettings(parseFloat(lower.match(/(\d+\.?\d*)/)[1])); return addToLog('✓ Bloom strength set'); }
  if (lower === 'ssao off') { if (ssaoPass) ssaoPass.enabled = false; return addToLog('✓ SSAO disabled'); }
  if (lower === 'ssao on') { if (ssaoPass) ssaoPass.enabled = true; return addToLog('✓ SSAO enabled'); }
  if (lower === 'postfx off' || lower === 'post processing off') { togglePostProcessing(false); return addToLog('✓ Post-processing OFF'); }
  if (lower === 'postfx on' || lower === 'post processing on') { togglePostProcessing(true); return addToLog('✓ Post-processing ON'); }
  if (lower.match(/^vignette\s+(\d+\.?\d*)/)) { if (window._colorPass) window._colorPass.uniforms.vignetteStrength.value = parseFloat(lower.match(/(\d+\.?\d*)/)[1]); return addToLog('✓ Vignette set'); }
  if (lower.match(/^grain\s+(\d+\.?\d*)/)) { if (window._colorPass) window._colorPass.uniforms.filmGrain.value = parseFloat(lower.match(/(\d+\.?\d*)/)[1]); return addToLog('✓ Film grain set'); }
  
  // AI Settings
  if (lower === 'ai settings' || lower === 'ai config' || lower === 'api key' || lower === 'set api key' || lower === 'ai setup' || lower === 'model settings') {
    showAISettingsModal();
    return addToLog('⚙️ AI Settings opened — connect your own AI model');
  }
  
  const resizeMatch = lower.match(/(?:resize|set size|set scale)\s+([\w_]+)\s+(?:to\s+)?(\d+\.?\d*)/);
  const biggerMatch = lower.match(/make\s+([\w_]+)\s+(bigger|larger|huge|giant|enormous|massive)/);
  const smallerMatch = lower.match(/make\s+([\w_]+)\s+(smaller|tiny|mini|miniature|little|shrink)/);
  const scaleMultMatch = lower.match(/scale\s+([\w_]+)\s+(\d+\.?\d*)x?/);
  
  if (resizeMatch || biggerMatch || smallerMatch || scaleMultMatch) {
    const match = resizeMatch || biggerMatch || smallerMatch || scaleMultMatch;
    const objName = match[1].toLowerCase();
    const arg = match[2];
    found = null;
    scene.traverse(child => {
      if (child.userData && child.userData.name && child.userData.name.toLowerCase().includes(objName)) {
        found = child;
      }
    });
    if (!found) return addToLog('⚠️ Object "' + objName + '" not found in scene');
    
    if (resizeMatch) {
      found.scale.setScalar(parseFloat(arg));
    } else if (biggerMatch) {
      const mult = (arg === 'huge' || arg === 'giant' || arg === 'enormous' || arg === 'massive') ? 3.0 : 1.5;
      found.scale.multiplyScalar(mult);
    } else if (smallerMatch) {
      const mult = (arg === 'tiny' || arg === 'mini' || arg === 'miniature' || arg === 'little') ? 0.3 : 0.67;
      found.scale.multiplyScalar(mult);
    } else if (scaleMultMatch) {
      found.scale.multiplyScalar(parseFloat(arg));
    }
    // Reground after resize
    const box = new THREE.Box3().setFromObject(found);
    found.position.y -= box.min.y;
    return addToLog('✓ Resized ' + found.userData.name + ' → scale ' + found.scale.x.toFixed(2));
  }

  const parts = lower.split(/\s+/);

  // === CONTEXT-AWARE COMMANDS — work on selected/last placed object ===
  const ctxObj = selectedObj || window._lastPlacedObj || (objects.length > 0 ? objects[objects.length - 1] : null);
  
  // Color commands: "make it red", "color it blue", "paint it gold"
  const colorMatch = lower.match(/^(?:make (?:it |this |that )?|color (?:it |this |that )?|paint (?:it |this |that )?|set color (?:to )?|change color (?:to )?)(red|orange|yellow|green|blue|purple|pink|cyan|white|gray|grey|brown|black|gold|silver|dark red|dark blue|forest green|lavender)$/);
  if (colorMatch && ctxObj) {
    const colorMap = { red:'#ef4444', orange:'#f97316', yellow:'#eab308', green:'#22c55e', blue:'#3b82f6', purple:'#8b5cf6', pink:'#ec4899', cyan:'#06b6d4', white:'#ffffff', gray:'#6b7280', grey:'#6b7280', brown:'#92400e', black:'#1f2937', gold:'#fbbf24', silver:'#d1d5db', 'dark red':'#991b1b', 'dark blue':'#1e3a5f', 'forest green':'#14532d', lavender:'#c4b5fd' };
    const hex = colorMap[colorMatch[1]] || '#ffffff';
    const color = new THREE.Color(hex);
    ctxObj.traverse(child => { if (child.isMesh && child.material) { (Array.isArray(child.material) ? child.material : [child.material]).forEach(m => { m.color.copy(color); m.needsUpdate = true; }); } });
    return '🎨 Colored ' + (ctxObj.userData.name || 'object') + ' ' + colorMatch[1];
  }
  
  // Size commands: "make it bigger", "smaller", "huge", "tiny"
  const sizeMatch = lower.match(/^(?:make (?:it |this |that )?|scale (?:it )?)(bigger|larger|huge|massive|giant|smaller|tiny|mini|miniature|double|half|normal)$/);
  if (sizeMatch && ctxObj) {
    const scales = { bigger:1.5, larger:1.5, huge:3, massive:5, giant:4, smaller:0.6, tiny:0.25, mini:0.3, miniature:0.2, double:2, half:0.5, normal:1 };
    const factor = scales[sizeMatch[1]] || 1;
    if (sizeMatch[1] === 'normal') { ctxObj.scale.setScalar(1); } else { ctxObj.scale.multiplyScalar(factor); }
    return '📐 Scaled ' + (ctxObj.userData.name || 'object') + ' ' + sizeMatch[1];
  }
  
  // Move commands: "move it left/right/forward/back/up/down"
  const moveMatch = lower.match(/^(?:move (?:it |this |that )?|push (?:it )?|slide (?:it )?)(left|right|forward|back|backward|up|down)(?:\s+(\d+))?$/);
  if (moveMatch && ctxObj) {
    const dist = parseFloat(moveMatch[2]) || 2;
    const dir = moveMatch[1];
    if (dir === 'left') ctxObj.position.x -= dist;
    else if (dir === 'right') ctxObj.position.x += dist;
    else if (dir === 'forward') ctxObj.position.z -= dist;
    else if (dir === 'back' || dir === 'backward') ctxObj.position.z += dist;
    else if (dir === 'up') ctxObj.position.y += dist;
    else if (dir === 'down') ctxObj.position.y -= dist;
    return '↔️ Moved ' + (ctxObj.userData.name || 'object') + ' ' + dir + (moveMatch[2] ? ' ' + dist + ' units' : '');
  }
  
  // Rotate commands: "rotate it", "spin it", "turn it"
  const rotMatch = lower.match(/^(?:rotate|turn|spin) (?:it |this |that )?(?:(left|right|around)(?:\s+(\d+))?|(\d+) degrees?)$/);
  if (rotMatch && ctxObj) {
    let deg = 45;
    if (rotMatch[2]) deg = parseInt(rotMatch[2]);
    if (rotMatch[3]) deg = parseInt(rotMatch[3]);
    if (rotMatch[1] === 'left') deg = -deg;
    if (rotMatch[1] === 'around') deg = 180;
    ctxObj.rotation.y += deg * Math.PI / 180;
    return '🔄 Rotated ' + (ctxObj.userData.name || 'object') + ' ' + deg + '°';
  }
  
  // Quick animation: "make it spin", "make it bounce", "make it float"
  const quickAnimMatch = lower.match(/^make (?:it |this |that )?(spin|bounce|float|pulse|wobble|dance|shake|swing|breathe|walk|idle|jump)$/);
  if (quickAnimMatch && ctxObj) {
    return applyProceduralAnimation(ctxObj, quickAnimMatch[1]);
  }
  
  // Stop animation: "stop it", "freeze it"
  if ((lower === 'stop it' || lower === 'freeze it' || lower === 'stop animation') && ctxObj) {
    if (ctxObj.userData._procAnim) ctxObj.userData._procAnim = null;
    if (ctxObj.userData.mixer) ctxObj.userData.mixer.stopAllAction();
    return '⏹ Stopped animation on ' + (ctxObj.userData.name || 'object');
  }


  // === CHARACTER SELECTION ===
  const charMatch = lower.match(/^(?:select|choose|pick|set|spawn)\s+(?:character|char|hero|player)\s+(.+)/);
  if (charMatch && characterController) {
    const charType = charMatch[1].trim();
    return characterController.loadCharacter(charType);
  }
  



  
  // VEHICLE: "drive car" / "enter vehicle" / "get in car"
  if (lower.match(/^(drive|enter|get in|hop in|ride|mount)\s/)) {
    const target = lower.replace(/^(drive|enter|get in|hop in|ride|mount)\s+(the |a |an )?/, '');
    const match = objects.find(o => o.userData.name && o.userData.name.toLowerCase().includes(target));
    if (match && isVehicle(match)) {
      enterVehicle({ obj: match, type: isVehicle(match) });
      return '🚗 Now driving ' + match.userData.name + '! Use WASD to drive, F to exit.';
    }
    return '⚠ No drivable vehicle named "' + target + '" found nearby';
  }
  if (lower === 'exit vehicle' || lower === 'get out' || lower === 'stop driving') {
    if (activeVehicle) { exitVehicle(); return '🚶 Exited vehicle'; }
    return '⚠ Not in a vehicle';
  }
  
  // === CUSTOM SCRIPTS ===
  if (lower === 'scripts' || lower === 'script list' || lower === 'custom scripts' || lower === 'game scripts' || lower === 'game logic') {
    showScriptManager();
    return '🧠 Opening script manager...';
  }
  if (lower === 'new script' || lower === 'add script' || lower === 'custom code' || lower === 'code editor') {
    showScriptEditor();
    return '🧠 Opening script editor...';
  }
  if (lower.startsWith('script ')) {
    const desc = lower.replace(/^script\s+/, '');
    generateUserScript(desc).then(code => {
      if (code) {
        const s = { id: 'script_' + Date.now(), name: desc.slice(0,30), description: desc, code, enabled: true };
        window._userScripts.push(s);
        runUserScript(s);
        localStorage.setItem('crate-user-scripts', JSON.stringify(window._userScripts.map(x => ({id:x.id,name:x.name,description:x.description,code:x.code,enabled:x.enabled}))));
      }
    });
    return '🤖 Generating custom script: "' + desc + '"...';
    return '⚠ Not in a vehicle';
  }

  // === UNIVERSAL ASSET GALLERY COMMANDS ===
  // Weapons gallery
  if (lower.match(/^(?:show |browse |open |pick |choose |select )?(?:weapons?|swords?|axes?|guns?|blasters?|bows?|shields?)/)) {
    const result = await showGallery('weapons');
    if (result) {
      const glb = GLB_MODELS[result.file] || result.file;
      loadGLBModel(result.file, glb, 0, 0, null, result.path);
      sceneHistory.push('add ' + result.file);
      return '⚔️ Added ' + result.name + ' to the scene!';
    }
    return '↩ Weapons gallery closed';
  }
  
  // Buildings gallery
  if (lower.match(/^(?:show |browse |open |pick |choose |select )?(?:buildings?|houses?|structures?|castles?|towers?|architecture)/)) {
    const result = await showGallery('buildings');
    if (result) {
      loadGLBModel(result.file, GLB_MODELS[result.file] || result.file, 0, 0, null, result.path);
      sceneHistory.push('add ' + result.file);
      return '🏠 Added ' + result.name + ' to the scene!';
    }
    return '↩ Buildings gallery closed';
  }

  // Vehicles gallery
  if (lower.match(/^(?:show |browse |open |pick |choose |select )?(?:vehicles?|cars?|trucks?|boats?|ships?|planes?)/)) {
    const result = await showGallery('vehicles');
    if (result) {
      loadGLBModel(result.file, GLB_MODELS[result.file] || result.file, 0, 0, null, result.path);
      sceneHistory.push('add ' + result.file);
      return '🚗 Added ' + result.name + ' to the scene!';
    }
    return '↩ Vehicles gallery closed';
  }

  // Animals gallery
  if (lower.match(/^(?:show |browse |open |pick |choose |select )?(?:animals?|creatures?|pets?|wildlife|fish|birds?|dragons?)/)) {
    const result = await showGallery('animals');
    if (result) {
      loadGLBModel(result.file, GLB_MODELS[result.file] || result.file, 0, 0, null, result.path);
      sceneHistory.push('add ' + result.file);
      return '🐾 Added ' + result.name + ' to the scene!';
    }
    return '↩ Animals gallery closed';
  }

  // Trees gallery
  if (lower.match(/^(?:show |browse |open |pick |choose |select )?(?:trees?|plants?|bushes?|flowers?|vegetation|flora|foliage)/)) {
    const result = await showGallery('trees');
    if (result) {
      loadGLBModel(result.file, GLB_MODELS[result.file] || result.file, 0, 0, null, result.path);
      sceneHistory.push('add ' + result.file);
      return '🌳 Added ' + result.name + ' to the scene!';
    }
    return '↩ Trees gallery closed';
  }

  // Rocks gallery
  if (lower.match(/^(?:show |browse |open |pick |choose |select )?(?:rocks?|stones?|boulders?|minerals?|crystals?|gems?|ores?)/)) {
    const result = await showGallery('rocks');
    if (result) {
      loadGLBModel(result.file, GLB_MODELS[result.file] || result.file, 0, 0, null, result.path);
      sceneHistory.push('add ' + result.file);
      return '🪨 Added ' + result.name + ' to the scene!';
    }
    return '↩ Rocks gallery closed';
  }

  // Furniture gallery
  if (lower.match(/^(?:show |browse |open |pick |choose |select )?(?:furniture|tables?|chairs?|beds?|shelves|lamps?|interior|decor)/)) {
    const result = await showGallery('furniture');
    if (result) {
      loadGLBModel(result.file, GLB_MODELS[result.file] || result.file, 0, 0, null, result.path);
      sceneHistory.push('add ' + result.file);
      return '🪑 Added ' + result.name + ' to the scene!';
    }
    return '↩ Furniture gallery closed';
  }

  // Food/Items gallery
  if (lower.match(/^(?:show |browse |open |pick |choose |select )?(?:food|items?|potions?|chests?|barrels?|crates?|supplies|loot|consumables?)/)) {
    const result = await showGallery('food');
    if (result) {
      loadGLBModel(result.file, GLB_MODELS[result.file] || result.file, 0, 0, null, result.path);
      sceneHistory.push('add ' + result.file);
      return '🍖 Added ' + result.name + ' to the scene!';
    }
    return '↩ Items gallery closed';
  }

  // Dungeon gallery
  if (lower.match(/^(?:show |browse |open |pick |choose |select )?(?:dungeon|torches?|skulls?|bones?|traps?|graves?|coffins?|dark|underground)/)) {
    const result = await showGallery('dungeon');
    if (result) {
      loadGLBModel(result.file, GLB_MODELS[result.file] || result.file, 0, 0, null, result.path);
      sceneHistory.push('add ' + result.file);
      return '💀 Added ' + result.name + ' to the scene!';
    }
    return '↩ Dungeon gallery closed';
  }

  // Sci-Fi gallery
  if (lower.match(/^(?:show |browse |open |pick |choose |select )?(?:sci-?fi|space|cyber|neon|futuristic|tech|robots?|mechs?|drones?)/)) {
    const result = await showGallery('scifi');
    if (result) {
      loadGLBModel(result.file, GLB_MODELS[result.file] || result.file, 0, 0, null, result.path);
      sceneHistory.push('add ' + result.file);
      return '🚀 Added ' + result.name + ' to the scene!';
    }
    return '↩ Sci-Fi gallery closed';
  }

  // Nature/Survival gallery
  if (lower.match(/^(?:show |browse |open |pick |choose |select )?(?:nature|survival|camping?|tents?|outdoor|wilderness)/)) {
    const result = await showGallery('nature');
    if (result) {
      loadGLBModel(result.file, GLB_MODELS[result.file] || result.file, 0, 0, null, result.path);
      sceneHistory.push('add ' + result.file);
      return '⛺ Added ' + result.name + ' to the scene!';
    }
    return '↩ Nature gallery closed';
  }


  // Terrain gallery
  if (lower.match(/^(?:show |browse |open |pick |choose |select )(?:terrain|landscape|environment)/)) {
    const result = await showGallery('terrain');
    if (result) {
      loadGLBModel(result.file, GLB_MODELS[result.file] || result.file, 0, 0, null, result.path);
      sceneHistory.push('add ' + result.file);
      return '🏔️ Added ' + result.name + ' to the scene!';
    }
    return '↩ Terrain gallery closed';
  }

  // Browse all / asset library
  if (lower.match(/^(?:browse|library|asset library|show assets|browse all|all assets|all models|model library|show library|open library|browse models|show all|pick asset|choose asset|asset menu)/)) {
    const result = await showCategoryPicker();
    if (result && result.file) {
      loadGLBModel(result.file, GLB_MODELS[result.file] || result.file, 0, 0, null, result.path);
      sceneHistory.push('add ' + result.file);
      return '✅ Added ' + result.name + ' to the scene!';
    }
    if (result && typeof result === 'string') {
      // Character was selected
      if (characterController) {
        if (!characterController.characterModels[result]) {
          characterController.characterModels[result] = { file: result, animPrefix: '', procedural: true };
        }
        await characterController.loadCharacter(result);
        selectedCharacterType = result;
      }
      return '✅ Character set to ' + result;
    }
    return '↩ Library closed';
  }

  // Animation gallery
  if (lower.match(/^(?:show |browse |open )?(?:animations?|animate menu|animation menu|add animation|apply animation)/)) {
    // Find last placed or selected object
    const targetObj = objects.length > 0 ? objects[objects.length - 1] : null;
    const targetName = targetObj?.userData?.name || null;
    const result = await showAnimationGallery(targetName);
    if (result && targetObj) {
      const animResult = applyProceduralAnimation(targetObj, result.animId);
      return animResult;
    }
    if (result && !targetObj) return '⚠ No objects in scene to animate. Add something first!';
    return '↩ Animation gallery closed';
  }


  // === CHARACTER GALLERY COMMAND ===
  if (lower.match(/^(?:characters|show characters|character select|character menu|who can i play|choose character|pick character|select character|change character|switch character|player select)/)) {
    const chosen = await showCharacterGallery();
    if (!chosen) return '↩ Character select cancelled';
    if (characterController) {
      if (!characterController.characterModels[chosen]) {
        var lib = CHARACTER_LIBRARY.find(c => c.id === chosen);
        if (lib) characterController.characterModels[chosen] = { file: lib.file, animPrefix: '', procedural: true };
      }
      await characterController.loadCharacter(chosen);
      selectedCharacterType = chosen;
      try { localStorage.setItem('crate_character', chosen); } catch(e) {}
      return '✅ Now playing as ' + chosen + '! Press Play to enter the game.';
    }
    return '✅ Selected ' + chosen;
  }

  // === SET CHARACTER / PLAY AS ===
  const setCharMatch = lower.match(/^(?:set|change|switch|choose|select)\s+(?:character|char|player|hero)\s+(?:to\s+)?(.+)$/);
  const playAsMatch = lower.match(/^play\s+as\s+(.+)$/);
  if ((setCharMatch || playAsMatch) && characterController) {
    const charName = (setCharMatch ? setCharMatch[1] : playAsMatch[1]).trim();
    const validChars = Object.keys(characterController.characterModels);
    if (validChars.includes(charName)) {
      selectedCharacterType = charName;
      try { localStorage.setItem('crate_character', charName); } catch(e) {}
      await characterController.loadCharacter(charName);
      if (playAsMatch) {
        enterPlayMode();
        // Spawn at current camera position (stay in current world)
    {
      const cx = camera.position.x || 0;
      const cz = camera.position.z || 0;
      const _sy = Math.max(0, getTerrainY(cx, cz)) + 2;
      characterController.position.set(cx, _sy, cz);
      if (characterController.collider) characterController.collider.teleport(cx, _sy, cz);
    }
        // Apply player agent profile
    const _agentProfile = PlayerAgent.load();
    PlayerAgent.apply(_agentProfile, characterController);
    characterController.health = characterController.maxHealth;
        characterController.stamina = characterController.maxStamina;
        return '⚔️ Playing as ' + charName + '! WASD to move, mouse to look, ESC to exit.';
      }
      return '✅ Character set to ' + charName + '. Press Play to enter the game!';
    }
    // Try loading ANY model from the library as a custom character
    const modelMap = window._modelMap || {};
    const modelFile = modelMap[charName] || charName;
    // Add it as a custom character dynamically
    characterController.characterModels[charName] = { file: modelFile, animPrefix: '', procedural: true };
    selectedCharacterType = charName;
    try { localStorage.setItem('crate_character', charName); } catch(e) {}
    await characterController.loadCharacter(charName);
    if (playAsMatch) {
      enterPlayMode();
      return '⚔️ Playing as ' + charName + '! WASD to move, mouse to look, ESC to exit.';
    }
    return '✅ Character set to ' + charName + '. Available: ' + validChars.join(', ');
  }

  // === PLAY === (redirects to enterPlayMode)
  // Handled above — enterPlayMode() is the single entry point

  
  // === CAMERA TOGGLE ===
  if ((lower === 'toggle camera' || lower === 'v' || lower === '1st person' || lower === '3rd person' || lower === 'first person' || lower === 'third person') && characterController) {
    if (lower === '1st person' || lower === 'first person') {
      characterController.cameraMode = '1st';
      if (characterController.model) characterController.model.visible = false;
      return '✓ Camera: 1st person';
    }
    if (lower === '3rd person' || lower === 'third person') {
      characterController.cameraMode = '3rd';
      if (characterController.model) characterController.model.visible = true;
      return '✓ Camera: 3rd person';
    }
    return characterController.toggleCameraMode();
  }
  
  // === AI AGENT CUSTOMIZATION ===
  const agentProfile = PlayerAgent.load();
  const agentChanges = PlayerAgent.interpret(cmd, agentProfile);
  if (agentChanges.length > 0) {
    PlayerAgent.save(agentProfile);
    if (characterController) PlayerAgent.apply(agentProfile, characterController);
    // World building disabled in play mode — keep current world as-is
    // if (window._agentBuildWorld) { ... }
    // Handle water preset from AI agent
    if (window._agentWaterPreset) {
      const wp = window._agentWaterPreset; window._agentWaterPreset = null;
      setTimeout(() => parseAndExecute('water ' + wp), 200);
    }
    // Actually equip the weapon if agent set one
    if (agentProfile.weapon && characterController) {
      if (!characterController.model) {
        const charType = selectedCharacterType || 'knight';
        if (!characterController.characterModels[charType]) {
          const lib = CHARACTER_LIBRARY.find(c => c.id === charType);
          if (lib) characterController.characterModels[charType] = { file: lib.file, animPrefix: '', procedural: true };
        }
        await characterController.loadCharacter(charType);
      }
      characterController.equipWeapon(agentProfile.weapon);
    }
    return agentChanges.join('\n');
  }
  
  // === WEAPON EQUIP COMMANDS ===
  const equipMatch = lower.match(/^(?:equip|give me|use|wield|grab|take)\s+(?:a\s+|an\s+)?(sword|axe|dagger|hammer|spear|katana|pistol|rifle|shotgun|smg|sniper|bow)(?:\s+(?:in\s+)?(?:slot\s+)?(\d))?/);
  if (equipMatch && characterController) {
    // Auto-load character model if none loaded
    if (!characterController.model) {
      const charType = selectedCharacterType || 'knight';
      if (!characterController.characterModels[charType]) {
        const lib = CHARACTER_LIBRARY.find(c => c.id === charType);
        if (lib) characterController.characterModels[charType] = { file: lib.file, animPrefix: '', procedural: true };
      }
      await characterController.loadCharacter(charType);
    }
    const weaponId = equipMatch[1];
    const slot = equipMatch[2] ? parseInt(equipMatch[2]) - 1 : -1;
    return characterController.equipWeapon(weaponId, slot);
  }
  
  const unequipMatch = lower.match(/^(?:unequip|drop|remove|holster)\s+(?:weapon|current|my weapon)/);
  if (unequipMatch && characterController) {
    return characterController.unequipWeapon();
  }
  
  const swapMatch = lower.match(/^(?:swap|switch|slot)\s+(\d)/);
  if (swapMatch && characterController) {
    characterController.swapToSlot(parseInt(swapMatch[1]) - 1);
    const w = characterController.weaponSlots[characterController.activeSlot];
    return w ? '🔄 Switched to slot ' + swapMatch[1] + ': ' + (WEAPON_DATABASE[w]?.name || w) : '🔄 Slot ' + swapMatch[1] + ' is empty';
  }
  
  const listWeaponsMatch = lower.match(/^(?:show|list|my)\s+(?:weapons|loadout|slots)/);
  if (listWeaponsMatch && characterController) {
    const slots = characterController.weaponSlots;
    const lines = slots.map((w, i) => {
      const active = i === characterController.activeSlot ? ' ◄' : '';
      const name = w ? (WEAPON_DATABASE[w]?.name || w) : 'empty';
      return '[' + (i + 1) + '] ' + name + active;
    });
    return '🗡️ Weapon Loadout:\n' + lines.join('\n');
  }

    // === AI AGENT — NPC MODIFICATION ===
  const npcModMatch = lower.match(/(?:give|equip|change|set|swap|remove|take)\s+(?:the\s+)?(?:npc|enemy|enemies|npcs|all npc)\s*(?:'s|s)?\s*(?:weapon\s+)?(?:to\s+|with\s+|a\s+)?(sword|axe|hammer|spear|dagger|rifle|pistol|shotgun|bow|staff|nothing|unarmed|fists)?/i)
    || lower.match(/(?:give|equip)\s+(?:a\s+)?(sword|axe|hammer|spear|dagger|rifle|pistol|shotgun|bow|staff)\s+(?:to\s+)?(?:the\s+)?(?:npc|enemy|enemies|npcs|all)/i)
    || lower.match(/(?:remove|take)\s+(?:the\s+)?(?:sword|axe|weapon|gun|rifle)s?\s+(?:from\s+)?(?:the\s+)?(?:npc|enemy|enemies|npcs|all)/i);
  if (npcModMatch && npcController && npcController.npcs.length > 0) {
    const weapon = npcModMatch[1] || null;
    const isRemove = /remove|take|nothing|unarmed|fists/.test(lower);
    
    for (const npc of npcController.npcs) {
      // Remove old weapon
      if (npc.weaponMesh) {
        if (npc.weaponMesh.parent) npc.weaponMesh.parent.remove(npc.weaponMesh);
        npc.weaponMesh = null;
      }
      
      if (!isRemove && weapon) {
        // Create new weapon mesh
        let wm;
        const isRanged = ['rifle','pistol','shotgun','bow'].includes(weapon);
        npc.isRanged = isRanged;
        npc.attackRange = isRanged ? 20 : 2.5;
        npc.weaponType = weapon;
        
        if (weapon === 'sword') {
          const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.6, 0.02), new THREE.MeshStandardMaterial({color:0xaaaacc,metalness:0.8}));
          const hilt = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.04), new THREE.MeshStandardMaterial({color:0x553311}));
          wm = new THREE.Group(); blade.position.y = 0.35; wm.add(blade); wm.add(hilt);
        } else if (weapon === 'rifle' || weapon === 'shotgun') {
          const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5), new THREE.MeshStandardMaterial({color:0x333333}));
          const stock = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 0.25), new THREE.MeshStandardMaterial({color:0x553311}));
          wm = new THREE.Group(); barrel.rotation.x = Math.PI/2; barrel.position.z = -0.3; stock.position.z = 0.05; wm.add(barrel); wm.add(stock);
        } else if (weapon === 'pistol') {
          const body = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.08, 0.12), new THREE.MeshStandardMaterial({color:0x222222}));
          wm = new THREE.Group(); wm.add(body);
        } else if (weapon === 'axe') {
          const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5), new THREE.MeshStandardMaterial({color:0x664422}));
          const head = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.12, 0.03), new THREE.MeshStandardMaterial({color:0x888899,metalness:0.7}));
          wm = new THREE.Group(); handle.position.y = 0.2; head.position.set(0.05, 0.45, 0); wm.add(handle); wm.add(head);
        } else if (weapon === 'spear') {
          const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.9), new THREE.MeshStandardMaterial({color:0x664422}));
          const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 4), new THREE.MeshStandardMaterial({color:0xccccdd,metalness:0.8}));
          wm = new THREE.Group(); shaft.position.y = 0.4; tip.position.y = 0.9; wm.add(shaft); wm.add(tip);
        } else {
          // Generic weapon
          wm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.03), new THREE.MeshStandardMaterial({color:0x888888}));
        }
        
        if (wm) {
          if (npc.bones && npc.bones.rightForearm) {
            wm.position.set(0, -0.15, 0);
            npc.bones.rightForearm.add(wm);
          } else {
            wm.position.set(0.2, 0.5, 0);
            npc.model.add(wm);
          }
          npc.weaponMesh = wm;
        }
      } else {
        npc.isRanged = false;
        npc.attackRange = 2.5;
        npc.weaponType = 'fists';
      }
    }
    
    if (isRemove) return '🗑️ Removed weapons from all NPCs — they fight with fists now';
    return '⚔️ All NPCs now equipped with ' + weapon + '!';
  }

  // === NPC SPAWN ===
  const npcMatch = lower.match(/^(?:spawn|add)\s+(?:npc|villager|citizen|person)\s*(?:at\s+(-?[\d.]+)\s+(-?[\d.]+))?/);
  if (npcMatch && npcController) {
    const nx = parseFloat(npcMatch[1]) || (Math.random()-0.5)*30;
    const nz = parseFloat(npcMatch[2]) || (Math.random()-0.5)*30;
    return npcController.spawnNPC('knight', nx, nz, 'wander');
  }
  
  // === SPAWN MULTIPLE NPCs ===
  const npcsMatch = lower.match(/^(?:spawn|add)\s+(\d+)\s+(?:(hostile|enemy|aggro|friendly)\s+)?npcs?/);
  if (npcsMatch && npcController) {
    const n = Math.min(parseInt(npcsMatch[1]), 30);
    const isHostile = npcsMatch[2] && (npcsMatch[2] === 'hostile' || npcsMatch[2] === 'enemy' || npcsMatch[2] === 'aggro');
    const behavior = isHostile ? 'aggro' : 'wander';
    const promises = [];
    for (let i = 0; i < n; i++) {
      let sx, sz;
      if (isHostile) {
        // Hostile: spawn far away in a spread arc so player has approach time
        const angle = (i / Math.max(n, 1)) * Math.PI * 2 + Math.random() * 0.5;
        const dist = 25 + Math.random() * 20; // 25-45 units away
        sx = Math.cos(angle) * dist;
        sz = Math.sin(angle) * dist;
      } else {
        sx = (Math.random()-0.5)*40;
        sz = (Math.random()-0.5)*40;
      }
      promises.push(npcController.spawnNPC('knight', sx, sz, behavior));
    }
    await Promise.all(promises);
    return isHostile ? '⚔️ Spawned ' + n + ' hostile NPCs! Fight!' : '✓ Spawned ' + n + ' NPCs';
  }
  
  // === SPAWN ENEMIES ===
  const enemyMatch = lower.match(/^(?:spawn|add)\s+(\d+)?\s*(?:enemies|enemy|hostiles?|monsters?|skeletons?|zombies?)/);
  if (enemyMatch && npcController) {
    const n = Math.min(parseInt(enemyMatch[1]) || 5, 30);
    const promises = [];
    const types = ['knight']; // All same model
    // Spread enemies across map in different zones — not grouped
    const zones = [];
    const mapSize = 80;
    for (let i = 0; i < n; i++) {
      // Distribute in a ring pattern, far from each other and far from center
      const angle = (i / n) * Math.PI * 2 + (Math.random() * 0.4);
      const dist = 8 + Math.random() * 17;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      zones.push({ x, z });
    }
    for (let i = 0; i < n; i++) {
      const t = types[i % types.length];
      // Spawn as 'zone_guard' — only aggros when player is close
      const p = npcController.spawnNPC(t, zones[i].x, zones[i].z, 'zone_guard');
      promises.push(p);
    }
    await Promise.all(promises);
    // Auto-create kill quest
    if (questSystem.quests.filter(q => q.type === 'kill' && !q.completed).length === 0) {
      questSystem.addQuest({
        id: 'kill_' + Date.now(),
        title: '⚔️ Clear the Threat',
        description: 'Defeat all ' + n + ' enemies',
        type: 'kill',
        targetCount: n,
        reward: '+500 Score'
      });
    }
    return '⚔️ Spawned ' + n + ' hostile enemies! Fight!';
  }
  
  // === REMOVE CLUTTER (for demo) ===
  if (lower === 'remove clutter') {
    var removed = 0;
    var clutter = ['marketstand', 'bench', 'crate', 'barrel', 'cart', 'well', 'fence', 'cauldron', 'gazebo', 'bonfire', 'stable', 'modularfloor', 'lamp', 'sign', 'table', 'stall'];
    for (var ri = objects.length - 1; ri >= 0; ri--) {
      var rObj = objects[ri];
      if (!rObj.userData || !rObj.userData.name) continue;
      var rn = rObj.userData.name.toLowerCase();
      var isClutter = false;
      for (var ci3 = 0; ci3 < clutter.length; ci3++) {
        if (rn.includes(clutter[ci3])) { isClutter = true; break; }
      }
      if (isClutter) {
        scene.remove(rObj);
        objects.splice(ri, 1);
        removed++;
      }
    }
    return '🧹 Removed ' + removed + ' clutter objects';
  }

  // === EQUIP WEAPON ===
  
  // === INTERIOR BUILDINGS ===
  
  // Modern house command

  const interiorMatch = lower.match(/^(?:add |create |build )?(?:an? )?(interior house|interior shop|interior tavern|walkable house|walkable building|enterable house|enterable building|house with interior|building with interior)(?: (\d+)(?:\s*(?:floors?|stories?))?)?/);
  if (interiorMatch) {
    const type = interiorMatch[1];
    const floorCount = interiorMatch[2] ? parseInt(interiorMatch[2]) : undefined;
    let obj;
    if (type.includes('shop')) {
      obj = createInteriorShop();
    } else if (type.includes('tavern')) {
      obj = createInteriorTavern();
    } else {
      obj = createInteriorHouse({ floors: floorCount || 1 });
    }
    addObj(obj.userData.name || 'Interior House', obj, px, pz);
    return '🏠 Interior ' + (type.includes('shop')?'shop':type.includes('tavern')?'tavern':'house') + ' created! Walk inside through the front door.' + (floorCount > 1 ? ' (' + floorCount + ' floors with stairs)' : '');
  }
  if (lower === 'add 2 story house' || lower === 'add two story house' || lower === 'add 2-story house') {
    const obj = createInteriorHouse({ floors: 2 });
    addObj('Interior House', obj, px, pz);
    return '🏠 2-story interior house created! Walk upstairs via the built-in staircase.';
  }
  if (lower === 'add 3 story house' || lower === 'add three story house') {
    const obj = createInteriorHouse({ floors: 3 });
    addObj('Interior House', obj, px, pz);
    return '🏠 3-story interior house! Stairs connect all floors.';
  }

  // === BUILD WORLD (AI Agent world builder) ===
  const buildWorldMatch = lower.match(/^(?:build|create|generate|make|load) (?:a |an |the )?(hurricane|tropical paradise|arctic storm|dark swamp|war zone|enchanted forest|pirate cove|dragon lair|medieval siege|ocean voyage|town|village|city|big city|small city|suburb|downtown|neighborhood|block|dungeon|arena|battlefield|kingdom|island|forest|camp|farm|ranch|graveyard|pirate|cyberpunk|desert|frozen|jungle|space|mountain|volcano|haunted|western|ruins|zen|swamp|floating|beach|coastal|harbor|port|airport|stadium|park|mall|hospital|school|university|prison|military|base|factory|warehouse|parking lot)(?: world| map| scene)?$/);
  if (buildWorldMatch) {
    // Redirect as 'generate <worldType>' — line 6580 handler now catches multi-word types
    return parseAndExecute('generate ' + buildWorldMatch[1]);
  }

  // === SHOW COMMANDS / HELP PANEL ===
  if (lower === 'help' || lower === 'commands' || lower === 'show commands' || lower === '?' || lower === 'show help') {
    const helpPanel = document.getElementById('commands-panel');
    if (helpPanel) { helpPanel.style.display = helpPanel.style.display === 'none' ? 'flex' : 'none'; return '📋 Commands panel toggled'; }
    // Create commands panel
    const panel = document.createElement('div');
    panel.id = 'commands-panel';
    panel.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:99999;background:rgba(0,0,0,0.92);border:1px solid #444;border-radius:12px;padding:24px;color:#eee;font-family:monospace;font-size:12px;max-height:80vh;overflow-y:auto;width:650px;display:flex;flex-direction:column;gap:12px;backdrop-filter:blur(10px)';
    
    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #333;padding-bottom:10px">
        <span style="font-size:16px;font-weight:bold;color:#fff">⚡ CRATE ENGINE — COMMANDS</span>
        <button onclick="this.parentElement.parentElement.style.display='none'" style="background:none;border:1px solid #555;color:#aaa;cursor:pointer;padding:4px 10px;border-radius:4px;font-family:monospace">✕ Close</button>
      </div>
      
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div>
          <div style="color:#4fc3f7;font-weight:bold;margin-bottom:6px">🌍 WORLD BUILDER</div>
          <div style="color:#aaa;font-size:11px;line-height:1.6">
            build tropical paradise<br>
            build hurricane<br>
            build arctic storm<br>
            build dark swamp<br>
            build enchanted forest<br>
            build pirate cove<br>
            build dragon lair<br>
            build medieval siege<br>
            build ocean voyage<br>
            build war zone<br>
            build kingdom<br>
            build cyberpunk<br>
            generate [any world name]
          </div>
        </div>
        
        <div>
          <div style="color:#4fc3f7;font-weight:bold;margin-bottom:6px">🌊 WATER PRESETS</div>
          <div style="color:#aaa;font-size:11px;line-height:1.6">
            water tropical<br>
            water storm<br>
            water ocean<br>
            water lake<br>
            water arctic<br>
            water swamp<br>
            water river
          </div>
        </div>
        
        <div>
          <div style="color:#4fc3f7;font-weight:bold;margin-bottom:6px">🎮 PLAY MODE</div>
          <div style="color:#aaa;font-size:11px;line-height:1.6">
            WASD — Move<br>
            Space — Jump<br>
            Shift — Sprint<br>
            V — Toggle FPS/TPS<br>
            T — Swap shoulder (TPS)<br>
            Right-click — Aim (ADS)<br>
            Left-click — Shoot/Attack<br>
            1/2/3 — Swap weapons<br>
            E — Interact<br>
            Tab — Inventory<br>
            ESC — Exit play mode
          </div>
        </div>
        
        <div>
          <div style="color:#4fc3f7;font-weight:bold;margin-bottom:6px">🤖 AI AGENT (Player)</div>
          <div style="color:#aaa;font-size:11px;line-height:1.6">
            ninja style<br>
            tank class<br>
            mage mode<br>
            acrobat style<br>
            make me faster<br>
            equip fire sword<br>
            equip ice katana<br>
            higher jump<br>
            souls mode<br>
            show my stats<br>
            glow blue<br>
            reset stats
          </div>
        </div>
        
        <div>
          <div style="color:#4fc3f7;font-weight:bold;margin-bottom:6px">⚔️ WEAPONS</div>
          <div style="color:#aaa;font-size:11px;line-height:1.6">
            equip sword<br>
            equip katana<br>
            equip rifle<br>
            equip shotgun<br>
            equip sniper<br>
            equip bow<br>
            show weapons<br>
            swap 2
          </div>
        </div>
        
        <div>
          <div style="color:#4fc3f7;font-weight:bold;margin-bottom:6px">🛠️ BUILDING</div>
          <div style="color:#aaa;font-size:11px;line-height:1.6">
            add [object] — house, tree, npc...<br>
            interior house / 2 story house<br>
            interior shop / interior tavern<br>
            building with interior<br>
            add [object] at x z<br>
            remove [name]<br>
            clear all<br>
            ocean / add ocean<br>
            add lake / add river<br>
            time morning/sunset/night<br>
            fog on/off<br>
            particles rain/snow/fire
          </div>
        </div>
      </div>
      
      <div style="border-top:1px solid #333;padding-top:8px;color:#666;font-size:10px;text-align:center">
        Type <span style="color:#4fc3f7">help</span> to toggle this panel • Press <span style="color:#4fc3f7">H</span> in play mode
      </div>
    `;
    document.body.appendChild(panel);
    return '📋 Commands panel opened! Type "help" again to close.';
  }

  // === WATER PRESET ===
  const waterPresetMatch = lower.match(/^(?:set |change |use )?water (?:preset |style |type )?(tropical|storm|lake|ocean|swamp|river|arctic|calm|hurricane)/);
  if (waterPresetMatch) {
    const preset = waterPresetMatch[1];
    // Auto-create ocean if none exists
    let hasWater = objects.some(obj => obj.userData.isGerstnerWater);
    if (!hasWater) {
      window._pendingWaterPreset = preset;
      await execSingle('add ocean');
      return '🌊 Created ocean with ' + preset.charAt(0).toUpperCase() + preset.slice(1) + ' preset!';
    }
    for (const obj of objects) {
      if (obj.userData.isGerstnerWater) {
        const p = WATER_PRESETS[preset];
        if (p && obj.material.uniforms) {
          obj.material.uniforms.waveA.value.set(p.waveA[0], p.waveA[1], p.waveA[2], p.waveA[3]);
          obj.material.uniforms.waveB.value.set(p.waveB[0], p.waveB[1], p.waveB[2], p.waveB[3]);
          obj.material.uniforms.waveC.value.set(p.waveC[0], p.waveC[1], p.waveC[2], p.waveC[3]);
          obj.material.uniforms.waterColor.value.copy(p.color);
          obj.material.uniforms.deepColor.value.copy(p.deepColor);
          obj.material.uniforms.foamIntensity.value = p.foamIntensity;
          obj.material.uniforms.specularPower.value = p.specularPower;
          obj.material.uniforms.fresnelPower.value = p.fresnelPower;
          obj.material.uniforms.opacity.value = p.opacity;
          obj.userData.waterPreset = preset;
          setCurrentWaterPreset(preset);
        }
      }
    }
    return '🌊 Water preset: ' + preset.charAt(0).toUpperCase() + preset.slice(1);
  }

  // === HEAL ===
  if ((lower === 'heal' || lower === 'restore health' || lower === 'full health') && characterController) {
    characterController.health = characterController.maxHealth;
    characterController.stamina = characterController.maxStamina;
    return '❤️ Health & stamina fully restored!';

  }
  // === BUILD TOWN/CITY ===
  const townKeywords = /medieval|fantasy|village|town|city|modern|cyberpunk|castle|pirate|port|farm|forest|bandit|camp|desert|fishing|mountain|mining|market|military|fort|harbor|island|space|station|alien|planet|mars|colony|sci.?fi|outpost|zombie|wasteland|apocal|nuclear|frozen|tundra|ice|fortress|winter|arctic|snow|haunted|graveyard|mansion|crypt|catacomb|cathedral|bone.?yard|dungeon|jungle|temple|tropical|dinosaur|dino|prehistoric|underwater|ocean|shipwreck|downtown|suburb|neon|alley|arena|colosseum|gladiator|platformer|obstacle|race|circuit|track|enchanted|dark.?forest|oasis|war.?zone|battlefield|dwarf|dwarven|mine|ranch|cowboy|western|saloon|wild.?west|steampunk|airship|victorian|samurai|shogun|feudal|japan|ninja|aztec|mayan|egyptian|pyramid|pharaoh|roman|greek|olymp|viking|norse|valhalla|moon|lunar|asteroid|saturn|jupiter|nebula|orbit|satellite|space.?dock|star.?base|warp|hyper|galaxy|cosmos|meteor|comet|black.?hole|void|dimension|portal|rift|cyber.?city|hacker|matrix|android|robot|mech|titan|kaiju|monster|beast|dragon.?lair|dragon.?nest|swamp|marsh|bog|bayou|savanna|steppe|tundra|taiga|bamboo|cherry|blossom|zen|garden|pagoda|shrine|torii|volcano|lava|magma|crater|geyser|hot.?spring|crystal|gem|diamond|emerald|ruby|sapphire|amethyst|gold|silver|treasure|vault|bank|heist|prison|jail|asylum|hospital|school|library|museum|theater|circus|carnival|amusement|theme.?park|zoo|aquarium|greenhouse|laboratory|bunker|silo|warehouse|factory|power.?plant|dam|bridge|highway|tunnel|subway|metro|train|airport|spaceport|launch|rocket|shuttle|satellite|orbital|derelict|abandon|ruin|wreck|sunken|lost|forgotten|ancient|cursed|blessed|holy|sacred|divine|infernal|hell|abyss|purgatory|heaven|paradise|cloud|sky|floating|flying/;
  const townMatch = lower.match(/^(?:build|create|generate)\s+(?:a\s+)?(?:(small|medium|large|huge)\s+)?(.+)/);
  if (townMatch && townKeywords.test(townMatch[2]) && townBuilder) {
    const size = townMatch[1] || 'medium';
    const type = townMatch[2];
    // Set biome-appropriate ground, sky, and lighting
    const biomeSettings = {
      space: { ground: 'rock', sky: [0.02,0.02,0.05], fog: [0.02,0.02,0.05] },
      'sci-fi': { ground: 'metal', sky: [0.05,0.05,0.1], fog: [0.05,0.05,0.1] },
      alien: { ground: 'rock', sky: [0.1,0.02,0.05], fog: null },
      zombie: { ground: 'dirt', sky: [0.15,0.12,0.08], fog: [0.12,0.1,0.06] },
      wasteland: { ground: 'dirt', sky: [0.2,0.15,0.1], fog: [0.15,0.12,0.08] },
      apocal: { ground: 'concrete', sky: [0.15,0.12,0.08], fog: [0.12,0.1,0.06] },
      nuclear: { ground: 'sand', sky: [0.2,0.18,0.1], fog: [0.18,0.15,0.08] },
      frozen: { ground: 'snow', sky: [0.6,0.65,0.75], fog: [0.7,0.75,0.8] },
      tundra: { ground: 'snow', sky: [0.5,0.55,0.65], fog: [0.6,0.65,0.7] },
      ice: { ground: 'ice', sky: [0.5,0.6,0.75], fog: [0.6,0.7,0.8] },
      winter: { ground: 'snow', sky: [0.6,0.65,0.7], fog: [0.7,0.75,0.8] },
      arctic: { ground: 'snow', sky: [0.55,0.6,0.7], fog: null },
      snow: { ground: 'snow', sky: [0.6,0.65,0.7], fog: null },
      haunted: { ground: 'dirt', sky: [0.05,0.05,0.07], fog: [0.03,0.03,0.05] },
      graveyard: { ground: 'dirt', sky: [0.04,0.04,0.06], fog: [0.03,0.03,0.05] },
      crypt: { ground: 'stone', sky: [0.03,0.03,0.05], fog: [0.02,0.02,0.04] },
      cathedral: { ground: 'stone', sky: [0.05,0.04,0.06], fog: null },
      dungeon: { ground: 'stone', sky: [0.03,0.02,0.04], fog: [0.02,0.02,0.03] },
      bone: { ground: 'sand', sky: [0.06,0.05,0.04], fog: null },
      jungle: { ground: 'mud', sky: [0.3,0.4,0.25], fog: [0.2,0.3,0.15] },
      tropical: { ground: 'grass', sky: [0.4,0.6,0.8], fog: null },
      dinosaur: { ground: 'grass', sky: [0.35,0.5,0.3], fog: [0.25,0.35,0.2] },
      prehistoric: { ground: 'dirt', sky: [0.3,0.4,0.25], fog: null },
      underwater: { ground: 'sand', sky: [0.05,0.15,0.3], fog: [0.05,0.1,0.25] },
      ocean: { ground: 'sand', sky: [0.1,0.2,0.4], fog: [0.08,0.15,0.3] },
      shipwreck: { ground: 'sand', sky: [0.2,0.3,0.4], fog: null },
      cyberpunk: { ground: 'asphalt', sky: [0.02,0.01,0.05], fog: [0.02,0.01,0.04] },
      neon: { ground: 'asphalt', sky: [0.02,0.01,0.05], fog: [0.01,0.0,0.03] },
      modern: { ground: 'concrete', sky: [0.4,0.5,0.65], fog: null },
      downtown: { ground: 'asphalt', sky: [0.35,0.45,0.6], fog: null },
      desert: { ground: 'sand', sky: [0.6,0.5,0.35], fog: [0.5,0.4,0.3] },
      oasis: { ground: 'sand', sky: [0.5,0.55,0.7], fog: null },
      war: { ground: 'dirt', sky: [0.2,0.18,0.15], fog: [0.15,0.12,0.1] },
      battlefield: { ground: 'mud', sky: [0.2,0.18,0.15], fog: [0.15,0.12,0.1] },
      mine: { ground: 'stone', sky: [0.08,0.06,0.04], fog: [0.05,0.04,0.03] },
      dwarf: { ground: 'stone', sky: [0.1,0.08,0.05], fog: null },
      enchanted: { ground: 'grass', sky: [0.15,0.2,0.25], fog: [0.1,0.15,0.2] },
      dark: { ground: 'dirt', sky: [0.04,0.05,0.04], fog: [0.03,0.04,0.03] },
      pirate: { ground: 'sand', sky: [0.35,0.45,0.6], fog: null },
      castle: { ground: 'grass', sky: [0.3,0.35,0.5], fog: null },
      farm: { ground: 'grass', sky: [0.4,0.55,0.7], fog: null },
      arena: { ground: 'sand', sky: [0.45,0.5,0.6], fog: null },
      platformer: { ground: 'grass', sky: [0.3,0.5,0.8], fog: null },
      race: { ground: 'asphalt', sky: [0.3,0.45,0.65], fog: null },
    };
    
    // Find matching biome
    let biome = null;
    for (const [key, val] of Object.entries(biomeSettings)) {
      if (type.includes(key)) { biome = val; break; }
    }
    if (!biome) biome = { ground: 'grass', sky: [0.3,0.4,0.5], fog: null };
    window._currentBiome = type; if (window._sound) { if (window._sound && window._sound.setMusicMood) window._sound.setMusicMood(window._sound.biomeToMood ? window._sound.biomeToMood(type) : 'peaceful'); }
    
    // Apply biome
    scene.remove(currentGround); currentGroundType = biome.ground; currentGround = createGround(biome.ground); scene.add(currentGround);
    scene.background = new THREE.Color(biome.sky[0], biome.sky[1], biome.sky[2]);
    if (biome.fog) {
      scene.fog = new THREE.FogExp2(new THREE.Color(biome.fog[0], biome.fog[1], biome.fog[2]), 0.015);
    } else {
      scene.fog = null;
    }
    // Auto weather per biome
    if (type.includes('frozen') || type.includes('tundra') || type.includes('ice') || type.includes('winter') || type.includes('arctic') || type.includes('snow')) {
      setWeather('snow');
    } else if (type.includes('haunted') || type.includes('graveyard') || type.includes('zombie') || type.includes('war')) {
      setWeather('rain');
    }
    
    // Auto-expand ground for world builds
    const worldSizes = { small: 500, medium: 800, large: 1200, huge: 1800 };
    const neededSize = worldSizes[size] || 800;
    if (groundSize < neededSize) expandGround(neededSize);
    const results = await townBuilder.buildTown(type, size);
    return results.join('\n');
  }
  
  // === LEVEL/SKILL COMMANDS ===
  if ((lower === 'stats' || lower === 'level' || lower === 'skills' || lower === 'xp') && levelSystem) {
    return '📊 ' + levelSystem.getStats();
  }
  const skillMatch = lower.match(/^(?:upgrade|level up|invest|put point in)\s+(strength|vitality|endurance|agility|luck)/);
  if (skillMatch && levelSystem) {
    return levelSystem.upgradeSkill(skillMatch[1]);
  }
  
  // === CRAFTING COMMANDS ===
  if ((lower === 'craft' || lower === 'recipes' || lower === 'crafting') && craftingSystem) {
    return '🔨 Crafting Recipes:\n' + craftingSystem.listRecipes() + '\n\nMaterials: ' + craftingSystem.getMaterialString();
  }
  const craftMatch = lower.match(/^craft\s+(.+)/);
  if (craftMatch && craftingSystem) {
    return craftingSystem.craft(craftMatch[1]);
  }
  if (lower === 'materials' || lower === 'inventory materials') {
    if (!craftingSystem) return '⚠ Enter play mode first';
    return '🧱 Materials: ' + craftingSystem.getMaterialString();
  }
  
  // === QUEST COMMANDS ===
  if (lower === 'quests' || lower === 'quest log') {
    const active = questSystem.quests.filter(q => !q.completed);
    const done = questSystem.completedQuests.length;
    if (active.length === 0) return '📜 No active quests. Spawn enemies to get one!';
    return '📜 Active quests:\n' + active.map(q => '  ' + q.title + ' (' + q.current + '/' + q.targetCount + ')').join('\n') + '\n✅ Completed: ' + done;
  }
  
  // === TALK TO NPC ===
  if ((lower === 'talk' || lower === 'talk to npc' || lower === 'interact') && npcController) {
    const nearby = npcController.getNearbyNPCs(characterController.position, 5);
    if (nearby.length === 0) return '⚠ No NPCs nearby to talk to';
    const npc = nearby[0];
    const dialogues = {
      'knight': { speaker: '🛡️ Knight', lines: [
        'Halt, traveler! These lands grow more dangerous by the day.',
        'Monsters roam the outskirts. We could use another sword.',
        'Prove your worth — clear the beasts, and I shall reward you.',
      ]},
      'villager': { speaker: '👤 Villager', lines: [
        'Oh thank the gods, an adventurer!',
        'Strange creatures have been spotted near the village.',
        'Please help us... we have gold to spare for brave souls.',
      ]},
      'soldier': { speaker: '⚔️ Soldier', lines: [
        'At ease. You look capable enough.',
        'Intel reports hostiles converging on this position.',
        'Lock and load — they could attack any moment.',
      ]},
    };
    const dlg = dialogues[npc.type] || dialogues['villager'];
    dlg.onEnd = () => {
      if (questSystem.quests.filter(q => !q.completed).length === 0) {
        questSystem.addQuest({
          id: 'npc_quest_' + Date.now(),
          title: '🗡️ ' + dlg.speaker.split(' ')[1] + '\'s Request',
          description: 'Defeat 5 enemies for ' + dlg.speaker,
          type: 'kill',
          targetCount: 5,
          reward: '+500 Score, Weapon upgrade'
        });
      }
    };
    dialogueSystem.start(dlg);
    return '💬 Talking to ' + dlg.speaker + '...';
  }

  // === CHARACTER SPEED ===
  const charSpeedMatch = lower.match(/^(?:set\s+)?(?:character\s+|player\s+)?(walk|run|sprint)\s*speed\s+(\d+\.?\d*)/);
  if (charSpeedMatch && characterController) {
    return characterController.setSpeed(charSpeedMatch[1], parseFloat(charSpeedMatch[2]));
  }
  
  // === ENTER VEHICLE ===
  if ((lower === 'enter vehicle' || lower === 'get in car' || lower === 'enter car') && characterController) {
    const vehicle = objects.find(o => o.userData.name && (o.userData.name.includes('car') || o.userData.name.includes('truck')));
    if (vehicle) return characterController.enterVehicle(vehicle);
    return '⚠ No vehicle nearby';
  }
  
  // === PLAY MODE (fallback — main handler at line ~8276) ===
  // [REMOVED] Duplicate play handler — use enterPlayMode() only
  // === SPAWN CHARACTER ===
  if (lower.startsWith('spawn ') && characterController) {
    const charType = lower.replace('spawn ', '').trim();
    const validTypes = Object.keys(characterController.characterModels);
    const type = validTypes.includes(charType) ? charType : 'woman';
    try {
      await characterController.loadCharacter(type);
      // Auto-enter play mode if not already
      if (!playMode) _activatePlayMode();
      // Switch from camera mode to character mode
      characterController._cameraOnlyMode = false;
      // Spawn at camera look target (where user is looking)
      const spawnPos = controls && controls.target ? controls.target.clone() : new THREE.Vector3(0, 0, 0);
      spawnPos.y = Math.max(0.5, spawnPos.y);
      characterController.position.set(spawnPos.x, spawnPos.y + 1, spawnPos.z);
      if (characterController.collider) characterController.collider.teleport(spawnPos.x, spawnPos.y + 1, spawnPos.z);
      characterController.health = characterController.maxHealth;
      characterController.stamina = characterController.maxStamina;
      // Set up 3rd person camera
      characterController.cameraMode = '3rd';
      characterController.cameraDistance = 8;
      characterController.cameraHeight = 4.0;
      characterController.cameraPitch = 0.15;
      if (characterController.model) characterController.model.visible = true;
      // Disable orbit controls, character controller takes over camera
      try { controls.enabled = false; } catch(e) {}
      // Request pointer lock for mouse look
      const canvas = document.querySelector('canvas');
      if (canvas) {
        const overlay = document.createElement('div');
        overlay.id = 'click-to-play';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.6);cursor:pointer;';
        overlay.innerHTML = '<div style="text-align:center;color:white;font-family:monospace;"><div style="font-size:48px;margin-bottom:16px;">🎮</div><div style="font-size:24px;">Click to Play as ' + type + '</div><div style="font-size:14px;opacity:0.7;margin-top:8px;">WASD move · Shift run · Mouse look · E interact</div></div>';
        overlay.addEventListener('click', () => { overlay.remove(); canvas.requestPointerLock(); });
        document.body.appendChild(overlay);
      }
      showToast('🎮 ' + type + ' spawned! Click to play.');
      return '🎮 ' + type + ' spawned at camera target!';
    } catch(e) {
      return '⚠ Failed to spawn: ' + e.message;
    }
  }
  // === PLAY MODE ===
  if (lower === 'play' || lower === 'play mode' || lower === 'start game' || lower === 'demo' || lower === 'fps' || lower === 'first person' || lower === 'walk') {
    if (characterController) return enterPlayMode();
    return '⚠ Character system not loaded yet';
  }
  if (lower === 'edit' || lower === 'edit mode' || lower === 'stop playing' || lower === 'exit play') {
    return exitPlayMode();
  }
  
  // === ANIMATION CONTROLS ===
  const animMatch = lower.match(/^(?:animate|anim|play anim(?:ation)?)\s+(.+?)(?:\s+(idle|walk|run|attack|die|death|jump|dance|wave|sit|stand|sleep|talk|cast|block|hit|shoot|reload|crouch|climb|swim|fly|open|close|spin|bounce|float|pulse|glow|explode))?$/);
  if (animMatch) {
    const targetName = animMatch[1].trim();
    const clipName = animMatch[2] || null;
    const obj = objects.find(o => o.userData.name && o.userData.name.toLowerCase().includes(targetName));
    if (obj && obj.userData.mixer && obj.userData.clips) {
      if (clipName) {
        const mixer = obj.userData.mixer;
        mixer.stopAllAction();
        const matchClip = obj.userData.clips.find(c => c.name.toLowerCase().includes(clipName));
        if (matchClip) {
          const action = mixer.clipAction(matchClip);
          action.reset().play();
          return '✓ Playing "' + matchClip.name + '" on ' + obj.userData.name;
        }
        return '⚠ No "' + clipName + '" clip. Available: ' + obj.userData.animations.join(', ');
      }
      return '🎬 ' + obj.userData.name + ' animations: ' + obj.userData.animations.join(', ');
    }
    // No embedded animations — apply procedural animation
    if (obj) {
      const animType = clipName || 'spin';
      return applyProceduralAnimation(obj, animType);
    }
    return '⚠ Could not find "' + targetName + '"';
  }
  
  // === STOP ANIMATION ON SPECIFIC OBJECT ===
  const stopAnimMatch = lower.match(/^stop\s+(?:anim(?:ation)?\s+(?:on\s+)?)?(.+)$/);
  if (stopAnimMatch && !lower.startsWith('stop all')) {
    const name = stopAnimMatch[1].trim();
    const obj = objects.find(o => o.userData.name && o.userData.name.toLowerCase().includes(name));
    if (obj) {
      if (obj.userData.mixer) obj.userData.mixer.stopAllAction();
      if (obj.userData._procAnim) { obj.userData._procAnim = null; }
      return '✓ Stopped animation on ' + obj.userData.name;
    }
  }
  
  if (lower === 'pause animations' || lower === 'stop animations' || lower === 'freeze') {
    animationMixers.forEach(m => m.timeScale = 0);
    return '✓ All animations paused';
  }
  if (lower === 'resume animations' || lower === 'unfreeze' || lower === 'play animations') {
    animationMixers.forEach(m => m.timeScale = 1);
    return '✓ All animations resumed';
  }
  
  // === SPEED CONTROL ===
  const speedMatch = lower.match(/^(?:animation )?speed\s+(\d+\.?\d*)/);
  if (speedMatch) {
    const s = parseFloat(speedMatch[1]);
    animationMixers.forEach(m => m.timeScale = s);
    return '✓ Animation speed set to ' + s + 'x';
  }
  
  // === SCRIPTING: when/on triggers ===
  const trigMatch = lower.match(/^(?:when|on|if)\s+(?:player\s+)?(?:touch(?:es)?|hit(?:s)?|near|reach(?:es)?)\s+(\w+)\s*(?:,?\s*(?:then\s+)?(.+))?/);
  if (trigMatch) {
    const target = trigMatch[1];
    const actionStr = trigMatch[2] || 'score +10';
    let action = 'score', value = 10;
    if (/score|point/i.test(actionStr)) {
      const n = actionStr.match(/(\d+)/);
      action = 'score'; value = n ? parseInt(n[1]) : 10;
    } else if (/remove|destroy|delete/i.test(actionStr)) {
      action = 'remove';
    } else if (/explod/i.test(actionStr)) {
      action = 'explode';
    } else if (/teleport/i.test(actionStr)) {
      action = 'teleport';
    } else if (/spawn|summon/i.test(actionStr)) {
      action = 'spawn'; value = actionStr.replace(/^(spawn|summon)\s*/i, '');
    } else if (/heal|restore/i.test(actionStr)) {
      action = 'heal'; value = parseInt(actionStr.match(/(\d+)/) ? actionStr.match(/(\d+)/)[1] : 50);
    } else if (/sound|play sound|sfx/i.test(actionStr)) {
      action = 'sound'; value = actionStr.replace(/^(sound|play sound|sfx)\s*/i, '');
    } else if (/run|exec|do/i.test(actionStr)) {
      action = 'exec'; value = actionStr.replace(/^(run|exec|do)\s*/i, '');
      action = 'teleport';
    } else if (/message|say|show/i.test(actionStr)) {
      action = 'message'; value = actionStr.replace(/^(message|say|show)\s*/i, '');
    }
    return addTrigger('proximity', target, action, value);
  }
  
  // === POPULATE: Add NPCs + traffic to town ===
  if (lower.match(/^(populate|add life|add people|add traffic|add npcs|civilians|pedestrians)/)) {
    if (!npcController) return "⚠ Enter play mode first";
    var npcCount = parseInt((lower.match(/(\d+)/) || [0,6])[1]);
    var types = ["villager","woman","soldier","knight"];
    var placed = 0;
    for (var pi = 0; pi < npcCount; pi++) {
      var t = types[pi % types.length];
      // Spawn NPCs on sidewalks, not on roads
      var sidewalkPositions = [
        [-7, -50], [7, -50], [-7, -30], [7, -30], [-7, -10], [7, -10],
        [-7, 10], [7, 10], [-7, 30], [7, 30], [-7, 50], [7, 50],
        [-7, 70], [7, 70], [-7, 90], [7, 90], [-7, 110], [7, 110],
        [-15, -38], [15, -38], [-15, 42], [15, 42], [-15, 122], [15, 122],
        [-25, 60], [25, 60], [-25, 80], [25, 80], [-25, 100], [25, 100]
      ];
      var sp = sidewalkPositions[pi % sidewalkPositions.length];
      var npx = sp[0] + (Math.random() - 0.5) * 3;
      var npz = sp[1] + (Math.random() - 0.5) * 3;
      npcController.spawnNPC(t, npx, npz, "wander");
      placed++;
    }
    return "🚶 Added " + npcCount + " wandering NPCs! The town feels alive.";
  }

  // === SCORE ===
  if (lower === 'score' || lower === 'show score') {
    return '⭐ Score: ' + gameScore;
  }
  if (lower === 'reset score') {
    gameScore = 0; updateHUD();
    return '✓ Score reset to 0';
  }
  
  // === LIST ANIMATIONS ===
  if (lower === 'list animations' || lower === 'animations' || lower === 'show animations') {
    const animated = objects.filter(o => (o.userData.animations && o.userData.animations.length > 0) || o.userData._procAnim);
    let result = '';
    if (animated.length > 0) {
      result = '🎬 Animated objects:\n' + animated.map(o => {
        const embedded = o.userData.animations ? o.userData.animations.join(', ') : '';
        const proc = o.userData._procAnim ? '[procedural: ' + o.userData._procAnim.type + ']' : '';
        return '  ' + (o.userData.name || 'unnamed') + ': ' + (embedded || proc || 'none');
      }).join('\n');
    }
    result += '\n\n' + listProceduralAnimations();
    return result;
  }
  
  // === DUPLICATE/SCATTER ===
  const scatterMatch = lower.match(/^scatter\s+(\d+)\s+(.+?)(?:\s+around)?$/);
  if (scatterMatch) {
    const n = Math.min(parseInt(scatterMatch[1]), 100);
    let objName = scatterMatch[2].trim();
    // Handle plurals: trees→tree, rocks→rock, etc.
    if (!GLB_MODELS[objName] && objName.endsWith('s')) objName = objName.slice(0, -1);
    if (!GLB_MODELS[objName] && objName.endsWith('ie')) objName = objName.slice(0, -2) + 'y'; // zombies→zombie handled by 's' strip
    const glb = GLB_MODELS[objName];
    if (glb) {
      for (let i = 0; i < n; i++) {
        const sx = (Math.random()-0.5) * 40;
        const sz = (Math.random()-0.5) * 40;
        loadGLBModel(objName + '_scatter_' + i, glb, sx, sz, null);
      }
      return '✓ Scattered ' + n + ' ' + objName + '(s) around the scene';
    }
    return '⚠ Unknown model: ' + objName;
  }
  
  const timeMatch = lower.match(/^(?:time|set time|set|change time to|time of day)\s+(dawn|sunrise|morning|noon|afternoon|sunset|dusk|evening|night|midnight)/);
  // === DAYTIME CONTROL ===
  if (timeMatch && !lower.includes('travel')) {
    const t = timeMatch[1];
    const times = {dawn:[0.8,0.4,0.2,0.3],sunrise:[1,0.6,0.3,0.5],morning:[1,0.9,0.8,1],noon:[1,1,0.98,1.2],afternoon:[1,0.95,0.85,1],sunset:[1,0.5,0.2,0.6],dusk:[0.4,0.3,0.5,0.3],evening:[0.15,0.15,0.3,0.2],night:[0.05,0.05,0.15,0.08],midnight:[0.02,0.02,0.08,0.05]};
    const preset = times[t];
    if (preset) {
      scene.background = new THREE.Color(preset[0], preset[1], preset[2]);
      sunLight.intensity = preset[3] * 3;
      if (t === 'night' || t === 'midnight' || t === 'evening') {
        sunLight.position.set(-20, 5, 0);
      } else if (t === 'dawn' || t === 'sunrise') {
        sunLight.position.set(-40, 10, 0);
      } else if (t === 'sunset' || t === 'dusk') {
        sunLight.position.set(40, 10, 0);
      } else {
        sunLight.position.set(30, 40, 20);
      }
      return '✓ Time set to ' + t;
    }
  }
  
  // Parse position
  let px, pz;
  const atIdx = parts.indexOf('at');
  if (atIdx >= 0) { px = parseFloat(parts[atIdx+1])||0; pz = parseFloat(parts[atIdx+2]||parts[atIdx+3])||0; }
  // Default: spawn near player position (supports multi-platform worlds)
  if (px === undefined && window.characterController && window.characterController.position) {
    const pp = window.characterController.position;
    px = pp.x + (Math.random() - 0.5) * 15;
    pz = pp.z + (Math.random() - 0.5) * 15;
  }
  
  
  // Modern house command
  const modernMatch = lower.match(/^(?:add |create |build )?(?:an? )?(modern house|modern home|modern building|hd house|furnished house|nice house)(?: (\d+)(?:\s*(?:floors?|stories?))?)?/);
  if (modernMatch) {
    const floorCount = modernMatch[2] ? parseInt(modernMatch[2]) : 1;
    const obj = createModernHouse({ floors: floorCount });
    addObj('Modern House', obj, px || 0, pz || 0);
    return '🏠 Modern furnished house created! Walk inside — HD furniture included.' + (floorCount > 1 ? ' (' + floorCount + ' floors)' : '');
  }
  // Skyscraper
  if (lower.match(/^(?:add |create |build )?(?:an? )?(skyscraper|highrise|high.?rise|tower|tall building)/)) {
    const obj = createSkyscraper();
    addObj('Skyscraper', obj, px || 0, pz || 0);
    return '🏙️ Skyscraper created!';
  }
  // Commercial building
  const storeMatch = lower.match(/^(?:add |create |build )?(?:an? )?(salon|barber|grocery|clothing|restaurant|pharmacy|bank|cafe|gym|laundry|store|shop|commercial)/);
  if (storeMatch) {
    const type = (storeMatch[1]==='store'||storeMatch[1]==='shop'||storeMatch[1]==='commercial') ? undefined : storeMatch[1];
    const obj = createCommercialBuilding({ type });
    addObj(obj.userData.name, obj, px || 0, pz || 0);
    return '🏪 ' + obj.userData.name + ' created!';
  }
  // Pitched roof house
  if (lower.match(/^(?:add |create |build )?(?:an? )?(pitched|pitched.?roof|suburban|traditional) house/)) {
    const obj = createPitchedRoofHouse();
    addObj('House', obj, px || 0, pz || 0);
    return '🏡 House with pitched roof created!';
  }
  // Mansion
  if (lower.match(/^(?:add |create |build )?(?:an? )?(mansion)/)) {
    const obj = createMansion();
    addObj('Mansion', obj, px || 0, pz || 0);
    return '🏰 Mansion created!';
  }
  // Duplex
  if (lower.match(/^(?:add |create |build )?(?:an? )?(duplex)/)) {
    const obj = createDuplex();
    addObj('Duplex', obj, px || 0, pz || 0);
    return '🏘️ Duplex created!';
  }
  // Ranch house
  if (lower.match(/^(?:add |create |build )?(?:an? )?(ranch|ranch house)/)) {
    const obj = createRanchHouse();
    addObj('Ranch House', obj, px || 0, pz || 0);
    return '🏡 Ranch house created!';
  }
  // Swimming pool
  if (lower.match(/^(?:add |create |build )?(?:an? )?(swimming ?pool|pool)/)) {
    const obj = createSwimmingPool();
    addObj('Swimming Pool', obj, px || 0, pz || 0);
    obj.userData.registerWaterZone();
    return '🏊 Swimming pool created! Jump in to swim!';
  }

  if (lower.match(/^(?:add |create |build )?(?:an? )?(parking lot|parking|carpark)/)) {
    const obj = createParkingLot();
    addObj('Parking Lot', obj, px || 0, pz || 0);
    return '🅿️ Parking lot created!';
  }
  if (lower.match(/^(?:add |create |build )?(?:an? )?(gas station|petrol station|fuel station)/)) {
    const obj = createGasStation();
    addObj('Gas Station', obj, px || 0, pz || 0);
    return '⛽ Gas station created!';
  }
  if (lower.match(/^(?:add |create |build )?(?:an? )?(bridge)/)) {
    const obj = createBridge();
    addObj('Bridge', obj, px || 0, pz || 0);
    if (window._collisionWorld) window._collisionWorld.needsRebuild = true;
    return '🌉 Bridge created!';
  }

  if (lower.match(/^(?:add |create |build )?(?:an? )?(apartment|apartment building|apartments|flat|flats)/)) {
    const obj = createApartmentBuilding();
    addObj('Apartment', obj, px || 0, pz || 0);
    return '🏢 Apartment building created!';
  }

  if (lower.match(/^(?:add |create |build )?(?:an? )?(supermarket|super market|grocery store|megastore)/)) {
    const obj = createSupermarket();
    addObj('Supermarket', obj, px || 0, pz || 0);
    return '🛒 Supermarket created!';
  }



  if (lower.match(/^(?:add |create |build )?(?:an? )?(bus stop|bus shelter)/)) {
    const obj = createBusStop();
    addObj('Bus Stop', obj, px || 0, pz || 0);
    return '🚏 Bus stop created!';
  }
  if (lower.match(/^(?:add |create |build )?(?:an? )?(dumpster|skip|bin)/)) {
    const obj = createDumpster();
    addObj('Dumpster', obj, px || 0, pz || 0);
    return '🗑️ Dumpster created!';
  }
  if (lower.match(/^(?:add |create |build )?(?:an? )?(trash can|rubbish bin|waste bin)/)) {
    const obj = createTrashCan();
    addObj('Trash Can', obj, px || 0, pz || 0);
    return '🗑️ Trash can created!';
  }


  // Stop sign


  if (lower.match(/^(?:add |create )?(?:an? )?(stop ?sign)/)) {
    const obj = createStopSign();
    addObj('Stop Sign', obj, px || 0, pz || 0);
    return '🛑 Stop sign placed!';
  }
  // Traffic light
  if (lower.match(/^(?:add |create )?(?:an? )?(traffic ?light|stoplight|signal)/)) {
    const obj = createTrafficLight();
    addObj('Traffic Light', obj, px || 0, pz || 0);
    return '🚦 Traffic light placed!';
  }
  // Road
  if (lower.match(/^(?:add |create |build )?(?:an? )?(road|street)/)) {
    const ew = lower.includes(' ew');
    const obj = createRoadSegment({direction: ew ? 'ew' : 'ns'});
    addObj('Road', obj, px || 0, pz || 0);
    return '🛣️ Road segment created!';
  }
  // Intersection
  if (lower.match(/^(?:add |create )?(?:an? )?(intersection|crossroad)/)) {
    const obj = createIntersection();
    addObj('Intersection', obj, px || 0, pz || 0);
    return '🚦 Intersection created!';
  }
  // Glass office building
  if (lower.match(/^(?:add |create |build )?(?:an? )?(glass|office) ?(building|tower)?/)) {
    const obj = createGlassOfficeBuilding();
    addObj('Office Building', obj, px || 0, pz || 0);
    return '🏢 Glass office building created!';
  }
  // Stadium
  if (lower.match(/^(?:add |create |build )?(?:an? )?(stadium|arena|field)/)) {
    const obj = createStadium();
    addObj('Stadium', obj, px || 0, pz || 0);
    return '🏟️ Stadium created!';
  }
  // Fence
  if (lower.match(/^(?:add |create )?(?:an? )?(fence|picket fence)/)) {
    const obj = createFence();
    addObj('Fence', obj, px || 0, pz || 0);
    return '🏗️ Fence placed!';
  }
  // Park
  if (lower.match(/^(?:add |create |build )?(?:an? )?(park)/)) {
    const obj = createPark();
    addObj('Park', obj, px || 0, pz || 0);
    return '🌳 Park created!';
  }



// Parse count
  let count = 1;
  const numMatch = lower.match(/(\d+)\s+(cube|sphere|tree|house|rock|bush|flower|avatar|building|pine)/);
  if (numMatch) count = Math.min(parseInt(numMatch[1]), 50);
  
  // === TELEPORT ===
  if (/^(teleport|tp|goto|go to)\s/.test(lower)) {
    const tpCoord = lower.match(/(-?[\d.]+)\s*,?\s*(-?[\d.]+)/);
    if (tpCoord) {
      const tx = parseFloat(tpCoord[1]), tz = parseFloat(tpCoord[2]);
      camera.position.set(tx, 15, tz + 20);
      camera.lookAt(tx, 0, tz);
      return '✓ Teleported to (' + tx + ', ' + tz + ')';
    }
    const objName = lower.replace(/^(teleport|tp|goto|go to)\s+(to\s+)?/, '').trim();
    if (objName) {
      const target = objects.find(o => o.userData.name && o.userData.name.toLowerCase().includes(objName));
      if (target) {
        const p = target.position;
        camera.position.set(p.x, 15, p.z + 20);
        camera.lookAt(p.x, 0, p.z);
        return '✓ Teleported to ' + target.userData.name;
      }
    }
    return '⚠ Use: teleport X Z or teleport <object>';
  }



  // === NATURAL LANGUAGE: move/color/scale/rotate ===
  // MOVE: "move castle 6 feet right"
  if (/^(move|push|slide|shift)\s/.test(lower) && !lower.includes('camera')) {
    // "move X to X Z" — absolute positioning
    const moveToAbs = lower.match(/^move\s+(?:the\s+)?(\w+)\s+to\s+(-?[\d.]+)\s*,?\s*(-?[\d.]+)/);
    if (moveToAbs) {
      const name = moveToAbs[1];
      const tx = parseFloat(moveToAbs[2]);
      const tz = parseFloat(moveToAbs[3]);
      const target = objects.find(o => o.userData.name && o.userData.name.toLowerCase().includes(name));
      if (target) { target.position.x = tx; target.position.z = tz; return '✓ Moved ' + target.userData.name + ' to (' + tx + ', ' + tz + ')'; }
      return '⚠ No object "' + name + '" found';
    }
    const moveMatch = lower.match(/^(?:move|push|slide|shift)\s+(?:the\s+)?(.+?)\s+(\d+\.?\d*)\s*(?:feet|foot|ft|units?|meters?|m|blocks?)?\s*(left|right|forward|forwards?|back|backward|backwards?|up|down|north|south|east|west)?/i);
    const moveSimple = lower.match(/^(?:move|push|slide|shift)\s+(?:the\s+)?(.+?)\s+(left|right|forward|back|up|down)\s*(\d+\.?\d*)?/i);
    const dirs = {left:[-1,0,0],right:[1,0,0],forward:[0,0,1],forwards:[0,0,1],front:[0,0,1],back:[0,0,-1],backward:[0,0,-1],backwards:[0,0,-1],up:[0,1,0],down:[0,-1,0],north:[0,0,1],south:[0,0,-1],east:[1,0,0],west:[-1,0,0]};
    if (moveMatch) {
      const name = moveMatch[1].trim();
      const dist = parseFloat(moveMatch[2]) || 2;
      const dir = (moveMatch[3] || 'forward').toLowerCase();
      const d = dirs[dir] || [0,0,1];
      const obj = objects.find(o => o.userData.name && o.userData.name.toLowerCase().includes(name));
      if (obj) { obj.position.x += d[0]*dist; obj.position.y += d[1]*dist; obj.position.z += d[2]*dist; return '✓ Moved '+obj.userData.name+' '+dist+' feet '+dir; }
      return '⚠ Could not find "'+name+'" — Objects: '+objects.map(o=>o.userData.name).join(', ');
    }
    if (moveSimple) {
      const name = moveSimple[1].trim();
      const dir = moveSimple[2].toLowerCase();
      const dist = parseFloat(moveSimple[3]) || 3;
      const d = dirs[dir] || [0,0,1];
      const obj = objects.find(o => o.userData.name && o.userData.name.toLowerCase().includes(name));
      if (obj) { obj.position.x += d[0]*dist; obj.position.y += d[1]*dist; obj.position.z += d[2]*dist; return '✓ Moved '+obj.userData.name+' '+dir+' '+dist; }
      return '⚠ Could not find "'+name+'"';
    }
  }
  // COLOR: "turn castle red" / "make it blue" / "paint house green"
  if (/^(turn|paint)\s/.test(lower) || (lower.startsWith('make ') && /red|blue|green|yellow|orange|purple|pink|white|black|brown|gold|silver|cyan|magenta|gray|grey|dark/.test(lower))) {
    const colorMap = {red:0xff2222,blue:0x2266ff,green:0x22aa22,yellow:0xffee00,orange:0xff8800,purple:0x8822cc,pink:0xff66aa,white:0xffffff,black:0x111111,brown:0x774422,gold:0xffcc00,silver:0xaaaaaa,cyan:0x00dddd,magenta:0xdd00dd,gray:0x888888,grey:0x888888,dark:0x222222};
    let foundColor = null, colorName = '';
    for (const [cn, cv] of Object.entries(colorMap)) { if (lower.includes(cn)) { foundColor = cv; colorName = cn; break; } }
    if (foundColor !== null) {
      const clean = lower.replace(/^(turn|make|paint|set|color)\s+/,'').replace(/(the|a|it|to)\s/g,'').replace(colorName,'').trim();
      target = clean ? objects.find(o => o.userData.name && o.userData.name.toLowerCase().includes(clean)) : (selectedObj || objects[objects.length-1]);
      if (target) {
        const setColor = (o) => { if (o.isMesh && o.material) o.material.color.setHex(foundColor); if (o.children) o.children.forEach(setColor); };
        setColor(target);
        return '🎨 '+target.userData.name+' is now '+colorName+'!';
      }
      return '⚠ Could not find object';
    }
  }
  // GROUND: "change ground to snow" / "make ground look like lava"
  if (['ground','floor','terrain','surface'].some(g => lower.includes(g)) && ['change','make','set','turn','switch','to'].some(c => lower.includes(c))) {
    const matMap = {snow:1,ice:1,grass:1,sand:1,dirt:1,mud:1,stone:1,rock:1,lava:1,water:1,wood:1,marble:1,metal:1,concrete:1,asphalt:1,gold:1,obsidian:1,crystal:1};
    for (const mn of Object.keys(matMap)) {
      if (lower.includes(mn)) { scene.remove(currentGround); currentGroundType = mn; currentGround = createGround(mn); scene.add(currentGround); return '✓ Ground changed to '+mn+'!'; }
  }
  }
  // EXPAND GROUND: "expand ground" / "bigger map" / "extend level" / "double floor"
  if (lower.match(/\b(expand|extend|enlarge|bigger|larger|grow|double|widen|stretch)\b/) && lower.match(/\b(ground|floor|map|level|board|terrain|area|space)\b/) && !lower.includes('world') && !lower.includes('platform')) {
    const numMatch = lower.match(/(\d+)/);
    newSize = numMatch ? parseInt(numMatch[1]) : groundSize + 300;
    if (newSize < groundSize) newSize = groundSize + 300;
    expandGround(newSize);
    return '✓ Ground expanded to ' + groundSize + 'x' + groundSize + '! More room to build.';
  }
  // TERRAIN: "terrain mountains" / "add mountains" / "hills" / "create terrain" etc.
  if (lower.match(/^(terrain|generate terrain|create terrain|add terrain|make terrain|build terrain)\s/i) ||
      lower.match(/^(mountains?|hills?|valley|canyon|volcano|crater|dunes?|island|plateau|cliffs?|desert terrain|rolling hills)$/i) ||
      lower.match(/^add\s+(mountains?|hills?|terrain)/i) ||
      lower.match(/^(raise|lower|flatten)\s*(terrain)?$/i)) {
    var cmd = lower.replace(/^(terrain|generate|create|add|make|build)\s+(terrain\s+)?/i, '').trim();
    if (!cmd || cmd === 'terrain') cmd = 'mountains';
    // Simple raise/lower/flatten still work on existing ground
    if (cmd === 'raise' || cmd === 'lower' || cmd === 'flatten') {
      var pos = currentGround.geometry.attributes.position;
      for (var i = 0; i < pos.count; i++) {
        if (cmd === 'raise') pos.array[i * 3 + 1] += 0.3;
        else if (cmd === 'lower') pos.array[i * 3 + 1] -= 0.3;
        else pos.array[i * 3 + 1] = 0;
      }
      pos.needsUpdate = true;
      currentGround.geometry.computeVertexNormals();
      return "✓ Terrain " + cmd + "d!";
    }
    // Map aliases
    if (cmd === 'rolling' || cmd === 'rolling hills') cmd = 'hills';
    if (cmd === 'desert terrain' || cmd === 'desert') cmd = 'dunes';
    if (cmd === 'cliff') cmd = 'cliffs';
    createTerrain(cmd);

  // Ground type change
  const _groundMatch = lower.match(/^ground\s+(grass|dirt|sand|snow|gravel|stone|mud|lava|water|wood|marble|metal|concrete|asphalt|gold|obsidian|crystal|ice|rock)$/);
  if (_groundMatch) {
    const gType = _groundMatch[1];
    if (currentGround) { scene.remove(currentGround); currentGround.geometry.dispose(); currentGround.material.dispose(); }
    currentGround = createGround(gType);
    currentGroundType = gType; setTimeout(() => applyGroundTexture(currentGround, gType), 100);
    scene.add(currentGround);
    return addToLog('✓ Ground: ' + gType);
  }
    return "✓ Generated " + cmd + " terrain!";
  }
  // SCALE: "make castle bigger" / "scale tree 3x"
  if (['bigger','smaller','larger','tiny','huge','giant','massive'].some(s => lower.includes(s)) || /^(scale|resize)\s/.test(lower)) {
    let factor = 1;
    if (lower.includes('bigger')||lower.includes('larger')) factor = 1.5;
  else if (lower.includes('smaller')) factor = 0.67;
    else if (lower.includes('tiny')) factor = 0.3;
    else if (lower.includes('huge')||lower.includes('giant')||lower.includes('massive')) factor = 2.5;
    else { const m = lower.match(/(\d+\.?\d*)\s*x/); if (m) factor = parseFloat(m[1]); }
    const clean = lower.replace(/^(scale|resize|make)\s+/,'').replace(/\b(the|a|it|to|bigger|smaller|larger|tiny|huge|giant|massive)\b\s?/g,'').replace(/\d+\.?\d*\s*x?/g,'').trim();
    const target = clean ? objects.find(o => o.userData.name && o.userData.name.toLowerCase().includes(clean)) : (selectedObj || objects[objects.length-1]);
    if (target) { target.scale.multiplyScalar(factor); return '📐 '+target.userData.name+' scaled '+factor+'x!'; }
    return '⚠ No object found to resize' + (clean ? ' matching "' + clean + '"' : '');
  }
  // ROTATE: "rotate castle 90 degrees"
  if (/^(rotate|spin|flip)\s/.test(lower)) {
    const degMatch = lower.match(/(\d+)/);
    const deg = degMatch ? parseFloat(degMatch[1]) : 90;
    const clean = lower.replace(/^(rotate|spin|flip)\s+/,'').replace(/(\bthe\b|\ba\b|\bby\b|\bdegrees?\b|\bdeg\b)\s?/g,'').replace(/\d+/g,'').trim();
    const target = clean ? objects.find(o => o.userData.name && o.userData.name.toLowerCase().includes(clean)) : (selectedObj || objects[objects.length-1]);
    if (target) { target.rotation.y += deg * Math.PI / 180; return '🔄 '+target.userData.name+' rotated '+deg+'°!'; }
    return '⚠ No object found to rotate' + (clean ? ' matching "' + clean + '"' : '');
  }

  // [REMOVED — handled by interpreter]
  // === END GLB-FIRST ===

    if (lower.includes('cube') && !/^(remove|delete|color|paint|recolor|tint|resize|scale|rotate|spin)\b/.test(lower)) { for(let i=0;i<count;i++) addObj('Cube', createCube(nextColor()), px, pz, count>1); return `✓ Added ${count} Cube${count>1?'s':''}`;  }
  if (lower.includes('sphere') && !/^(remove|delete|color|paint|recolor|tint|resize|scale|rotate|spin)\b/.test(lower)) { for(let i=0;i<count;i++) addObj('Sphere', createSphere(nextColor()), px, pz, count>1); return `✓ Added ${count} Sphere${count>1?'s':''}`;  }
  if (lower.includes('cylinder') && !/^(remove|delete|color|paint|recolor|tint|resize|scale|rotate|spin)\b/.test(lower)) { for(let i=0;i<count;i++) addObj('Cylinder', createCylinder(nextColor()), px, pz, count>1); return `✓ Added Cylinder`;  }
  // [REMOVED — handled by interpreter]



  // === SAVE / LOAD text commands ===
  if (lower === 'save' || lower.startsWith('save ')) {
    const saveName = cmd.substring(5).trim() || ('Scene ' + new Date().toLocaleString());
    const data = serializeScene();
    if (!data) return '⚠ Nothing to save';
    const saves = JSON.parse(localStorage.getItem('crate-engine-saves') || '[]');
    saves.push({ name: saveName, data: data, date: Date.now() });
    localStorage.setItem('crate-engine-saves', JSON.stringify(saves));
    return '💾 Scene saved as "' + saveName + '"';
  }
  if (lower === 'load' || lower.startsWith('load ')) {
    const saves = JSON.parse(localStorage.getItem('crate-engine-saves') || '[]');
    if (!saves.length) return '⚠ No saved scenes';
    const target = cmd.substring(4).trim().toLowerCase();
    const save = target ? saves.find(s => s.name.toLowerCase().includes(target)) : saves[saves.length - 1];
    if (!save) return '⚠ No save found matching "' + target + '"';
    deserializeScene(save.data);
    return '📂 Loaded "' + save.name + '"';
  }
  if (lower === 'saves' || lower === 'list saves') {
    const saves = JSON.parse(localStorage.getItem('crate-engine-saves') || '[]');
    if (!saves.length) return '⚠ No saved scenes';
    return '💾 Saves: ' + saves.map((s,i) => s.name).join(', ');
  }

  
  // === ADD STAIRS ===
  if (lower.match(/^add\s+(stairs|staircase|ramp)(?:\s+at\s+(-?[\d.]+)\s+(-?[\d.]+))?$/)) {
    const sm = lower.match(/^add\s+(stairs|staircase|ramp)(?:\s+at\s+(-?[\d.]+)\s+(-?[\d.]+))?$/);
    const isRamp = sm[1] === 'ramp';
    const sx = sm[2] ? parseFloat(sm[2]) : 0;
    const sz = sm[3] ? parseFloat(sm[3]) : 0;
    
    const group = new THREE.Group();
    const stepMat = new THREE.MeshStandardMaterial({ color: 0x8B7355, roughness: 0.8 });
    
    if (isRamp) {
      // Simple ramp
      const rampGeo = new THREE.BoxGeometry(2, 0.15, 6);
      const ramp = new THREE.Mesh(rampGeo, stepMat);
      ramp.rotation.x = -Math.PI / 8; // ~22 degree slope
      ramp.position.set(0, 1.5, 0);
      ramp.castShadow = true; ramp.receiveShadow = true;
      group.add(ramp);
    } else {
      // Staircase — 15 steps, each 0.2m high, 0.3m deep, 1.5m wide
      const numSteps = 15;
      const stepH = 0.2, stepD = 0.3, stepW = 1.5;
      for (let i = 0; i < numSteps; i++) {
        const stepGeo = new THREE.BoxGeometry(stepW, stepH, stepD);
        const step = new THREE.Mesh(stepGeo, stepMat);
        step.position.set(0, i * stepH + stepH / 2, i * stepD);
        step.castShadow = true; step.receiveShadow = true;
        group.add(step);
      }
      // Side rails
      const railMat = new THREE.MeshStandardMaterial({ color: 0x654321, roughness: 0.7 });
      for (const side of [-1, 1]) {
        const railGeo = new THREE.BoxGeometry(0.05, 1, numSteps * stepD);
        const rail = new THREE.Mesh(railGeo, railMat);
        rail.position.set(side * (stepW / 2 + 0.05), numSteps * stepH / 2 + 0.5, numSteps * stepD / 2);
        rail.castShadow = true;
        group.add(rail);
      }
    }
    
    const ty = getTerrainY(sx, sz);
    group.position.set(sx, ty, sz);
    group.userData.name = isRamp ? 'ramp' : 'stairs';
    group.userData.isSolid = true;
    group.userData.isGLB = false;
    scene.add(group);
    objects.push(group);
    if (window._addToCollision) window._addToCollision(group);
    return '🪜 Added ' + (isRamp ? 'ramp' : 'stairs') + ' at ' + sx + ', ' + sz;
  }

  // === GENERIC ADD <THING> HANDLER ===
  // Catch-all for "add <name> [at X Z]" using GLB_MODELS lookup + fuzzy search
  {
    
  // === TREE VARIETY SYSTEM ===
  // When adding 'tree', randomly pick from best available trees for visual variety
  const TREE_VARIETIES = [
    'nature_pack_commontree_1', 'nature_pack_commontree_2',
    'nature_pack_commontree_autumn_1', 'nature_pack_commontree_autumn_2',
    'nature_pack_birchtree_1', 'nature_pack_birchtree_2', 'nature_pack_birchtree_3', 'nature_pack_birchtree_4',
    'nature_pack_pinetree_1', 'nature_pack_pinetree_2', 'nature_pack_pinetree_3',
    'nature_pack_willow_1', 'nature_pack_willow_2',
    'cherry_tree_00', 'cherry_tree_01', 'cherry_tree_02', 'cherry_tree_03',
  ];
  const PINE_VARIETIES = [
    'nature_pack_pinetree_1', 'nature_pack_pinetree_2', 'nature_pack_pinetree_3',
    'nature_pack_pinetree_snow_1', 'nature_pack_pinetree_snow_2', 'nature_pack_pinetree_snow_3',
  ];
  const PALM_VARIETIES = [
    'crops_pack_palmtree_1', 'crops_pack_palmtree_2', 'crops_pack_palmtree_3', 'crops_pack_palmtree_4',
  ];
  
  const treeAddMatch = lower.match(/^(?:add|place|put|create)\s+(?:a |an |the )?(?:(\d+)\s+)?(?:(tree|pine|palm|birch|willow|cherry)s?)(?:\s+at\s+(-?[\d.,]+)\s*,?\s*(-?[\d.,]+))?$/);
  if (treeAddMatch) {
    const count = treeAddMatch[1] ? Math.min(parseInt(treeAddMatch[1]), 50) : 1;
    const treeType = treeAddMatch[2];
    const bx = treeAddMatch[3] !== undefined ? parseFloat(treeAddMatch[3]) : null;
    const bz = treeAddMatch[4] !== undefined ? parseFloat(treeAddMatch[4]) : null;
    
    let pool = TREE_VARIETIES;
    if (treeType === 'pine') pool = PINE_VARIETIES;
    else if (treeType === 'palm') pool = PALM_VARIETIES;
    else if (treeType === 'birch') pool = TREE_VARIETIES.filter(t => t.includes('birch'));
    else if (treeType === 'willow') pool = TREE_VARIETIES.filter(t => t.includes('willow'));
    else if (treeType === 'cherry') pool = TREE_VARIETIES.filter(t => t.includes('cherry'));
    
    for (let i = 0; i < count; i++) {
      const pick = pool[Math.floor(Math.random() * pool.length)];
      const tx = bx !== null ? bx + (count > 1 ? (Math.random()-0.5)*30 : 0) : (Math.random()-0.5) * 40;
      const tz = bz !== null ? bz + (count > 1 ? (Math.random()-0.5)*30 : 0) : (Math.random()-0.5) * 40;
      loadGLBModel('tree_' + i, pick, tx, tz);
    }
    return '🌳 Added ' + count + ' ' + treeType + (count > 1 ? ' trees' : ' tree') + ' (mixed varieties)';
  }

  const addGenMatch = lower.match(/^(?:add|place|put|create|spawn)\s+(.+?)(?:\s+at\s+(-?[\d.,]+)\s*,?\s*(-?[\d.,]+)(?:\s*,?\s*(-?[\d.,]+))?)?(?:\s+scale\s+(-?[\d.,]+))?(?:\s+ry\s+(-?[\d.,]+))?$/);
    if (addGenMatch) {
      const rawInput = addGenMatch[1].trim();
      const rawName = rawInput.replace(/\s+/g, '_');
      // Support both "add X at X Z" (2 coords) and "add X at X Y Z" (3 coords)
      let ax, ay = 0, az;
      if (addGenMatch[4] !== undefined) {
        // 3 coords: X Y Z
        ax = parseFloat(addGenMatch[2]);
        ay = parseFloat(addGenMatch[3]);
        az = parseFloat(addGenMatch[4]);
      } else if (addGenMatch[2] !== undefined) {
        // 2 coords: X Z
        ax = parseFloat(addGenMatch[2]);
        az = parseFloat(addGenMatch[3] || '0');
      } else {
        ax = (Math.random() - 0.5) * 20;
        az = (Math.random() - 0.5) * 20;
      }
      const scaleOverride = addGenMatch[5] ? parseFloat(addGenMatch[5]) : undefined;
      const ryOverride = addGenMatch[6] ? parseFloat(addGenMatch[6]) : undefined;

      // 1. Try GLB_MODELS alias map (exact match)
      const glb = GLB_MODELS[rawName] || GLB_MODELS[rawName.replace(/_/g, '-')] || GLB_MODELS[rawInput] || null;

      // 2. Try window._modelMap
      const modelMap = window._modelMap || {};
      const fromMap = modelMap[rawName] || modelMap[rawInput] || null;

      // 3. If no direct match, use searchModels fuzzy search
      let finalGlb = glb || fromMap || null;
      let displayName = rawInput;

      if (!finalGlb) {
        // Try fuzzy search from model catalog
        const searchResults = typeof searchModels === 'function' ? searchModels(rawInput, 5) : [];
        if (searchResults.length > 0) {
          // Pick best match — prefer name containing the search term
          const best = searchResults[0];
          finalGlb = best.path || best.name;
          displayName = best.name.replace(/_/g, ' ');
          console.log('[ADD] Fuzzy matched "' + rawInput + '" → "' + finalGlb + '" (score: ' + best.score + ')');
        }
      }

      // 4. If still nothing, try the raw name as a direct model path
      if (!finalGlb) {
        finalGlb = rawName;
      }

      loadGLBModel(displayName, finalGlb, ax, az, scaleOverride);
      // Set Y position after load if not 0
      if (ay !== 0) {
        setTimeout(() => {
          const obj = objects[objects.length - 1];
          if (obj) obj.position.y = ay;
        }, 2000);
      }
      // Set rotation if specified
      if (ryOverride !== undefined) {
        setTimeout(() => {
          const obj = objects[objects.length - 1];
          if (obj) obj.rotation.y = ryOverride;
        }, 2000);
      }
      return '✅ Adding ' + displayName + '...';
    }
  }

  return '⚠ Try: "add cube", "build a castle with trees and rain", or "help"';
}

function addObj(name, mesh, x, z, scatter) {
  if (scatter || (x === undefined && z === undefined)) {
    mesh.position.x = (x !== undefined ? x : 0) + (scatter ? (Math.random()-0.5)*20 : (Math.random()-0.5)*6);
    mesh.position.z = (z !== undefined ? z : 0) + (scatter ? (Math.random()-0.5)*20 : (Math.random()-0.5)*6);
  } else {
    mesh.position.x = x || 0;
    mesh.position.z = z || 0;
  }
  mesh.userData.name = name;
  // Auto-position on terrain if present — skip water objects
  if (terrainMesh && !mesh.userData.isWater) {
    const rc = new THREE.Raycaster(new THREE.Vector3(mesh.position.x, 200, mesh.position.z), new THREE.Vector3(0, -1, 0));
    const hits = rc.intersectObject(terrainMesh);
    if (hits.length > 0) {
      const terrainY = hits[0].point.y;
      // Get bottom of object's bounding box
      const bbox = new THREE.Box3().setFromObject(mesh);
      const bottomY = bbox.min.y - mesh.position.y;
      mesh.position.y = terrainY - bottomY;
      
      // If object would be below water level, move to island center (higher ground)
      const waterLevel = -0.3;
      if (terrainY < waterLevel + 0.5) {
        // Find higher ground — try moving toward center (0,0)
        const dx = -mesh.position.x * 0.6;
        const dz = -mesh.position.z * 0.6;
        mesh.position.x += dx;
        mesh.position.z += dz;
        // Re-raycast at new position
        const rc2 = new THREE.Raycaster(new THREE.Vector3(mesh.position.x, 200, mesh.position.z), new THREE.Vector3(0, -1, 0));
        const hits2 = rc2.intersectObject(terrainMesh);
        if (hits2.length > 0) {
          mesh.position.y = hits2[0].point.y - bottomY;
        }
      }
    }
  }
  scene.add(mesh);
  objects.push(mesh);
  
  // Add to collision octree if it's a solid object (interior house, building, platform)
  if (mesh.userData.isInterior || mesh.userData.isSolid) {
    if (window._addToCollision) window._addToCollision(mesh);
  }
}

function setWeather(type) {
  if (rainParticles) { scene.remove(rainParticles); rainParticles=null; }
  clearRainPuddles();
  if (snowParticles) { scene.remove(snowParticles); snowParticles=null; }
  weatherSystem = type;
  if (type==='rain') { rainParticles=createRain(); scene.add(rainParticles); createRainPuddles(20); }
  if (type==='snow') { snowParticles=createSnow(); scene.add(snowParticles); }
  if (type==='storm') { rainParticles=createRain(); scene.add(rainParticles); createRainPuddles(30); scene.fog = new THREE.FogExp2(0x222233, 0.008); setLightningTimer(2); }
}

// === UI ===
const log = document.getElementById('output-log');


function showToast(msg, duration) {
  duration = duration || 3000;
  const toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;bottom:50px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.85);color:#4ade80;padding:10px 20px;border-radius:8px;font-family:monospace;font-size:0.8rem;z-index:10000;border:1px solid #333;backdrop-filter:blur(5px);transition:opacity 0.3s;';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, duration);
}

function addToLog(msg) { logOutput("ok", msg); return msg; }
function logOutput(type, msg) {
  if (!log) return;
  log.style.display = 'block';
  var el = document.createElement('div');
  var prefix = type === 'ok' ? '✓ ' : type === 'warn' ? '⚠ ' : type === 'info' ? 'ℹ ' : '❯ ';
  var color = type === 'ok' ? '#4ade80' : type === 'warn' ? '#f59e0b' : type === 'info' ? '#60a5fa' : '#888';
  el.style.cssText = 'color:' + color + ';padding:2px 0;font-size:0.8rem';
  el.textContent = msg;
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
  // Auto-hide log after 4s
  clearTimeout(window._logHideTimer);
  window._logHideTimer = setTimeout(() => { log.style.display = "none"; }, 4000);
  while (log.children.length > 40) log.removeChild(log.firstChild);
}
const input = document.getElementById('prompt-input');

// === VOICE COMMAND SYSTEM ===
const voiceBtn = document.createElement('button');
voiceBtn.id = 'voice-btn';
voiceBtn.innerHTML = '🎤';
voiceBtn.title = 'Voice Commands (click to start/stop)';
voiceBtn.style.cssText = 'position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:2px solid #555;color:#888;font-size:20px;width:38px;height:38px;border-radius:50%;cursor:pointer;transition:all 0.3s;z-index:100;display:flex;align-items:center;justify-content:center;';
input.parentElement.style.position = 'relative';
input.parentElement.appendChild(voiceBtn);
input.style.paddingRight = '50px';

// Voice transcript overlay
const voiceOverlay = document.createElement('div');
voiceOverlay.id = 'voice-overlay';
voiceOverlay.style.cssText = 'display:none;position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.9);border:2px solid #7c5cff;border-radius:16px;padding:16px 24px;color:#fff;font-size:16px;z-index:10000;max-width:500px;text-align:center;backdrop-filter:blur(10px);';
document.body.appendChild(voiceOverlay);

const vcStats = getStats();
console.log(`[Voice] ${vcStats.totalPhrases} phrases ready across ${vcStats.totalIntents} intents`);

const voiceReady = initVoice(
  // onCommand
  async (action, transcript, intentId) => {
    console.log(`[Voice] "${transcript}" → ${action} (${intentId})`);
    voiceOverlay.innerHTML = `<div style="color:#4ade80;font-size:12px;margin-bottom:4px">✓ Recognized</div><div>"${transcript}"</div><div style="color:#7c5cff;font-size:13px;margin-top:6px">→ ${action}</div>`;
    setTimeout(() => { voiceOverlay.style.display = 'none'; }, 2000);
    
    // Execute through the engine
    if (intentId === 'godmode_raw') {
      // Pass raw to the normal command parser
      input.value = transcript;
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    } else {
      input.value = action;
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    }
  },
  // onTranscript
  (text, isFinal) => {
    if (!isFinal) {
      voiceOverlay.style.display = 'block';
      voiceOverlay.innerHTML = `<div style="color:#888;font-size:12px;margin-bottom:4px">🎤 Listening...</div><div style="color:#aaa;font-style:italic">${text}</div>`;
    }
  }
);

voiceBtn.addEventListener('click', () => {
  if (!voiceReady) { alert('Voice recognition not supported in this browser. Try Chrome!'); return; }
  if (isListening()) {
    stopListening();
    voiceBtn.style.borderColor = '#555';
    voiceBtn.style.color = '#888';
    voiceBtn.style.boxShadow = 'none';
    voiceBtn.innerHTML = '🎤';
    voiceOverlay.style.display = 'none';
  } else {
    startListening();
    voiceBtn.style.borderColor = '#ff3333';
    voiceBtn.style.color = '#ff3333';
    voiceBtn.style.boxShadow = '0 0 12px rgba(255,51,51,0.4)';
    voiceBtn.innerHTML = '🔴';
    voiceOverlay.style.display = 'block';
    voiceOverlay.innerHTML = '<div style="color:#ff5555">🎤 Listening... speak a command</div>';
  }
});
// === END VOICE SYSTEM ===

input.addEventListener("focus", function() { if (playMode) { this.blur(); } });
input.addEventListener("keydown", function(e) { if (playMode && e.key !== "Escape") { e.preventDefault(); this.blur(); } });
const status = document.getElementById('engine-status');

input.addEventListener('keydown', async (e) => {
  if (e.key !== 'Enter') return;
  const cmd = input.value.trim();
  if (!cmd) return;
  log.style.display = 'block';
  const cmdEl = document.createElement('div');
  cmdEl.className = 'entry cmd';
  cmdEl.textContent = '❯ ' + cmd;
  log.appendChild(cmdEl);
  
  let response = '';
  try {
    response = await parseAndExecute(cmd);
    const text = (response || '').toString();
    text.split('\n').forEach(line => {
      if (!line) return;
      const r = document.createElement('div');
      r.className = 'entry ' + (line.startsWith('✓')?'ok':line.startsWith('⚠')?'err':'info');
      r.textContent = line;
      log.appendChild(r);
    });
  } catch(err) {
    const r = document.createElement('div');
    r.className = 'entry err';
    r.textContent = '⚠ Error: ' + err.message;
    log.appendChild(r);
    console.error('Engine error:', err);
  }
  log.scrollTop = log.scrollHeight;
  // Auto-hide log after 4s
  clearTimeout(window._logHideTimer);
  window._logHideTimer = setTimeout(() => { log.style.display = "none"; }, 4000);
  while (log.children.length > 40) log.removeChild(log.firstChild);
  input.value = '';
});

// Fullscreen
window.toggleFullscreen = function() {
  const vw = document.querySelector('.viewport-wrapper');
  const isFS = vw.classList.contains('fullscreen');
  if (!isFS) {
    vw.classList.add('fullscreen');
    // Use native fullscreen API for true fullscreen
    if (vw.requestFullscreen) vw.requestFullscreen().catch(()=>{});
    else if (vw.webkitRequestFullscreen) vw.webkitRequestFullscreen();
  } else {
    vw.classList.remove('fullscreen');
    if (document.exitFullscreen) document.exitFullscreen().catch(()=>{});
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
  }
  const btn = document.getElementById('expand-btn');
  btn.textContent = !isFS ? '✕ Exit' : '⛶ Expand';
  // Force resize after CSS settles
  function doResize() {
    const w = !isFS ? window.innerWidth : canvas.parentElement.clientWidth;
    const h = !isFS ? window.innerHeight - 36 : canvas.parentElement.clientHeight;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }
  setTimeout(doResize, 50);
  setTimeout(doResize, 200);
  setTimeout(doResize, 500);
};

// Sync on native fullscreen change
document.addEventListener('fullscreenchange', () => {
  const vw = document.querySelector('.viewport-wrapper');
  const btn = document.getElementById('expand-btn');
  if (!document.fullscreenElement) {
    vw.classList.remove('fullscreen');
    btn.textContent = '⛶ Expand';
    camera.aspect = canvas.clientWidth / canvas.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
  }
});

// ESC to exit fullscreen
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const vw = document.querySelector('.viewport-wrapper');
    if (vw.classList.contains('fullscreen')) window.toggleFullscreen();
  }
});

// Click handled by pointer events above

// === CLICK TO SELECT + DRAG ===
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let selectedObj = null;
let isDragging = false;
let dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let dragOffset = new THREE.Vector3();

function highlightSelected(obj) {
  updateInspector(obj);
  objects.forEach(o => {
    if (o.traverse) o.traverse(c => { if (c.isMesh && c.userData._origEmissive !== undefined && c.material && c.material.emissive) { c.material.emissive.setHex(c.userData._origEmissive); } });
  });
  if (obj) {
    const fn = (c) => {
      if (c.isMesh && c.material) {
        if (c.userData._origEmissive === undefined && c.material.emissive) c.userData._origEmissive = c.material.emissive.getHex();
        if (c.material.emissive) c.material.emissive.setHex(0x332200);
      }
    };
    if (obj.traverse) obj.traverse(fn); else fn(obj);
  }
}

canvas.addEventListener('pointerdown', (e) => {
  if (playMode) return; // Don't select objects in play mode
  if (e.button !== 0) return;
  const rect = canvas.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(objects, true);
  if (hits.length > 0) {
    let hit = hits[0].object;
    while (hit.parent && !objects.includes(hit)) hit = hit.parent;
    if (objects.includes(hit)) {
      selectedObj = hit;
      highlightSelected(selectedObj);
      isDragging = true;
      controls.enabled = false;
      dragPlane.constant = -hit.position.y;
      const inter = new THREE.Vector3();
      raycaster.ray.intersectPlane(dragPlane, inter);
      dragOffset.copy(hit.position).sub(inter);
    }
  } else {
    selectedObj = null;
    highlightSelected(null);
  }
});

canvas.addEventListener('pointermove', (e) => {
  if (!isDragging || !selectedObj) return;
  const rect = canvas.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const inter = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(dragPlane, inter)) {
    selectedObj.position.x = inter.x + dragOffset.x;
    selectedObj.position.z = inter.z + dragOffset.z;
  }
});

canvas.addEventListener('pointerup', () => {
  isDragging = false;
  controls.enabled = true;
});



// Fix stuck WASM loading text
setTimeout(() => {
  const wasmEl = document.querySelector('[data-wasm-status]') || 
    [...document.querySelectorAll('*')].find(el => el.textContent === 'WASM: loading...' && el.children.length === 0);
  if (wasmEl) wasmEl.textContent = '✓ Ready';
}, 5000);

// === FAB GALLERY ===
function showFabGallery() {
  const aliases = window._fabAliases || {};
  const names = Object.keys(aliases);
  
  // Remove existing
  const existing = document.getElementById('fab-gallery-modal');
  if (existing) { existing.remove(); return; }
  
  const modal = document.createElement('div');
  modal.id = 'fab-gallery-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.88);z-index:100000;display:flex;align-items:center;justify-content:center;font-family:-apple-system,sans-serif';
  
  const box = document.createElement('div');
  box.style.cssText = 'background:#111;border-radius:16px;padding:24px;max-width:860px;width:90%;max-height:85vh;display:flex;flex-direction:column;gap:12px';
  
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;flex-shrink:0';
  header.innerHTML = '<div><div style="font-size:20px;font-weight:700;color:#fff">⚡ Fab Assets</div><div style="font-size:12px;color:#666;margin-top:4px">' + names.length + ' photorealistic models — click to spawn</div></div>';
  
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.cssText = 'background:#222;border:none;color:#aaa;padding:8px 14px;border-radius:8px;cursor:pointer;font-size:14px';
  closeBtn.onclick = () => modal.remove();
  header.appendChild(closeBtn);
  
  const search = document.createElement('input');
  search.placeholder = '🔍 Search...';
  search.style.cssText = 'padding:10px 14px;background:#1a1a1a;border:1px solid #333;border-radius:8px;color:#fff;font-size:14px;outline:none;flex-shrink:0';
  
  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;overflow-y:auto;max-height:60vh';
  
  names.forEach(function(n) {
    const card = document.createElement('div');
    card.dataset.name = n;
    card.style.cssText = 'background:#1a1a1a;border:1px solid #222;border-radius:10px;padding:12px;cursor:pointer;transition:all 0.15s;text-align:center';
    card.innerHTML = '<div style="font-size:22px;margin-bottom:6px">🏗️</div><div style="font-size:11px;font-weight:600;color:#fff;word-break:break-all">' + n.replace(/_/g,' ') + '</div><div style="font-size:10px;color:#555;margin-top:3px">Fab</div>';
    card.onmouseenter = function() { this.style.borderColor='#f59e0b'; this.style.background='#1e1a10'; };
    card.onmouseleave = function() { this.style.borderColor='#222'; this.style.background='#1a1a1a'; };
    card.onclick = function() {
      modal.remove();
      const p = window._fabAliases[n]; if(p) loadGLBModel(n, p, 0, 0, null, p); else parseAndExecute('add fab ' + n);
    };
    grid.appendChild(card);
  });
  
  search.oninput = function() {
    const q = this.value.toLowerCase();
    grid.querySelectorAll('div[data-name]').forEach(function(card) {
      card.style.display = card.dataset.name.includes(q) ? '' : 'none';
    });
  };
  
  box.appendChild(header);
  box.appendChild(search);
  box.appendChild(grid);
  modal.appendChild(box);
  modal.onclick = function(e) { if (e.target === modal) modal.remove(); };
  document.body.appendChild(modal);
  search.focus();
}
window.showFabGallery = showFabGallery;

// Load Fab aliases on startup
(async function loadFabAliases() {
  try {
    const r = await fetch('/models/fab/fab_aliases.json');
    if (!r.ok) return;
    const data = await r.json();
    window._fabAliases = data;
    Object.assign(GLB_MODELS, data);
    console.log('[Fab] Loaded', Object.keys(data).length, 'Fab assets');
  } catch(e) { console.warn('[Fab] Could not load aliases'); }
})();



// === GLB DECOMPOSER — extract individual named pieces from a grouped GLB ===
// Usage: decompose('street_props_full', 'Street Props') → registers all named children
const _decomposedCatalogs = {};

function decomposeGLB(glbPath, catalogName) {
  if (_decomposedCatalogs[glbPath]) return; // already done
  _decomposedCatalogs[glbPath] = true;
  gltfLoader.load(glbPath, (gltf) => {
    const scene = gltf.scene;
    const pieces = [];
    // Collect top-level named children
    scene.children.forEach(child => {
      if (!child.name || child.name === 'Scene') return;
      const alias = (catalogName + '/' + child.name).toLowerCase().replace(/\s+/g, '_');
      // Store as a factory function
      _decomposedPieces[alias] = { source: glbPath, nodeName: child.name, scene: gltf.scene };
      pieces.push({ alias, name: child.name });
    });
    console.log(`[Decompose] ${glbPath}: registered ${pieces.length} pieces`);
    pieces.forEach(p => console.log(`  → add ${p.alias}`));
    showToast(`✅ ${catalogName}: ${pieces.length} individual pieces ready`);
  }, undefined, (err) => {
    console.warn('[Decompose] Failed:', glbPath, err);
  });
}
const _decomposedPieces = {};

function placeDecomposedPiece(alias, x, z) {
  const piece = _decomposedPieces[alias];
  if (!piece) { showToast('❌ Piece not found: ' + alias); return; }
  // Clone the specific named child from the source scene
  const sourceChild = piece.scene.children.find(c => c.name === piece.nodeName);
  if (!sourceChild) { showToast('❌ Node not found: ' + piece.nodeName); return; }
  const clone = sourceChild.clone(true);
  clone.name = alias;
  clone.userData.alias = alias;
  clone.userData.isPlaceable = true;
  clone.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
  // Auto-ground
  const box = new THREE.Box3().setFromObject(clone);
  const height = box.max.y - box.min.y;
  clone.position.set(x || 0, -box.min.y, z || 0);
  scene.add(clone);
  objects.push(clone);
  return clone;
}
window.placeDecomposedPiece = placeDecomposedPiece;
window.decomposeGLB = decomposeGLB;
window._decomposedPieces = _decomposedPieces;

// Auto-decompose the street props pack on load
(function autoDecomposeStreetProps() {
  setTimeout(() => {
    decomposeGLB('/models/fab/street_props_streeprops.glb', 'street_props');
    decomposeGLB('/models/fab/Street_Props_GLB_StreeProps.glb', 'street_props');
  }, 2000); // wait for engine init
})();

// === FOREST LAKE WORLD ===
// [removed] buildForestLakeWorld


// === FREE-FLY EDITOR CAMERA (WASD + Q/E + mouse) ===
const _editorKeys = {};
document.addEventListener('keydown', e => {
  if (window._playMode) return; // only in edit mode
  _editorKeys[e.code] = true;
});
document.addEventListener('keyup', e => { _editorKeys[e.code] = false; });

function _updateEditorCamera(dt) {
  if (window._playMode) return;
  if (!controls || controls.enabled === false) return;

  const speed = (_editorKeys['ShiftLeft'] || _editorKeys['ShiftRight']) ? 80 : 20;
  const cam = camera || window._cam;
  if (!cam) return;

  // Get forward/right vectors from camera
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  cam.getWorldDirection(forward);
  forward.y = 0; forward.normalize();
  right.crossVectors(forward, up).negate();

  let moved = false;
  const move = new THREE.Vector3();

  if (_editorKeys['KeyW'] || _editorKeys['ArrowUp'])    { move.add(forward); moved = true; }
  if (_editorKeys['KeyS'] || _editorKeys['ArrowDown'])  { move.sub(forward); moved = true; }
  if (_editorKeys['KeyA'] || _editorKeys['ArrowLeft'])  { move.sub(right); moved = true; }
  if (_editorKeys['KeyD'] || _editorKeys['ArrowRight']) { move.add(right); moved = true; }
  if (_editorKeys['KeyQ'] || _editorKeys['PageDown'])   { move.y -= 1; moved = true; }
  if (_editorKeys['KeyE'] || _editorKeys['PageUp'])     { move.y += 1; moved = true; }

  if (moved) {
    move.normalize().multiplyScalar(speed * dt);
    cam.position.add(move);
    controls.target.add(move);
  }
}
window._updateEditorCamera = _updateEditorCamera;


// =====================================================
// === GRASS SYSTEM — Instanced, dense, real blades ===
// =====================================================
function buildGrassField(opts = {}) {
  const {
    count = 40000,
    radius = 260,
    excludeRadius = 34,  // skip lake+shore
    minY = 0,
  } = opts;

  // Single blade geometry — thin tapered quad
  const SEGS = 4;
  const bladeW = 0.07, bladeH = 0.75;
  const verts = [], uvs = [], indices = [];

  for (let i = 0; i <= SEGS; i++) {
    const t = i / SEGS;
    const w = bladeW * (1 - t * 0.85);
    const h = bladeH * t;
    const lean = Math.sin(t * 1.2) * 0.15;
    verts.push(-w, h, lean,  w, h, lean);
    uvs.push(0, t,  1, t);
  }
  for (let i = 0; i < SEGS; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    indices.push(a, b, c,  b, d, c);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('uv',       new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  // Gradient green material — lighter tips, darker base
  const mat = new THREE.MeshStandardMaterial({
    color: 0x3a8828,
    roughness: 0.9,
    metalness: 0.0,
    side: THREE.DoubleSide,
    alphaTest: 0.1,
  });

  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.userData.isGrass = true;

  const dummy = new THREE.Object3D();
  const _colors = [
    0x2d6618, 0x3a7d22, 0x48972c, 0x5aad38,
    0x276020, 0x4a8c28, 0x3e7830, 0x62b840,
  ];

  placed = 0;
  let attempts = 0;
  while (placed < count && attempts < count * 4) {
    attempts++;
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * radius;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    // Skip lake area
    if (Math.sqrt(x*x + z*z) < excludeRadius) continue;

    dummy.position.set(x, minY, z);
    dummy.rotation.set(
      (Math.random() - 0.5) * 0.25,   // slight lean
      Math.random() * Math.PI * 2,     // random yaw
      (Math.random() - 0.5) * 0.15
    );
    const s = 0.6 + Math.random() * 0.8;
    dummy.scale.set(s, s * (0.8 + Math.random() * 0.5), s);
    dummy.updateMatrix();
    mesh.setMatrixAt(placed, dummy.matrix);

    // Vary color per instance
    const col = new THREE.Color(_colors[placed % _colors.length]);
    col.r += (Math.random() - 0.5) * 0.06;
    col.g += (Math.random() - 0.5) * 0.08;
    mesh.setColorAt(placed, col);
    placed++;
  }

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  return mesh;
}
window.buildGrassField = buildGrassField;

// === RENDER LOOP ===

// === VISUAL CHARACTER GALLERY ===
// Shows real 3D model previews rendered with Three.js mini-viewers
const CHARACTER_LIBRARY = [
  // === HEROES ===
  { id: 'adventurer', file: 'modular_men_adventurer', name: 'Adventurer', desc: 'Rugged explorer', category: 'Hero', thumb: '🧭' },
  { id: 'swat', file: 'modular_men_swat', name: 'SWAT', desc: 'Tactical specialist', category: 'Hero', thumb: '🪖' },
  { id: 'king', file: 'modular_men_king', name: 'King', desc: 'Royal ruler', category: 'Hero', thumb: '👑' },
  { id: 'punk', file: 'modular_men_punk', name: 'Punk', desc: 'Street fighter', category: 'Hero', thumb: '🤘' },
  { id: 'knight', file: 'single_knight_pack_knightcharacter', name: 'Knight', desc: 'Armored warrior', category: 'Hero', thumb: '⚔️' },
  { id: 'soldier', file: 'hd_char_soldier', name: 'Soldier', desc: 'Combat specialist', category: 'Hero', thumb: '🪖' },
  { id: 'casual_m', file: 'modular_men_casual', name: 'Casual Male', desc: 'Everyday look', category: 'Hero', thumb: '👕' },
  { id: 'casual_m2', file: 'modular_men_casual2', name: 'Casual Male 2', desc: 'Alternate casual', category: 'Hero', thumb: '👕' },
  { id: 'farmer', file: 'modular_men_farmer', name: 'Farmer', desc: 'Rural worker', category: 'Hero', thumb: '🌾' },
  { id: 'suit_m', file: 'modular_men_suit', name: 'Businessman', desc: 'Business attire', category: 'Hero', thumb: '💼' },
  { id: 'worker', file: 'modular_men_worker', name: 'Worker', desc: 'Industrial gear', category: 'Hero', thumb: '🔨' },
  { id: 'beach', file: 'modular_men_beach', name: 'Beach Dude', desc: 'Vacation vibes', category: 'Hero', thumb: '🏖️' },
  { id: 'spacesuit', file: 'modular_men_spacesuit', name: 'Astronaut', desc: 'Space suit', category: 'Hero', thumb: '🚀' },
  { id: 'witch', file: 'modular_women_witch', name: 'Witch', desc: 'Dark sorceress', category: 'Hero', thumb: '🧙‍♀️' },
  { id: 'medieval_w', file: 'modular_women_medieval', name: 'Medieval Woman', desc: 'Medieval heroine', category: 'Hero', thumb: '🏹' },
  { id: 'scifi_w', file: 'modular_women_scifi', name: 'Sci-Fi Woman', desc: 'Futuristic gear', category: 'Hero', thumb: '🔫' },
  { id: 'formal_w', file: 'modular_women_formal', name: 'Formal Woman', desc: 'Elegant attire', category: 'Hero', thumb: '👗' },
  { id: 'women_adventurer', file: 'modular_women_adventurer', name: 'Adventurer (F)', desc: 'Female explorer', category: 'Hero', thumb: '🧭' },
  { id: 'women_casual', file: 'modular_women_casual', name: 'Casual (F)', desc: 'Everyday woman', category: 'Hero', thumb: '👕' },
  { id: 'women_punk', file: 'modular_women_punk', name: 'Punk (F)', desc: 'Female street fighter', category: 'Hero', thumb: '🤘' },
  { id: 'women_soldier', file: 'modular_women_soldier', name: 'Soldier (F)', desc: 'Female combat specialist', category: 'Hero', thumb: '🪖' },
  { id: 'women_suit', file: 'modular_women_suit', name: 'Businesswoman', desc: 'Female business attire', category: 'Hero', thumb: '💼' },
  { id: 'women_worker', file: 'modular_women_worker', name: 'Worker (F)', desc: 'Female industrial worker', category: 'Hero', thumb: '🔨' },
  // === CIVILIANS / NPCs (Realistic) ===
  { id: 'male_casual', file: 'npcs/male_casual', name: 'Male Casual', desc: 'Everyday civilian', category: 'NPC', thumb: '🧑', defaultAnim: 'Idle' },
  { id: 'male_suit', file: 'npcs/male_suit', name: 'Male Suit', desc: 'Business person', category: 'NPC', thumb: '👔', defaultAnim: 'Idle' },
  { id: 'male_shirt', file: 'npcs/male_shirt', name: 'Male Shirt', desc: 'Casual civilian', category: 'NPC', thumb: '👕', defaultAnim: 'Idle' },
  { id: 'male_longsleeve', file: 'npcs/male_longsleeve', name: 'Male Longsleeve', desc: 'Casual civilian', category: 'NPC', thumb: '👕', defaultAnim: 'Idle' },
  { id: 'female_casual', file: 'npcs/female_casual', name: 'Female Casual', desc: 'Casual woman', category: 'NPC', thumb: '👩', defaultAnim: 'Idle' },
  { id: 'female_dress', file: 'npcs/female_dress', name: 'Female Dress', desc: 'Woman in dress', category: 'NPC', thumb: '👗', defaultAnim: 'Idle' },
  { id: 'female_tanktop', file: 'npcs/female_tanktop', name: 'Female Tanktop', desc: 'Athletic woman', category: 'NPC', thumb: '🏃‍♀️', defaultAnim: 'Idle' },
  { id: 'female_alt', file: 'npcs/female_alternative', name: 'Female Alt', desc: 'Alt-style woman', category: 'NPC', thumb: '🎸', defaultAnim: 'Idle' },
  { id: 'animated_human', file: 'npcs/animated_human', name: 'Animated Human', desc: 'Rigged & animated', category: 'NPC', thumb: '🧑', defaultAnim: 'Walk' },
  { id: 'animated_woman', file: 'npcs/animated_woman', name: 'Animated Woman', desc: 'Rigged & animated', category: 'NPC', thumb: '👩', defaultAnim: 'Walk' },
  { id: 'animated_woman_s', file: 'npcs/animated_woman_smooth', name: 'Animated Woman 2', desc: 'Smooth rigged', category: 'NPC', thumb: '👩', defaultAnim: 'Walk' },
  { id: 'smooth_male_casual', file: 'npcs/smooth_male_casual', name: 'Smooth Male Casual', desc: 'Smooth rig civilian', category: 'NPC', thumb: '🧑', defaultAnim: 'Idle' },
  { id: 'smooth_male_suit', file: 'npcs/smooth_male_suit', name: 'Smooth Male Suit', desc: 'Smooth rig business', category: 'NPC', thumb: '👔', defaultAnim: 'Idle' },
  { id: 'smooth_male_shirt', file: 'npcs/smooth_male_shirt', name: 'Smooth Male Shirt', desc: 'Smooth rig casual', category: 'NPC', thumb: '👕', defaultAnim: 'Idle' },
  { id: 'smooth_male_ls', file: 'npcs/smooth_male_longsleeve', name: 'Smooth Male LS', desc: 'Smooth rig casual', category: 'NPC', thumb: '👕', defaultAnim: 'Idle' },
  { id: 'smooth_female_casual', file: 'npcs/smooth_female_casual', name: 'Smooth Female Casual', desc: 'Smooth rig woman', category: 'NPC', thumb: '👩', defaultAnim: 'Idle' },
  { id: 'smooth_female_dress', file: 'npcs/smooth_female_dress', name: 'Smooth Female Dress', desc: 'Smooth rig dress', category: 'NPC', thumb: '👗', defaultAnim: 'Idle' },
  { id: 'smooth_female_tank', file: 'npcs/smooth_female_tanktop', name: 'Smooth Female Tank', desc: 'Smooth rig athletic', category: 'NPC', thumb: '🏃‍♀️', defaultAnim: 'Idle' },
  { id: 'smooth_female_alt', file: 'npcs/smooth_female_alternative', name: 'Smooth Female Alt', desc: 'Smooth rig alt', category: 'NPC', thumb: '🎸', defaultAnim: 'Idle' },
  // NOTE: fab_civilian spawned via 'spawn photorealistic woman' — no animations, use as scene prop
  // === ENEMIES ===
  { id: 'zombie', file: 'npcs/quat_zombie', name: 'Zombie', desc: 'Undead walker', category: 'Enemy', thumb: '🧟', defaultAnim: 'Walk' },
  { id: 'zombie_smooth', file: 'npcs/quat_zombiesmooth', name: 'Zombie (Smooth)', desc: 'Fast zombie', category: 'Enemy', thumb: '🧟', defaultAnim: 'Walk' },
  { id: 'skeleton', file: 'npcs/quat_skeleton', name: 'Skeleton', desc: 'Bone warrior', category: 'Enemy', thumb: '💀', defaultAnim: 'Idle' },
  { id: 'dragon', file: 'npcs/quat_dragon', name: 'Dragon', desc: 'Fire-breathing beast', category: 'Enemy', thumb: '🐉', defaultAnim: 'Idle' },
  { id: 'slime', file: 'npcs/quat_slime', name: 'Slime', desc: 'Gelatinous blob', category: 'Enemy', thumb: '🫧', defaultAnim: 'Idle' },
  { id: 'bat', file: 'npcs/quat_bat', name: 'Bat', desc: 'Flying creature', category: 'Enemy', thumb: '🦇', defaultAnim: 'Idle' },
  { id: 'robot', file: 'npcs/quat_robot', name: 'Robot', desc: 'Mechanical enemy', category: 'Enemy', thumb: '🤖', defaultAnim: 'Idle' },
];

function showCharacterGallery(onSelect) {
  return new Promise((resolve) => {
    // Remove any existing gallery
    const existing = document.getElementById('char-gallery-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'char-gallery-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.92);z-index:10005;display:flex;flex-direction:column;align-items:center;overflow-y:auto;font-family:monospace;padding:20px 0;';

    // Header
    const header = document.createElement('div');
    header.style.cssText = 'text-align:center;margin-bottom:20px;flex-shrink:0;';
    header.innerHTML = '<div style="font-size:32px;color:#ffd700;text-shadow:0 0 20px rgba(255,215,0,0.4);margin-bottom:6px;">⚔️ CHARACTER SELECT</div><div style="font-size:13px;color:#888;">Click any character to play as them</div>';
    overlay.appendChild(header);

    // Filter tabs
    const tabs = document.createElement('div');
    tabs.style.cssText = 'display:flex;gap:10px;margin-bottom:20px;flex-shrink:0;';
    let currentFilter = 'All';
    ['All', 'Hero', 'NPC', 'Enemy'].forEach(cat => {
      const tab = document.createElement('button');
      tab.textContent = cat;
      tab.style.cssText = 'padding:8px 20px;border:1px solid #444;border-radius:20px;background:' + (cat === 'All' ? '#ffd700' : 'transparent') + ';color:' + (cat === 'All' ? '#000' : '#aaa') + ';cursor:pointer;font-family:monospace;font-size:13px;transition:all 0.2s;';
      tab.onclick = () => {
        currentFilter = cat;
        tabs.querySelectorAll('button').forEach(b => { b.style.background = 'transparent'; b.style.color = '#aaa'; b.style.border = '1px solid #444'; });
        tab.style.background = '#ffd700'; tab.style.color = '#000'; tab.style.border = '1px solid #ffd700';
        renderGrid();
      };
      tabs.appendChild(tab);
    });
    overlay.appendChild(tabs);

    // Grid container
    const grid = document.createElement('div');
    grid.id = 'char-gallery-grid';
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,180px);gap:16px;justify-content:center;max-width:1000px;width:90%;padding-bottom:40px;';
    overlay.appendChild(grid);

    // Close button
    const closeBtn = document.createElement('div');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'position:fixed;top:15px;right:20px;font-size:28px;color:#666;cursor:pointer;z-index:10006;transition:color 0.2s;';
    closeBtn.onmouseenter = () => closeBtn.style.color = '#fff';
    closeBtn.onmouseleave = () => closeBtn.style.color = '#666';
    closeBtn.onclick = () => { cleanupViewers(); overlay.remove(); resolve(null); };
    overlay.appendChild(closeBtn);

    const viewers = []; // Track mini renderers for cleanup

    function cleanupViewers() {
      // Static images — nothing to clean up, renderers already disposed after capture
      viewers.length = 0;
    }

    function renderGrid() {
      // Cleanup old viewers
      cleanupViewers();
      grid.innerHTML = '';
      
      const filtered = currentFilter === 'All' ? CHARACTER_LIBRARY : CHARACTER_LIBRARY.filter(c => c.category === currentFilter);
      
      filtered.forEach(ch => {
        const card = document.createElement('div');
        card.style.cssText = 'background:rgba(255,255,255,0.04);border:2px solid transparent;border-radius:12px;overflow:hidden;cursor:pointer;transition:all 0.25s;position:relative;';
        card.onmouseenter = () => { card.style.borderColor = '#ffd700'; card.style.transform = 'translateY(-4px)'; card.style.boxShadow = '0 8px 25px rgba(255,215,0,0.15)'; };
        card.onmouseleave = () => { card.style.borderColor = 'transparent'; card.style.transform = 'translateY(0)'; card.style.boxShadow = 'none'; };

        // 3D preview canvas
        const canvasWrap = document.createElement('div');
        canvasWrap.style.cssText = 'width:180px;height:180px;background:#111;position:relative;';
        
        const cvs = document.createElement('canvas');
        cvs.width = 180; cvs.height = 180;
        cvs.style.cssText = 'width:100%;height:100%;display:block;';
        canvasWrap.appendChild(cvs);

        // Loading spinner
        const spinner = document.createElement('div');
        spinner.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#555;font-size:24px;';
        spinner.textContent = '⏳';
        canvasWrap.appendChild(spinner);

        card.appendChild(canvasWrap);

        // Info section
        const info = document.createElement('div');
        info.style.cssText = 'padding:10px 12px;';
        
        const nameEl = document.createElement('div');
        nameEl.style.cssText = 'font-size:14px;font-weight:bold;color:#e0e0e0;margin-bottom:3px;';
        nameEl.textContent = ch.name;
        info.appendChild(nameEl);

        const descEl = document.createElement('div');
        descEl.style.cssText = 'font-size:11px;color:#666;line-height:1.3;';
        descEl.textContent = ch.desc;
        info.appendChild(descEl);

        // Category badge
        const badge = document.createElement('span');
        const badgeColor = ch.category === 'Hero' ? 'rgba(34,197,94,0.2);color:#22c55e' : ch.category === 'NPC' ? 'rgba(59,130,246,0.25);color:#60a5fa' : 'rgba(239,68,68,0.2);color:#ef4444';
        badge.style.cssText = 'position:absolute;top:8px;right:8px;padding:2px 8px;border-radius:10px;font-size:10px;background:' + badgeColor + ';';
        badge.textContent = ch.category;
        card.appendChild(badge);

        // Selected indicator
        if (selectedCharacterType === ch.id) {
          card.style.borderColor = '#22c55e';
          const sel = document.createElement('div');
          sel.style.cssText = 'position:absolute;top:8px;left:8px;background:#22c55e;color:#000;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:bold;';
          sel.textContent = '✓ ACTIVE';
          card.appendChild(sel);
        }

        card.onclick = () => {
          selectedCharacterType = ch.id;
          try { localStorage.setItem('crate_character', ch.id); } catch(e) {}
          // Register in characterModels if not already
          if (characterController && !characterController.characterModels[ch.id]) {
            characterController.characterModels[ch.id] = { file: ch.file, animPrefix: '', procedural: true };
          }
          cleanupViewers();
          overlay.remove();
          // Force main renderer to reclaim context
          setTimeout(() => {
            renderer.setSize(canvas.clientWidth, canvas.clientHeight);
  
  // === PERFORMANCE: Distance-based LOD + visibility culling ===
  if (camera && objects.length > 50) {
    const camPos = camera.position;
    for (let i = 0; i < objects.length; i++) {
      const obj = objects[i];
      if (!obj || !obj.position || obj.userData.isWater || obj.userData.isGerstnerWater) continue;
      const dx = obj.position.x - camPos.x;
      const dz = obj.position.z - camPos.z;
      const distSq = dx * dx + dz * dz;
      // Hide objects beyond 200 units
      if (distSq > 40000) {
        if (obj.visible) obj.visible = false;
      } else if (!obj.visible) {
        obj.visible = true;
      }
      // Reduce shadow casting for distant objects
      if (obj.userData.isGLB) {
        const castShadow = distSq < 10000; // 100 units
        if (obj.castShadow !== castShadow) {
          obj.traverse(c => { if (c.isMesh) c.castShadow = castShadow; });
        }
      }
    }
  }
  renderer.render(scene, camera);
          }, 100);
          resolve(ch.id);
        };

        card.appendChild(info);
        grid.appendChild(card);

        // Render 3D preview with IntersectionObserver for lazy loading
        const loadPreview = () => {
          try {
            // Use single offscreen renderer, capture to static image
            const offCanvas = document.createElement('canvas');
            offCanvas.width = 360; offCanvas.height = 360;
            const miniRenderer = new THREE.WebGLRenderer({ canvas: offCanvas, antialias: true, preserveDrawingBuffer: true });
            miniRenderer.setSize(360, 360);
            miniRenderer.setClearColor(0x111111, 1);

            const miniScene = new THREE.Scene();
            const miniCam = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
            miniCam.position.set(0, 1.2, 3.5);
            miniCam.lookAt(0, 0.8, 0);

            miniScene.add(new THREE.AmbientLight(0xffffff, 0.6));
            const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
            dirLight.position.set(2, 4, 3);
            miniScene.add(dirLight);
            miniScene.add(new THREE.DirectionalLight(0x8888ff, 0.4).translateX(-2).translateY(1).translateZ(-2));

            const groundGeo = new THREE.CircleGeometry(1.5, 32);
            const groundMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
            const ground = new THREE.Mesh(groundGeo, groundMat);
            ground.rotation.x = -Math.PI / 2;
            miniScene.add(ground);

            const miniLoader = new GLTFLoader();
            miniLoader.setDRACOLoader(dracoLoader);
            
            miniLoader.load('/models/' + (ch.file.endsWith('.glb') ? ch.file : ch.file + '.glb'), (gltf) => {
              spinner.remove();
              const model = gltf.scene;
              const box = new THREE.Box3().setFromObject(model);
              const size = box.getSize(new THREE.Vector3());
              const maxDim = Math.max(size.x, size.y, size.z);
              model.scale.setScalar(2.0 / Math.max(maxDim, 0.001));
              const box2 = new THREE.Box3().setFromObject(model);
              const center = box2.getCenter(new THREE.Vector3());
              model.position.sub(center);
              const box3 = new THREE.Box3().setFromObject(model);
              model.position.y -= box3.min.y;
              model.rotation.y = Math.PI * 0.25;
              miniScene.add(model);

              // Render single frame → static image
              miniRenderer.render(miniScene, miniCam);
              const img = document.createElement('img');
              img.src = miniRenderer.domElement.toDataURL('image/jpeg', 0.9);
              img.style.cssText = 'width:100%;height:100%;display:block;object-fit:cover;border-radius:10px 10px 0 0;';
              cvs.parentNode.replaceChild(img, cvs);

              // Cleanup
              miniRenderer.dispose();
              miniScene.traverse(obj => {
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) { const ms = Array.isArray(obj.material) ? obj.material : [obj.material]; ms.forEach(m => { if(m.map) m.map.dispose(); m.dispose(); }); }
              });
            }, undefined, () => { spinner.textContent = '❌'; });
          } catch(e) { spinner.textContent = '❌'; }
        };

        // Lazy load — use IntersectionObserver if available
        if (window.IntersectionObserver) {
          const obs = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) { obs.disconnect(); loadPreview(); }
          }, { root: overlay, threshold: 0.1 });
          obs.observe(card);
        } else {
          loadPreview();
        }
      });
    }

    renderGrid();
    document.body.appendChild(overlay);
  });
}

// === PROCEDURAL ANIMATION SYSTEM ===
// Apply animations to ANY model, even without embedded clips
function applyProceduralAnimation(obj, type) {
  if (!obj) return '⚠ No object';
  
  const anims = {
    // === BASIC MOTION (15 original) ===
    spin:    { desc: 'Continuous rotation', fn: (o, t, dt) => { o.rotation.y += dt * 2; } },
    bounce:  { desc: 'Up and down bounce', fn: (o, t, dt) => { if (!o.userData._baseY) o.userData._baseY = o.position.y; o.position.y = o.userData._baseY + Math.sin(t * 3) * 0.5; } },
    float:   { desc: 'Gentle floating', fn: (o, t, dt) => { if (!o.userData._baseY) o.userData._baseY = o.position.y; o.position.y = o.userData._baseY + Math.sin(t * 1.5) * 0.3; o.rotation.y += dt * 0.5; } },
    pulse:   { desc: 'Scale pulse', fn: (o, t, dt) => { if (!o.userData._baseScale) o.userData._baseScale = o.scale.x; const s = o.userData._baseScale * (1 + Math.sin(t * 4) * 0.1); o.scale.setScalar(s); } },
    wobble:  { desc: 'Side to side wobble', fn: (o, t, dt) => { o.rotation.z = Math.sin(t * 3) * 0.15; } },
    orbit:   { desc: 'Orbit around origin', fn: (o, t, dt) => { if (!o.userData._orbitR) o.userData._orbitR = Math.sqrt(o.position.x*o.position.x + o.position.z*o.position.z) || 5; const r = o.userData._orbitR; o.position.x = Math.cos(t) * r; o.position.z = Math.sin(t) * r; } },
    swing:   { desc: 'Pendulum swing', fn: (o, t, dt) => { o.rotation.z = Math.sin(t * 2) * 0.3; } },
    breathe: { desc: 'Breathing scale', fn: (o, t, dt) => { if (!o.userData._baseScale) o.userData._baseScale = o.scale.x; const s = o.userData._baseScale * (1 + Math.sin(t * 1) * 0.05); o.scale.set(s, o.userData._baseScale * (1 + Math.sin(t * 1) * 0.08), s); } },
    shake:   { desc: 'Rapid shake', fn: (o, t, dt) => { o.position.x += (Math.random() - 0.5) * 0.02; o.position.z += (Math.random() - 0.5) * 0.02; } },
    walk:    { desc: 'Walking bob', fn: (o, t, dt) => { if (!o.userData._baseY) o.userData._baseY = o.position.y; o.position.y = o.userData._baseY + Math.abs(Math.sin(t * 6)) * 0.1; o.rotation.z = Math.sin(t * 6) * 0.05; } },
    idle:    { desc: 'Subtle idle sway', fn: (o, t, dt) => { o.rotation.y += Math.sin(t * 0.5) * dt * 0.3; if (!o.userData._baseY) o.userData._baseY = o.position.y; o.position.y = o.userData._baseY + Math.sin(t * 2) * 0.02; } },
    dance:   { desc: 'Dance moves', fn: (o, t, dt) => { if (!o.userData._baseY) o.userData._baseY = o.position.y; o.position.y = o.userData._baseY + Math.abs(Math.sin(t * 4)) * 0.3; o.rotation.y += dt * 3; o.rotation.z = Math.sin(t * 8) * 0.1; } },
    attack:  { desc: 'Attack lunge', fn: (o, t, dt) => { const phase = t % 2; if (phase < 0.3) { o.rotation.x = -phase * 2; } else if (phase < 0.6) { o.rotation.x = -(0.6 - phase) * 2; } else { o.rotation.x *= 0.95; } } },
    die:     { desc: 'Death fall', fn: (o, t, dt) => { if (o.rotation.x > -Math.PI/2) o.rotation.x -= dt * 2; } },
    jump:    { desc: 'Jump motion', fn: (o, t, dt) => { if (!o.userData._baseY) o.userData._baseY = o.position.y; const phase = t % 1.5; o.position.y = o.userData._baseY + (phase < 0.3 ? phase * 10 : phase < 0.8 ? 3 - (phase - 0.3) * 6 : 0); } },
    // === COMBAT ANIMATIONS ===
    slash:   { desc: 'Horizontal slash', fn: (o, t, dt) => { const p = t % 1.2; o.rotation.y = p < 0.3 ? p * 8 : p < 0.5 ? 2.4 - (p-0.3)*12 : 0; o.rotation.x = p < 0.3 ? -p*1.5 : 0; } },
    thrust:  { desc: 'Forward thrust/stab', fn: (o, t, dt) => { if (!o.userData._baseZ) o.userData._baseZ = o.position.z; const p = t % 1; o.position.z = o.userData._baseZ + (p < 0.2 ? -p*5 : p < 0.4 ? -(0.4-p)*5 : 0); o.rotation.x = p < 0.2 ? -0.3 : 0; } },
    block:   { desc: 'Shield block stance', fn: (o, t, dt) => { o.rotation.x = Math.sin(t * 0.8) * 0.05 - 0.15; o.rotation.z = Math.sin(t * 1.2) * 0.03; } },
    parry:   { desc: 'Parry deflection', fn: (o, t, dt) => { const p = t % 1.5; o.rotation.z = p < 0.2 ? p*4 : p < 0.5 ? 0.8-(p-0.2)*2.7 : 0; o.rotation.y = p < 0.3 ? p*2 : p*0.3; } },
    dodge:   { desc: 'Quick dodge roll', fn: (o, t, dt) => { if (!o.userData._baseX) o.userData._baseX = o.position.x; const p = t % 1.5; o.position.x = o.userData._baseX + (p < 0.4 ? Math.sin(p*8)*1.5 : 0); o.rotation.z = p < 0.4 ? p*6 : 0; } },
    combo:   { desc: 'Multi-hit combo', fn: (o, t, dt) => { const p = t % 2; if(p<0.3) o.rotation.y = p*6; else if(p<0.6) {o.rotation.y = 1.8-(p-0.3)*12; o.rotation.x = -(p-0.3)*3;} else if(p<1.0) {o.rotation.x = -0.9+(p-0.6)*2.25; o.rotation.z = (p-0.6)*4;} else {o.rotation.x *= 0.9; o.rotation.y *= 0.9; o.rotation.z *= 0.9;} } },
    rage:    { desc: 'Berserker rage', fn: (o, t, dt) => { if (!o.userData._baseScale) o.userData._baseScale = o.scale.x; const s = o.userData._baseScale * (1 + Math.sin(t*8)*0.04); o.scale.setScalar(s); o.position.x += (Math.random()-0.5)*0.03; o.rotation.y += dt*4; } },
    charge:  { desc: 'Bull rush charge', fn: (o, t, dt) => { if (!o.userData._baseZ) o.userData._baseZ = o.position.z; const p = t % 2; o.position.z = o.userData._baseZ - (p < 0.8 ? p*3 : (2-p)*2); o.rotation.x = p < 0.8 ? -0.2 : 0; } },
    // === LOCOMOTION ===
    run:     { desc: 'Running motion', fn: (o, t, dt) => { if (!o.userData._baseY) o.userData._baseY = o.position.y; o.position.y = o.userData._baseY + Math.abs(Math.sin(t * 10)) * 0.15; o.rotation.z = Math.sin(t * 10) * 0.08; o.rotation.x = -0.1; } },
    sprint:  { desc: 'Fast sprint', fn: (o, t, dt) => { if (!o.userData._baseY) o.userData._baseY = o.position.y; o.position.y = o.userData._baseY + Math.abs(Math.sin(t * 14)) * 0.2; o.rotation.z = Math.sin(t * 14) * 0.12; o.rotation.x = -0.2; } },
    sneak:   { desc: 'Stealth crouch walk', fn: (o, t, dt) => { if (!o.userData._baseY) o.userData._baseY = o.position.y; if (!o.userData._baseScale) o.userData._baseScale = o.scale.y; o.scale.y = o.userData._baseScale * 0.75; o.position.y = o.userData._baseY - 0.2 + Math.sin(t*3)*0.03; o.rotation.z = Math.sin(t*2)*0.05; } },
    crawl:   { desc: 'Army crawl', fn: (o, t, dt) => { if (!o.userData._baseY) o.userData._baseY = o.position.y; o.rotation.x = -Math.PI/2 + Math.sin(t*3)*0.05; o.position.y = o.userData._baseY * 0.2; o.rotation.z = Math.sin(t*4)*0.08; } },
    swim:    { desc: 'Swimming stroke', fn: (o, t, dt) => { if (!o.userData._baseY) o.userData._baseY = o.position.y; o.position.y = o.userData._baseY + Math.sin(t*2)*0.2; o.rotation.x = -0.3 + Math.sin(t*3)*0.1; o.rotation.z = Math.sin(t*1.5)*0.15; } },
    fly:     { desc: 'Flying soar', fn: (o, t, dt) => { if (!o.userData._baseY) o.userData._baseY = o.position.y; o.position.y = o.userData._baseY + 2 + Math.sin(t*0.8)*1; o.rotation.z = Math.sin(t*0.5)*0.2; o.rotation.x = -0.1 + Math.sin(t*0.3)*0.05; } },
    climb:   { desc: 'Climbing motion', fn: (o, t, dt) => { if (!o.userData._baseY) o.userData._baseY = o.position.y; o.position.y = o.userData._baseY + (t % 3) * 0.5; o.rotation.z = Math.sin(t*4)*0.1; o.rotation.x = Math.sin(t*4+1)*0.08; } },
    // === EMOTES / SOCIAL ===
    wave:    { desc: 'Friendly wave', fn: (o, t, dt) => { o.rotation.z = 0.3 + Math.sin(t * 6) * 0.2; } },
    cheer:   { desc: 'Victory cheer', fn: (o, t, dt) => { if (!o.userData._baseY) o.userData._baseY = o.position.y; o.position.y = o.userData._baseY + Math.abs(Math.sin(t*5))*0.4; o.rotation.z = Math.sin(t*3)*0.15; o.rotation.y += dt*2; } },
    sit:     { desc: 'Sitting pose', fn: (o, t, dt) => { if (!o.userData._baseScale) o.userData._baseScale = o.scale.y; o.scale.y = o.userData._baseScale * 0.65; o.rotation.x = Math.sin(t*0.5)*0.02; } },
    sleep:   { desc: 'Sleeping/lying down', fn: (o, t, dt) => { o.rotation.x = -Math.PI/2; o.rotation.z = Math.sin(t*0.3)*0.02; if (!o.userData._baseScale) o.userData._baseScale = o.scale.x; o.scale.y = o.userData._baseScale*(1+Math.sin(t*1)*0.03); } },
    taunt:   { desc: 'Taunting gesture', fn: (o, t, dt) => { const p = t % 2; o.rotation.y = Math.sin(p*4)*0.4; o.rotation.z = p < 1 ? Math.sin(p*6)*0.2 : 0; if (!o.userData._baseY) o.userData._baseY = o.position.y; o.position.y = o.userData._baseY + (p < 1 ? Math.sin(p*8)*0.1 : 0); } },
    bow:     { desc: 'Respectful bow', fn: (o, t, dt) => { const p = t % 3; o.rotation.x = p < 0.5 ? -p*1.2 : p < 2 ? -0.6 : -0.6*(3-p); } },
    clap:    { desc: 'Applause clapping', fn: (o, t, dt) => { o.rotation.z = Math.sin(t * 8) * 0.1; if (!o.userData._baseScale) o.userData._baseScale = o.scale.x; o.scale.x = o.userData._baseScale*(1+Math.sin(t*8)*0.03); } },
    cry:     { desc: 'Crying/sad', fn: (o, t, dt) => { o.rotation.x = -0.2 + Math.sin(t*6)*0.03; o.rotation.z = Math.sin(t*3)*0.05; if (!o.userData._baseY) o.userData._baseY = o.position.y; o.position.y = o.userData._baseY + Math.sin(t*6)*0.02; } },
    laugh:   { desc: 'Laughing motion', fn: (o, t, dt) => { if (!o.userData._baseY) o.userData._baseY = o.position.y; o.position.y = o.userData._baseY + Math.abs(Math.sin(t*10))*0.08; o.rotation.x = -0.1 + Math.sin(t*10)*0.05; o.rotation.z = Math.sin(t*5)*0.06; } },
    // === ENVIRONMENTAL ===
    flicker: { desc: 'Light flicker', fn: (o, t, dt) => { if (!o.userData._baseScale) o.userData._baseScale = o.scale.x; const r = Math.random(); o.scale.setScalar(o.userData._baseScale * (0.9 + r * 0.2)); } },
    sway:    { desc: 'Tree/grass sway', fn: (o, t, dt) => { o.rotation.z = Math.sin(t*1.5+o.position.x)*0.08; o.rotation.x = Math.sin(t*1.2+o.position.z)*0.05; } },
    ripple:  { desc: 'Water ripple', fn: (o, t, dt) => { if (!o.userData._baseY) o.userData._baseY = o.position.y; o.position.y = o.userData._baseY + Math.sin(t*3+o.position.x*2)*0.05; o.rotation.z = Math.sin(t*2)*0.02; } },
    hover:   { desc: 'Hovering in place', fn: (o, t, dt) => { if (!o.userData._baseY) o.userData._baseY = o.position.y; o.position.y = o.userData._baseY + 1 + Math.sin(t*2)*0.15; o.rotation.y += dt * 0.8; } },
    explode: { desc: 'Explosion burst', fn: (o, t, dt) => { if (!o.userData._baseScale) o.userData._baseScale = o.scale.x; const p = t % 2; if(p<0.2) {o.scale.setScalar(o.userData._baseScale*(1+p*8));} else if(p<0.5) {o.scale.setScalar(o.userData._baseScale*(2.6-(p-0.2)*6));} else {o.scale.setScalar(o.userData._baseScale);} } },
    portal:  { desc: 'Portal swirl', fn: (o, t, dt) => { o.rotation.y += dt * 5; o.rotation.z = Math.sin(t*3)*0.3; if (!o.userData._baseScale) o.userData._baseScale = o.scale.x; o.scale.setScalar(o.userData._baseScale*(1+Math.sin(t*2)*0.15)); } },
    // === SPECIAL ===
    levelup: { desc: 'Level up glow', fn: (o, t, dt) => { if (!o.userData._baseY) o.userData._baseY = o.position.y; if (!o.userData._baseScale) o.userData._baseScale = o.scale.x; const p = t % 3; o.position.y = o.userData._baseY + (p < 1.5 ? p*0.5 : 0); o.scale.setScalar(o.userData._baseScale*(1 + (p < 1.5 ? Math.sin(p*6)*0.1 : 0))); o.rotation.y += (p < 1.5 ? dt*4 : dt*0.5); } },
    pickup:  { desc: 'Item pickup arc', fn: (o, t, dt) => { if (!o.userData._baseY) o.userData._baseY = o.position.y; const p = t % 1.5; o.position.y = o.userData._baseY + Math.sin(p/1.5*Math.PI)*1.5; o.rotation.y += dt*6; o.rotation.z = Math.sin(p*8)*0.1; } },
    knockback:{ desc: 'Hit knockback', fn: (o, t, dt) => { if (!o.userData._baseZ) o.userData._baseZ = o.position.z; const p = t % 1; o.position.z = o.userData._baseZ + (p < 0.15 ? p*12 : (1-p)*2.1); o.rotation.x = p < 0.15 ? p*4 : (1-p)*0.7; } },
    stun:    { desc: 'Stunned daze', fn: (o, t, dt) => { o.rotation.z = Math.sin(t*8)*0.15; o.rotation.x = Math.sin(t*6)*0.1; o.rotation.y += Math.sin(t*4)*dt*2; } },
    teleport:{ desc: 'Teleport flash', fn: (o, t, dt) => { if (!o.userData._baseScale) o.userData._baseScale = o.scale.x; const p = t % 2; if(p<0.3){o.scale.y = o.userData._baseScale*(1+p*5); o.scale.x = o.userData._baseScale*(1-p*2);} else if(p<0.5){o.scale.setScalar(o.userData._baseScale*0.01);} else if(p<0.8){o.scale.x=o.userData._baseScale*(1-(0.8-p)*2); o.scale.y=o.userData._baseScale*(1+(0.8-p)*5);} else{o.scale.setScalar(o.userData._baseScale);} } },

    // === ACROBATICS ===
    flip:     { desc: 'Backflip', fn: (o, t, dt) => { const p = t % 1.5; o.rotation.x = p < 0.8 ? p * Math.PI * 2.5 : 0; if(!o.userData._baseY)o.userData._baseY=o.position.y; o.position.y = o.userData._baseY + (p < 0.8 ? Math.sin(p/0.8*Math.PI)*2 : 0); } },
    cartwheel:{ desc: 'Cartwheel', fn: (o, t, dt) => { const p = t % 1.2; o.rotation.z = p * Math.PI * 2; if(!o.userData._baseX)o.userData._baseX=o.position.x; o.position.x = o.userData._baseX + p * 2; if(p>1.1){o.position.x=o.userData._baseX;} } },
    roll:     { desc: 'Forward roll', fn: (o, t, dt) => { const p = t % 1; o.rotation.x = p * Math.PI * 2; if(!o.userData._baseZ)o.userData._baseZ=o.position.z; o.position.z = o.userData._baseZ - p * 1.5; if(p>0.9)o.position.z=o.userData._baseZ; } },
    backflip: { desc: 'Standing backflip', fn: (o, t, dt) => { const p = t % 1.8; if(!o.userData._baseY)o.userData._baseY=o.position.y; o.position.y = o.userData._baseY + (p<1 ? Math.sin(p*Math.PI)*2.5 : 0); o.rotation.x = p<1 ? -p*Math.PI*2 : 0; } },
    slide:    { desc: 'Slide on ground', fn: (o, t, dt) => { if(!o.userData._baseZ)o.userData._baseZ=o.position.z; const p = t % 2; o.position.z = o.userData._baseZ - (p<0.8 ? p*4 : 0); o.rotation.x = p<0.8 ? -0.5 : 0; if(!o.userData._baseScale)o.userData._baseScale=o.scale.y; o.scale.y = p<0.8 ? o.userData._baseScale*0.5 : o.userData._baseScale; } },
    wallrun:  { desc: 'Wall running', fn: (o, t, dt) => { if(!o.userData._baseY)o.userData._baseY=o.position.y; const p = t % 2; o.position.y = o.userData._baseY + (p<1.2 ? p*1.5 : 0); o.rotation.z = p<1.2 ? 0.7 : 0; o.rotation.x = Math.sin(t*8)*0.1; } },
    // === ADVANCED COMBAT ===
    uppercut: { desc: 'Rising uppercut', fn: (o, t, dt) => { if(!o.userData._baseY)o.userData._baseY=o.position.y; const p = t % 1.2; o.position.y = o.userData._baseY + (p<0.4 ? p*4 : p<0.8 ? 1.6-(p-0.4)*4 : 0); o.rotation.x = p<0.4 ? -p*3 : 0; } },
    smash:    { desc: 'Ground smash', fn: (o, t, dt) => { if(!o.userData._baseY)o.userData._baseY=o.position.y; const p = t % 1.5; o.position.y = o.userData._baseY + (p<0.5 ? p*3 : p<0.7 ? 1.5-(p-0.5)*7.5 : 0); o.rotation.x = p<0.5 ? -0.3 : p<0.7 ? 0.5 : 0; if(!o.userData._baseScale)o.userData._baseScale=o.scale.x; o.scale.x = p>0.6&&p<0.9 ? o.userData._baseScale*1.3 : o.userData._baseScale; } },
    whirlwind:{ desc: 'Spinning attack', fn: (o, t, dt) => { o.rotation.y += dt * 12; if(!o.userData._baseY)o.userData._baseY=o.position.y; o.position.y = o.userData._baseY + Math.sin(t*3)*0.2; } },
    heavyswing:{ desc: 'Heavy weapon swing', fn: (o, t, dt) => { const p = t % 2; o.rotation.y = p<0.8 ? -p*0.5 : p<1.2 ? -0.4+(p-0.8)*8 : p<1.5 ? 2.8-(p-1.2)*9.3 : 0; o.rotation.x = p<1.2 ? -0.15 : 0; } },
    riposte:  { desc: 'Counter-attack riposte', fn: (o, t, dt) => { const p = t % 1.8; o.rotation.z = p<0.3 ? p*3 : p<0.6 ? 0.9-(p-0.3)*6 : p<0.9 ? -(p-0.6)*4 : 0; o.rotation.y = p<0.6 ? 0 : p<0.9 ? (p-0.6)*5 : 0; } },
    kick:     { desc: 'Roundhouse kick', fn: (o, t, dt) => { const p = t % 1.3; o.rotation.y = p<0.5 ? p*10 : 0; o.rotation.x = p<0.5 ? -0.2 : 0; if(!o.userData._baseY)o.userData._baseY=o.position.y; o.position.y = o.userData._baseY + (p<0.5 ? Math.sin(p/0.5*Math.PI)*0.3 : 0); } },
    headbutt: { desc: 'Headbutt attack', fn: (o, t, dt) => { if(!o.userData._baseZ)o.userData._baseZ=o.position.z; const p = t % 1; o.position.z = o.userData._baseZ - (p<0.2 ? p*5 : p<0.4 ? 1-(p-0.2)*5 : 0); o.rotation.x = p<0.2 ? -p*3 : p<0.4 ? -(0.4-p)*3 : 0; } },
    // === EMOTIONS / SOCIAL ===
    think:    { desc: 'Thinking pose', fn: (o, t, dt) => { o.rotation.z = 0.05 + Math.sin(t*0.5)*0.03; o.rotation.x = -0.1; } },
    nod:      { desc: 'Nodding yes', fn: (o, t, dt) => { o.rotation.x = Math.sin(t*4)*0.15; } },
    headshake:{ desc: 'Shaking head no', fn: (o, t, dt) => { o.rotation.y = Math.sin(t*5)*0.2; } },
    scared:   { desc: 'Scared shaking', fn: (o, t, dt) => { o.position.x += (Math.random()-0.5)*0.015; o.rotation.z = Math.sin(t*12)*0.04; if(!o.userData._baseScale)o.userData._baseScale=o.scale.y; o.scale.y = o.userData._baseScale*0.85; } },
    angry:    { desc: 'Angry stomp', fn: (o, t, dt) => { if(!o.userData._baseY)o.userData._baseY=o.position.y; const p = t % 1; o.position.y = o.userData._baseY + (p<0.1 ? 0.3 : 0); o.rotation.z = Math.sin(t*6)*0.08; o.rotation.x = -0.1; } },
    pray:     { desc: 'Prayer/meditation', fn: (o, t, dt) => { o.rotation.x = -0.15 + Math.sin(t*0.3)*0.02; if(!o.userData._baseY)o.userData._baseY=o.position.y; o.position.y = o.userData._baseY + Math.sin(t*0.5)*0.02; } },
    salute:   { desc: 'Military salute', fn: (o, t, dt) => { o.rotation.z = -0.1 + Math.sin(t*0.3)*0.01; o.rotation.x = Math.sin(t*0.5)*0.01; } },
    flex:     { desc: 'Muscle flex pose', fn: (o, t, dt) => { if(!o.userData._baseScale)o.userData._baseScale=o.scale.x; o.scale.x = o.userData._baseScale*(1+Math.sin(t*3)*0.08); o.scale.z = o.userData._baseScale*(1+Math.sin(t*3)*0.08); o.rotation.y = Math.sin(t*0.5)*0.15; } },
    facepalm: { desc: 'Facepalm', fn: (o, t, dt) => { const p = t % 3; o.rotation.x = p<0.5 ? -p*0.6 : p<2 ? -0.3 : -0.3*(3-p); o.rotation.z = Math.sin(t*0.5)*0.03; } },
    celebrate:{ desc: 'Wild celebration', fn: (o, t, dt) => { if(!o.userData._baseY)o.userData._baseY=o.position.y; o.position.y = o.userData._baseY + Math.abs(Math.sin(t*6))*0.5; o.rotation.y += dt*5; o.rotation.z = Math.sin(t*8)*0.2; } },
    // === LOCOMOTION EXTENDED ===
    strafe:   { desc: 'Sidestep strafe', fn: (o, t, dt) => { if(!o.userData._baseX)o.userData._baseX=o.position.x; o.position.x = o.userData._baseX + Math.sin(t*3)*1.5; o.rotation.z = Math.sin(t*3)*0.1; } },
    moonwalk: { desc: 'Moonwalk backwards', fn: (o, t, dt) => { if(!o.userData._baseZ)o.userData._baseZ=o.position.z; o.position.z = o.userData._baseZ + (t%3)*0.5; o.rotation.z = Math.sin(t*6)*0.05; if(t%3>2.8) o.position.z = o.userData._baseZ; } },
    skip:     { desc: 'Happy skipping', fn: (o, t, dt) => { if(!o.userData._baseY)o.userData._baseY=o.position.y; o.position.y = o.userData._baseY + Math.abs(Math.sin(t*4))*0.4; o.rotation.z = Math.sin(t*4)*0.1; o.rotation.y += dt*1.5; } },
    limp:     { desc: 'Injured limp', fn: (o, t, dt) => { if(!o.userData._baseY)o.userData._baseY=o.position.y; const p = t % 1.5; o.position.y = o.userData._baseY + (p<0.5 ? 0 : Math.sin((p-0.5)*3)*0.15); o.rotation.z = 0.15 + Math.sin(t*2)*0.05; } },
    tiptoe:   { desc: 'Tiptoeing', fn: (o, t, dt) => { if(!o.userData._baseY)o.userData._baseY=o.position.y; o.position.y = o.userData._baseY + 0.15 + Math.sin(t*5)*0.03; o.rotation.z = Math.sin(t*5)*0.02; } },
    gallop:   { desc: 'Horse gallop', fn: (o, t, dt) => { if(!o.userData._baseY)o.userData._baseY=o.position.y; o.position.y = o.userData._baseY + Math.abs(Math.sin(t*7))*0.4; o.rotation.x = -0.15 + Math.sin(t*7)*0.1; } },
    // === ENVIRONMENTAL EXTENDED ===
    tornado:  { desc: 'Tornado spin', fn: (o, t, dt) => { o.rotation.y += dt*15; if(!o.userData._baseY)o.userData._baseY=o.position.y; o.position.y = o.userData._baseY + Math.sin(t*2)*1; if(!o.userData._baseScale)o.userData._baseScale=o.scale.x; o.scale.x=o.userData._baseScale*(1+Math.sin(t*3)*0.3); o.scale.z=o.scale.x; } },
    grow:     { desc: 'Growing larger', fn: (o, t, dt) => { if(!o.userData._baseScale)o.userData._baseScale=o.scale.x; const p = Math.min(t*0.3, 2); o.scale.setScalar(o.userData._baseScale * (1+p)); } },
    shrink:   { desc: 'Shrinking smaller', fn: (o, t, dt) => { if(!o.userData._baseScale)o.userData._baseScale=o.scale.x; const p = Math.max(1-t*0.3, 0.1); o.scale.setScalar(o.userData._baseScale * p); } },
    crumble:  { desc: 'Crumbling apart', fn: (o, t, dt) => { o.rotation.x += (Math.random()-0.5)*0.02; o.rotation.z += (Math.random()-0.5)*0.02; if(!o.userData._baseY)o.userData._baseY=o.position.y; o.position.y = o.userData._baseY - Math.min(t*0.1, 2); } },
    glitch:   { desc: 'Digital glitch', fn: (o, t, dt) => { if(Math.random()<0.1){o.position.x+=(Math.random()-0.5)*0.5;o.position.z+=(Math.random()-0.5)*0.5;} if(Math.random()<0.05){if(!o.userData._baseScale)o.userData._baseScale=o.scale.x; o.scale.x=o.userData._baseScale*(0.5+Math.random());} else if(o.userData._baseScale){o.scale.x=o.userData._baseScale;} } },
    heartbeat:{ desc: 'Heartbeat pulse', fn: (o, t, dt) => { if(!o.userData._baseScale)o.userData._baseScale=o.scale.x; const p=t%1; const s = p<0.1?1.15:p<0.2?1:p<0.3?1.1:1; o.scale.setScalar(o.userData._baseScale*s); } },
    conveyor: { desc: 'Conveyor belt move', fn: (o, t, dt) => { if(!o.userData._baseX)o.userData._baseX=o.position.x; o.position.x = o.userData._baseX + (t%5)*2; if(t%5>4.5) o.position.x = o.userData._baseX; } },
    pendulum: { desc: 'Clock pendulum', fn: (o, t, dt) => { o.rotation.z = Math.sin(t*2.5)*0.6; } },
    catapult: { desc: 'Catapult launch', fn: (o, t, dt) => { if(!o.userData._baseY)o.userData._baseY=o.position.y; const p = t%3; o.position.y = o.userData._baseY + (p<0.3?0:p<1.5?Math.sin((p-0.3)/1.2*Math.PI)*5:0); o.rotation.x = p<0.3?-p*3:p<1.5?-0.9+p*0.6:0; } },
    drain:    { desc: 'Energy drain sink', fn: (o, t, dt) => { if(!o.userData._baseY)o.userData._baseY=o.position.y; o.position.y = o.userData._baseY - Math.min(t*0.05, 1); o.rotation.y += dt*2; if(!o.userData._baseScale)o.userData._baseScale=o.scale.x; o.scale.setScalar(o.userData._baseScale*Math.max(1-t*0.02, 0.3)); } },
    resurrect:{ desc: 'Rising from dead', fn: (o, t, dt) => { if(!o.userData._baseY)o.userData._baseY=o.position.y; const p = Math.min(t*0.5, 1); o.rotation.x = -Math.PI/2*(1-p); o.position.y = o.userData._baseY + p*0.5; } },
    freeze:   { desc: 'Frozen still + shiver', fn: (o, t, dt) => { o.position.x += (Math.random()-0.5)*0.003; o.rotation.z = Math.sin(t*20)*0.005; } },
    burn:     { desc: 'On fire writhe', fn: (o, t, dt) => { o.rotation.z = Math.sin(t*10)*0.15; o.rotation.x = Math.sin(t*8)*0.1; if(!o.userData._baseY)o.userData._baseY=o.position.y; o.position.y = o.userData._baseY + Math.abs(Math.sin(t*6))*0.2; } },
    cast:    { desc: 'Spell casting', fn: (o, t, dt) => { if (!o.userData._baseY) o.userData._baseY = o.position.y; o.position.y = o.userData._baseY + Math.sin(t*2)*0.3; o.rotation.y += dt*3; const p = t % 3; if(p<1.5) o.rotation.x = -p*0.3; else o.rotation.x *= 0.9; } },
  };
  
  const anim = anims[type];
  if (!anim) {
    return '⚠ Unknown animation "' + type + '". Available: ' + Object.keys(anims).join(', ');
  }
  
  obj.userData._procAnim = { type, fn: anim.fn };
  return '✓ Applied "' + type + '" animation to ' + (obj.userData.name || 'object') + ' — ' + anim.desc;
}

// List available procedural animations
function listProceduralAnimations() {
  return `🎬 Procedural Animations (work on ANY model):

⚔️ COMBAT: spin, attack, slash, thrust, block, parry, dodge, combo, rage, charge, uppercut, smash, whirlwind, heavyswing, riposte, kick, headbutt
🏃 MOVEMENT: walk, run, sprint, jump, sneak, crawl, swim, fly, climb, strafe, moonwalk, skip, limp, tiptoe, gallop, slide, wallrun, roll
💃 EMOTES: idle, dance, wave, cheer, sit, sleep, taunt, bow, clap, cry, laugh, think, nod, headshake, scared, angry, pray, salute, flex, facepalm, celebrate
🌿 ENVIRONMENT: bounce, float, pulse, wobble, orbit, swing, breathe, shake, sway, flicker, ripple, hover, explode, portal, tornado, grow, shrink, crumble, glitch, heartbeat, conveyor, pendulum
✨ SPECIAL: die, levelup, pickup, knockback, stun, teleport, cast, catapult, drain, resurrect, freeze, burn, flip, backflip, cartwheel

Usage: "animate [object] [animation]"
Example: "animate knight combo"
Example: "animate tree_1 sway"
Example: "animate dragon fly"`;
}

// === DRAG & DROP ANIMATION FILES ===
// Users can drop .glb files with animations to apply them to selected objects
// Mixamo workflow: download animated FBX → convert to GLB → drop on engine


// === VEHICLE DRIVING SYSTEM ===
const VEHICLE_NAMES = /car|truck|van|bus|tank|jeep|rover|buggy|motorcycle|bike|cart|wagon|ambulance|taxi|police|firetruck|racecar|kart|atv|tractor|milk_truck|carbon_fibre|humvee|suv|pickup|sedan|coupe|convertible|limousine|hovercraft|snowmobile|forklift/i;
const BOAT_NAMES = /boat|ship|cruiseship|yacht|canoe|kayak|raft|submarine|destroyer|battleship|frigate|galleon|sailboat/i;
const AIRCRAFT_NAMES = /helicopter|chopper|plane|airplane|jet|fighter|bomber|spaceship|shuttle|ufo|drone|airship|striker|dispatcher|insurgent|barbarathebee/i;

let activeVehicle = null; // { obj, type, speed, turnSpeed, velocity }
let vehiclePromptDiv = null;

function isVehicle(obj) {
  const n = (obj.userData.name || '').toLowerCase();
  if (VEHICLE_NAMES.test(n)) return 'ground';
  if (BOAT_NAMES.test(n)) return 'water';
  if (AIRCRAFT_NAMES.test(n)) return 'air';
  return null;
}

function getNearestVehicle(playerPos, range) {
  let best = null, bestDist = range;
  for (const obj of objects) {
    const vType = isVehicle(obj);
    if (!vType) continue;
    const d = playerPos.distanceTo(obj.position);
    if (d < bestDist) { bestDist = d; best = { obj, type: vType, dist: d }; }
  }
  return best;
}

function enterVehicle(veh) {
  showVehicleHUD(true);
  // Auto-enable play mode so vehicle controls work
  if (!playMode) {
    _activatePlayMode();
    console.log('[CrateEngine] ▶ Play mode enabled for driving');
  }
  activeVehicle = {
    obj: veh.obj,
    type: veh.type,
    speed: 0,
    maxSpeed: veh.type === 'air' ? 40 : veh.type === 'water' ? 20 : 30,
    accel: veh.type === 'air' ? 18 : veh.type === 'water' ? 10 : 16,
    turnSpeed: veh.type === 'water' ? 1.8 : 3.0,
    velocity: new THREE.Vector3(),
    altitude: veh.obj.position.y,
  };
  // Hide player character
  if (characterController && characterController.model) {
    characterController.model.visible = false;
  }
  // Show driving HUD
  console.log('[CrateEngine] 🚗 Entered vehicle! WASD to drive, SPACE = brake, F = exit');
}

function exitVehicle() {
  if (!activeVehicle) return;
  // Place player next to vehicle
  if (characterController && characterController.model) {
    characterController.model.visible = true;
    const exitPos = activeVehicle.obj.position.clone();
    exitPos.x += 3;
    characterController.position.copy(exitPos);
    characterController.position.copy(exitPos);
  }
  activeVehicle = null;
  exitPlayMode();
  console.log('[CrateEngine] 🚶 Exited vehicle, back to editor mode');
}

function updateVehicle(dt) {
  if (!activeVehicle || !playMode) return;
  const v = activeVehicle;
  const obj = v.obj;
  
  // Steering — arcade feel: responsive at all speeds, slight drift at high speed
  const speedRatio = Math.min(Math.abs(v.speed) / v.maxSpeed, 1);
  const steerFactor = v.turnSpeed * (1.5 - speedRatio * 0.7); // much more responsive
  const turnInput = (playKeys['a'] || playKeys['arrowleft'] ? 1 : 0) - (playKeys['d'] || playKeys['arrowright'] ? 1 : 0);
  if (turnInput !== 0 && Math.abs(v.speed) > 0.5) {
    obj.rotation.y += turnInput * steerFactor * dt;
  }
  
  // Acceleration / braking — power curve (more punch at low speed, tapering at high)
  if (playKeys['w'] || playKeys['arrowup']) {
    const powerCurve = 1.0 - (Math.abs(v.speed) / v.maxSpeed) * 0.5; // stronger at low speed
    v.speed = Math.min(v.speed + v.accel * powerCurve * dt, v.maxSpeed);
  } else if (playKeys['s'] || playKeys['arrowdown']) {
    v.speed = Math.max(v.speed - v.accel * 1.2 * dt, -v.maxSpeed * 0.4);
  } else {
    // Natural deceleration (engine braking) — gentler coast
    v.speed *= (1 - dt * 1.2);
    if (Math.abs(v.speed) < 0.05) v.speed = 0;
  }
  
  // Brake (handbrake feel)
  if (playKeys[' ']) {
    v.speed *= (1 - dt * 6);
    if (Math.abs(v.speed) < 0.5) v.speed = 0;
  }
  
  // Aircraft flight — Space=ascend, Shift=descend, Q/E=roll, smooth banking
  if (v.type === 'air') {
    const ascendRate = 12;
    if (playKeys[' ']) { v.altitude += ascendRate * dt; }
    if (playKeys['shift']) { v.altitude = Math.max(1.0, v.altitude - ascendRate * dt); }
    // Smooth altitude interpolation
    obj.position.y += (v.altitude - obj.position.y) * Math.min(dt * 5, 0.3);
    // Nose pitch based on climb/dive
    const targetPitch = playKeys[' '] ? 0.15 : playKeys['shift'] ? -0.2 : -v.speed * 0.003;
    obj.rotation.x += (targetPitch - obj.rotation.x) * Math.min(dt * 3, 0.2);
    // Banking on turns
    const bankTarget = turnInput * 0.4 * Math.min(Math.abs(v.speed) * 0.05, 1);
    obj.rotation.z += (bankTarget - obj.rotation.z) * Math.min(dt * 4, 0.25);
    // Auto-accelerate slightly (aircraft don't stop mid-air)
    if (v.speed < 5 && v.altitude > 2) v.speed += 2 * dt;
  }
  
  // Move forward in facing direction
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(obj.quaternion);
  obj.position.addScaledVector(forward, v.speed * dt);
  
  // Keep on ground for ground vehicles
  if (v.type === 'ground') {
    obj.position.y = 0.3;
    // Slight body roll on turns
    const turnInput = (playKeys['a'] ? 1 : 0) - (playKeys['d'] ? 1 : 0);
    obj.rotation.z = turnInput * Math.min(Math.abs(v.speed) * 0.003, 0.15);
  }
  if (v.type === 'water') {
    obj.position.y = 0.1 + Math.sin(performance.now() * 0.001) * 0.15;
  }
  
  // Chase camera — GTA-style smooth follow
  const speedFactor = Math.min(Math.abs(v.speed) / v.maxSpeed, 1);
  const camDist = 10 + speedFactor * 8; // farther at speed for cinematic feel
  const camHeight = 4.0 + (v.type === 'air' ? 6 : speedFactor * 2.5);
  const camBack = new THREE.Vector3(0, camHeight, camDist);
  camBack.applyQuaternion(obj.quaternion);
  const idealPos = obj.position.clone().add(camBack);
  // Smoother lerp — lower = more cinematic, less jitter
  const lerpSpeed = 2.5 + speedFactor * 1.5;
  camera.position.lerp(idealPos, Math.min(dt * lerpSpeed, 0.1));
  // Look ahead of vehicle — further at speed for better visibility
  const lookDist = 5 + speedFactor * 8;
  const lookAhead = new THREE.Vector3(0, 1.2, -lookDist).applyQuaternion(obj.quaternion);
  const lookTarget = obj.position.clone().add(lookAhead);
  // Smooth lookAt via quaternion lerp instead of snapping
  const targetQuat = new THREE.Quaternion();
  const tempCam = camera.clone();
  tempCam.lookAt(lookTarget);
  targetQuat.copy(tempCam.quaternion);
  camera.quaternion.slerp(targetQuat, Math.min(dt * 4, 0.12));
  
  // Speed HUD
  const speedKmh = Math.abs(Math.round(v.speed * 3.6));
  if (hudDiv) { hudDiv.style.display = 'block'; hudDiv.textContent = (v.type === 'air' ? '✈️ ' + speedKmh + ' km/h | Alt: ' + Math.round(v.altitude) + 'm' : '🚗 ' + speedKmh + ' km/h'); }
}

// Vehicle proximity prompt
function updateVehiclePrompt() {
  if (!playMode || activeVehicle) {
    if (vehiclePromptDiv) { vehiclePromptDiv.style.display = 'none'; }
    return;
  }
  const playerPos = characterController ? characterController.position : camera.position;
  const near = getNearestVehicle(playerPos, 5);
  if (near) {
    if (!vehiclePromptDiv) {
      vehiclePromptDiv = document.createElement('div');
      vehiclePromptDiv.style.cssText = 'position:fixed;bottom:120px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.85);border:1px solid #f59e0b;color:#f59e0b;padding:8px 20px;border-radius:8px;font-family:monospace;font-size:14px;z-index:9998;pointer-events:none;';
      document.body.appendChild(vehiclePromptDiv);
    }
    const icon = near.type === 'air' ? '✈️' : near.type === 'water' ? '⛵' : '🚗';
    vehiclePromptDiv.textContent = icon + ' Press F to enter ' + (near.obj.userData.name || 'vehicle');
    vehiclePromptDiv.style.display = 'block';
  } else if (vehiclePromptDiv) {
    vehiclePromptDiv.style.display = 'none';
  }
}

// F key handler moved to unified handler below






// === ANIMATED WATER SYSTEM ===
function updateWaterAnimation(time) {
  // All water uses Gerstner shader now
  // Gerstner wave water (shader-based — just update uniforms)
  if (!objects) return;
  for (const obj of objects) {
    if (!obj.userData.isAnimatedWater) continue;
    
    if (obj.userData.isGerstnerWater && obj.material && obj.material.uniforms) {
      obj.material.uniforms.time.value = time * 0.5;
      if (camera) obj.material.uniforms.cameraPos.value.copy(camera.position);
      continue;
    }
    
    // Legacy vertex displacement water (rivers with _origPositions)
    const geo = obj.geometry;
    if (!geo) continue;
    const posAttr = geo.getAttribute('position');
    
    if (obj.userData._origPositions) {
      // TubeGeometry river — offset positions for flowing effect
      const orig = obj.userData._origPositions;
      for (let i = 0; i < posAttr.count; i++) {
        const ox = orig[i * 3];
        const oy = orig[i * 3 + 1];
        const oz = orig[i * 3 + 2];
        const wave = Math.sin(ox * 0.5 + time * 2.0) * 0.15 +
                     Math.sin(oz * 0.3 + time * 1.5) * 0.1;
        posAttr.setXYZ(i, ox, oy + wave, oz);
      }
    }
    posAttr.needsUpdate = true;
    geo.computeVertexNormals();
  }
}

// ═══ GPU INSTANCING — 10x more objects at same performance ═══
const instancedMeshes = new Map(); // glbFile → { mesh: InstancedMesh, count, maxCount, transforms[] }

function addInstancedObject(glbFile, positions) {
  // If we already have an instanced mesh for this model, add to it
  if (instancedMeshes.has(glbFile)) {
    const inst = instancedMeshes.get(glbFile);
    for (const pos of positions) {
      if (inst.count >= inst.maxCount) break;
      const matrix = new THREE.Matrix4();
      matrix.setPosition(pos.x || 0, pos.y || 0, pos.z || 0);
      if (pos.scale) matrix.scale(new THREE.Vector3(pos.scale, pos.scale, pos.scale));
      inst.mesh.setMatrixAt(inst.count, matrix);
      inst.count++;
    }
    inst.mesh.instanceMatrix.needsUpdate = true;
    inst.mesh.count = inst.count;
    return;
  }
  
  // Load model and create InstancedMesh
  gltfLoader.load('/models/' + glbFile + '.glb', (gltf) => {
    const original = gltf.scene;
    // Find first mesh in the loaded model
    let sourceMesh = null;
    original.traverse(child => { if (child.isMesh && !sourceMesh) sourceMesh = child; });
    if (!sourceMesh) return;
    
    const maxCount = Math.max(positions.length * 2, 100); // Pre-allocate extra
    const instMesh = new THREE.InstancedMesh(sourceMesh.geometry, sourceMesh.material, maxCount);
    instMesh.castShadow = true;
    instMesh.receiveShadow = true;
    
    count = 0;
    for (const pos of positions) {
      const matrix = new THREE.Matrix4();
      const scale = pos.scale || 1;
      matrix.compose(
        new THREE.Vector3(pos.x || 0, pos.y || 0, pos.z || 0),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, pos.ry || Math.random() * Math.PI * 2, 0)),
        new THREE.Vector3(scale, scale, scale)
      );
      instMesh.setMatrixAt(count, matrix);
      count++;
    }
    instMesh.count = count;
    instMesh.instanceMatrix.needsUpdate = true;
    instMesh.userData.name = 'instanced_' + glbFile;
    scene.add(instMesh);
    
    instancedMeshes.set(glbFile, { mesh: instMesh, count, maxCount });
    console.log('[Instancing] ' + glbFile + ': ' + count + ' instances (GPU)');
  }, undefined, (err) => {
    console.warn('[Instancing] Failed to load:', glbFile, err?.message);
  });
}

// Scatter command with instancing for large counts
function scatterInstanced(glbFile, count, radius) {
  radius = radius || 40;
  const positions = [];
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * radius;
    positions.push({
      x: Math.cos(angle) * r,
      y: 0,
      z: Math.sin(angle) * r,
      scale: 0.8 + Math.random() * 0.4,
      ry: Math.random() * Math.PI * 2,
    });
  }
  addInstancedObject(glbFile, positions);
  return count + ' instanced ' + glbFile + ' scattered';
}

// ═══ LOD (Level of Detail) SYSTEM ═══
const LOD_DISTANCES = { high: 20, medium: 50, low: 100 };
const lodObjects = new Map(); // mesh → { high, medium, low }

function createLODWrapper(highDetailMesh) {
  const lod = new THREE.LOD();
  
  // High detail — original mesh
  lod.addLevel(highDetailMesh, 0);
  
  // Medium detail — simplified (reduce draw calls)
  const medClone = highDetailMesh.clone();
  medClone.traverse(child => {
    if (child.isMesh && child.material) {
      const mat = child.material.clone();
      mat.normalMap = null; // Drop normal map at distance
      child.material = mat;
    }
  });
  lod.addLevel(medClone, LOD_DISTANCES.medium);
  
  // Low detail — billboard sprite at far distance
  const box = new THREE.Box3().setFromObject(highDetailMesh);
  const size = box.getSize(new THREE.Vector3());
  const spriteGeo = new THREE.PlaneGeometry(Math.max(size.x, size.z), size.y);
  const spriteMat = new THREE.MeshBasicMaterial({ 
    color: highDetailMesh.children[0]?.material?.color || 0x888888,
    transparent: true, opacity: 0.7, side: THREE.DoubleSide 
  });
  const sprite = new THREE.Mesh(spriteGeo, spriteMat);
  sprite.position.y = size.y / 2;
  const lowGroup = new THREE.Group();
  lowGroup.add(sprite);
  lod.addLevel(lowGroup, LOD_DISTANCES.low);
  
  // Copy userData
  lod.userData = { ...highDetailMesh.userData };
  lod.position.copy(highDetailMesh.position);
  lod.rotation.copy(highDetailMesh.rotation);
  lod.scale.copy(highDetailMesh.scale);
  
  return lod;
}

// Update LODs each frame
function updateLODs() {
  scene.traverse(child => {
    if (child.isLOD) child.update(camera);
  });
}

// ═══ SCREEN-SPACE REFLECTIONS (Reflective Surface System) ═══
let reflectivePlane = null;

function createReflectiveSurface(wetness) {
  // Wet ground overlay — creates reflective puddle effect
  if (reflectivePlane) { scene.remove(reflectivePlane); reflectivePlane.geometry.dispose(); reflectivePlane.material.dispose(); }
  
  wetness = wetness || 0.5;
  const geo = new THREE.PlaneGeometry(300, 300);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x111111,
    roughness: 0.05 * (1 - wetness) + 0.01, // Very smooth when wet
    metalness: 0.9,
    transparent: true,
    opacity: wetness * 0.25, // Subtle overlay
    envMapIntensity: 2.0,
    depthWrite: false,
  });
  
  reflectivePlane = new THREE.Mesh(geo, mat);
  reflectivePlane.rotation.x = -Math.PI / 2;
  reflectivePlane.position.y = 0.01; // Just above ground
  reflectivePlane.receiveShadow = true;
  reflectivePlane.userData.name = 'reflective_ground';
  scene.add(reflectivePlane);
  return reflectivePlane;
}

function setSceneWetness(wetness) {
  if (wetness > 0) {
    createReflectiveSurface(wetness);
    // Also increase env map intensity on all objects
    scene.traverse(child => {
      if (child.isMesh && child.material && child.material.isMeshStandardMaterial) {
        child.material.envMapIntensity = 0.8 + wetness * 1.2;
      }
    });
  } else if (reflectivePlane) {
    scene.remove(reflectivePlane);
    reflectivePlane = null;
  }
}

// Auto-wet when raining
window._setWetness = setSceneWetness;

// ═══ AMBIENT PARTICLE SYSTEM ═══
let ambientParticles = null;
let particleType = 'dust'; // dust, fireflies, embers, snow, rain, ash, spores, bubbles

function createAmbientParticles(type, count) {
  if (ambientParticles) { scene.remove(ambientParticles); ambientParticles.geometry.dispose(); ambientParticles.material.dispose(); }
  particleType = type || 'dust';
  count = count || 800;
  
  const config = {
    dust:      { color: 0xddccaa, size: 0.04, opacity: 0.3, speed: 0.15, spread: 40, height: 15, glow: false },
    fireflies: { color: 0xccff44, size: 0.12, opacity: 0.8, speed: 0.3, spread: 30, height: 8, glow: true },
    embers:    { color: 0xff6622, size: 0.08, opacity: 0.7, speed: 0.6, spread: 15, height: 12, glow: true },
    snow:      { color: 0xffffff, size: 0.06, opacity: 0.6, speed: 0.8, spread: 50, height: 25, glow: false },
    ash:       { color: 0x666666, size: 0.05, opacity: 0.4, speed: 0.3, spread: 40, height: 20, glow: false },
    spores:    { color: 0x88ff88, size: 0.06, opacity: 0.5, speed: 0.1, spread: 25, height: 10, glow: true },
    bubbles:   { color: 0x88ccff, size: 0.1, opacity: 0.3, speed: 0.4, spread: 30, height: 15, glow: true },
    leaves:    { color: 0x88aa44, size: 0.08, opacity: 0.6, speed: 0.25, spread: 35, height: 12, glow: false },
    petals:    { color: 0xffaacc, size: 0.07, opacity: 0.5, speed: 0.2, spread: 30, height: 10, glow: false },
  };
  
  const cfg = config[type] || config.dust;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  
  for (let i = 0; i < count; i++) {
    positions[i*3] = (Math.random() - 0.5) * cfg.spread;
    positions[i*3+1] = Math.random() * cfg.height;
    positions[i*3+2] = (Math.random() - 0.5) * cfg.spread;
    velocities[i*3] = (Math.random() - 0.5) * 0.3;
    velocities[i*3+1] = type === 'snow' || type === 'ash' || type === 'leaves' ? -cfg.speed : cfg.speed * (Math.random() * 0.5 + 0.5);
    velocities[i*3+2] = (Math.random() - 0.5) * 0.3;
    phases[i] = Math.random() * Math.PI * 2;
  }
  
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.userData = { velocities, phases, config: cfg };
  
  // Create circular particle texture
  const pCanvas = document.createElement('canvas');
  pCanvas.width = 32; pCanvas.height = 32;
  const pCtx = pCanvas.getContext('2d');
  const gradient = pCtx.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.4, 'rgba(255,255,255,0.8)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  pCtx.fillStyle = gradient;
  pCtx.fillRect(0, 0, 32, 32);
  const particleTex = new THREE.CanvasTexture(pCanvas);
  
  const mat = new THREE.PointsMaterial({
    color: cfg.color,
    size: cfg.size,
    map: particleTex,
    transparent: true,
    opacity: cfg.opacity,
    blending: cfg.glow ? THREE.AdditiveBlending : THREE.NormalBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  
  ambientParticles = new THREE.Points(geo, mat);
  ambientParticles.userData.name = 'ambient_particles';
  scene.add(ambientParticles);
  console.log('[Particles] Created:', type, count, 'particles');
  return ambientParticles;
}

function updateAmbientParticles(dt, camPos) {
  if (!ambientParticles) return;
  const geo = ambientParticles.geometry;
  const pos = geo.attributes.position;
  const { velocities, phases, config: cfg } = geo.userData;
  const t = performance.now() * 0.001;
  
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    
    // Apply velocity + wave motion
    x += velocities[i*3] * dt + Math.sin(t + phases[i]) * 0.02;
    y += velocities[i*3+1] * dt;
    z += velocities[i*3+2] * dt + Math.cos(t * 0.7 + phases[i]) * 0.02;
    
    // Firefly flickering
    if (particleType === 'fireflies') {
      const flicker = Math.sin(t * 3 + phases[i] * 10) > 0.3 ? 1 : 0.1;
      // Can't change per-vertex opacity easily with Points, but the wave motion simulates it
    }
    
    // Wrap around camera position
    const cx = camPos ? camPos.x : 0;
    const cz = camPos ? camPos.z : 0;
    const half = cfg.spread / 2;
    if (x > cx + half) x -= cfg.spread;
    if (x < cx - half) x += cfg.spread;
    if (z > cz + half) z -= cfg.spread;
    if (z < cz - half) z += cfg.spread;
    
    // Vertical wrap
    if (y > cfg.height) y = 0;
    if (y < 0) y = cfg.height;
    
    pos.setXYZ(i, x, y, z);
  }
  pos.needsUpdate = true;
}

// Auto-particles based on biome/weather
function autoParticlesForScene(sceneName) {
  const lower = (sceneName || '').toLowerCase();
  if (lower.includes('snow') || lower.includes('frozen') || lower.includes('ice') || lower.includes('tundra') || lower.includes('winter')) return createAmbientParticles('snow', 1200);
  if (lower.includes('haunted') || lower.includes('graveyard') || lower.includes('dark')) return createAmbientParticles('ash', 600);
  if (lower.includes('forest') || lower.includes('garden') || lower.includes('jungle')) return createAmbientParticles('fireflies', 500);
  if (lower.includes('volcano') || lower.includes('lava') || lower.includes('hell')) return createAmbientParticles('embers', 800);
  if (lower.includes('underwater') || lower.includes('ocean')) return createAmbientParticles('bubbles', 600);
  if (lower.includes('cherry') || lower.includes('japanese')) return createAmbientParticles('petals', 500);
  if (lower.includes('farm') || lower.includes('village') || lower.includes('medieval')) return createAmbientParticles('dust', 400);
  return createAmbientParticles('dust', 300);
}

// Start default particles
setTimeout(() => createAmbientParticles('dust', 0), 1500);


// === DAY/NIGHT CYCLE ===

let _dayTime = 12; // 0-24 hours, start at noon
window._toggleDayNight = function() { _dayNightCycle = !_dayNightCycle; return _dayNightCycle; };
window._setDayTime = function(h) { _dayTime = h % 24; };

function updateDayNightCycle(dt) {
  if (!_dayNightCycle || !skyMesh) return;
  _dayTime = (_dayTime + dt * 0.02) % 24; // Full cycle every ~20 min
  
  // Map time to sun position
  const hourAngle = (_dayTime - 6) / 12 * Math.PI; // 6am = horizon, 12 = zenith, 18 = horizon
  const elevation = Math.sin(hourAngle) * 60; // -60 to 60 degrees
  const azimuth = 180 + (_dayTime / 24) * 360; // rotate around
  
  if (elevation > -5) {
    setSkyTime(Math.max(elevation, 0.5), azimuth % 360);
  }
  
  // Adjust ambient light for time of day
  const brightness = Math.max(0.1, Math.sin(hourAngle) * 0.8 + 0.2);
  scene.traverse(c => {
    if (c.isAmbientLight) c.intensity = brightness * 0.6;
    if (c.isDirectionalLight && c === sunLight) c.intensity = brightness * 1.2;
  });
  
  // Night: dim, blue-ish
  if (_dayTime > 19 || _dayTime < 5) {
    const nightFactor = _dayTime > 19 ? (_dayTime - 19) / 5 : (5 - _dayTime) / 5;
    scene.fog = new THREE.FogExp2(0x0a0a1a, 0.01 * nightFactor + 0.002);
  } else if (scene.fog && scene.fog.density < 0.005) {
    scene.fog = null;
  }
}



// === DISTANCE-BASED LOD ===
// Every 30 frames, adjust detail on distant objects
let _lodFrame = 0;
function updateLOD(cameraPos) {
  _lodFrame++;
  if (_lodFrame % 30 !== 0) return;
  
  const objects = window._sceneObjects || [];
  for (const obj of objects) {
    if (!obj || !obj.position) continue;
    const dist = cameraPos.distanceTo(obj.position);
    
    // Far objects: disable shadows to save GPU
    if (dist > 80) {
      obj.traverse(c => { if (c.isMesh) { c.castShadow = false; } });
    } else if (dist < 60) {
      obj.traverse(c => { if (c.isMesh) { c.castShadow = true; } });
    }
    
    // Very far objects: hide completely
    if (dist > 200) {
      if (obj.visible) obj.visible = false;
    } else if (!obj.visible) {
      obj.visible = true;
    }
  }
}
window._updateLOD = updateLOD;


// === DESTRUCTIBLE OBJECTS SYSTEM (v215) ===
const _destructibles = new Set();
window._destructibles = _destructibles;

function makeDestructible(mesh, opts = {}) {
  if (!mesh) return;
  mesh.userData.destructible = true;
  mesh.userData.hp = opts.hp || 100;
  mesh.userData.maxHp = opts.hp || 100;
  mesh.userData.debrisCount = opts.debris || 8;
  mesh.userData.debrisScale = opts.debrisScale || 0.3;
  _destructibles.add(mesh);
  return mesh;
}
window.makeDestructible = makeDestructible;

function damageObject(mesh, amount) {
  if (!mesh || !mesh.userData.destructible) return false;
  mesh.userData.hp -= amount;
  
  // Flash red on hit
  mesh.traverse(c => {
    if (c.isMesh && c.material) {
      const origColor = c.material.color ? c.material.color.clone() : new THREE.Color(1,1,1);
      c.material.emissive = new THREE.Color(1, 0.2, 0);
      c.material.emissiveIntensity = 0.5;
      setTimeout(() => {
        if (c.material) { c.material.emissive = new THREE.Color(0,0,0); c.material.emissiveIntensity = 0; }
      }, 100);
    }
  });
  
  if (mesh.userData.hp <= 0) {
    shatterObject(mesh);
    return true; // destroyed
  }
  return false;
}
window.damageObject = damageObject;

function shatterObject(mesh) {
  const pos = mesh.position.clone();
  const scale = new THREE.Vector3();
  mesh.getWorldScale(scale);
  const avgScale = (scale.x + scale.y + scale.z) / 3;
  const count = mesh.userData.debrisCount || 8;
  const debrisSize = avgScale * (mesh.userData.debrisScale || 0.3);
  
  // Get color from original mesh
  let color = 0x888888;
  mesh.traverse(c => { if (c.isMesh && c.material && c.material.color) color = c.material.color.getHex(); });
  
  // Create debris pieces
  const debris = [];
  for (let i = 0; i < count; i++) {
    const geo = Math.random() > 0.5 
      ? new THREE.TetrahedronGeometry(debrisSize * (0.5 + Math.random()))
      : new THREE.BoxGeometry(debrisSize * (0.3 + Math.random()*0.7), debrisSize * (0.3 + Math.random()*0.7), debrisSize * (0.3 + Math.random()*0.7));
    const mat = new THREE.MeshStandardMaterial({ 
      color: color, 
      roughness: 0.8,
      metalness: 0.1
    });
    const piece = new THREE.Mesh(geo, mat);
    piece.position.copy(pos).add(new THREE.Vector3(
      (Math.random() - 0.5) * avgScale,
      Math.random() * avgScale * 0.5,
      (Math.random() - 0.5) * avgScale
    ));
    piece.castShadow = true;
    piece.userData._debris = true;
    piece.userData._vel = new THREE.Vector3(
      (Math.random() - 0.5) * 10,
      5 + Math.random() * 8,
      (Math.random() - 0.5) * 10
    );
    piece.userData._angVel = new THREE.Vector3(
      (Math.random() - 0.5) * 10,
      (Math.random() - 0.5) * 10,
      (Math.random() - 0.5) * 10
    );
    piece.userData._life = 3 + Math.random() * 2;
    piece.rotation.set(Math.random()*6, Math.random()*6, Math.random()*6);
    scene.add(piece);
    debris.push(piece);
  }
  
  // Explosion effect
  createExplosionV2(pos, avgScale * 2);
  // Remove original
  scene.remove(mesh);
  _destructibles.delete(mesh);
  const idx = (window._sceneObjects || []).indexOf(mesh);
  if (idx >= 0) window._sceneObjects.splice(idx, 1);
  
  // Animate debris (runs in animate loop)
  if (!window._activeDebris) window._activeDebris = [];
  window._activeDebris.push(...debris);
}

function updateDebris(dt) {
  if (!window._activeDebris || window._activeDebris.length === 0) return;
  const gravity = -20;
  const toRemove = [];
  for (const piece of window._activeDebris) {
    piece.userData._life -= dt;
    if (piece.userData._life <= 0) {
      toRemove.push(piece);
      continue;
    }
    // Fade out in last second
    if (piece.userData._life < 1 && piece.material) {
      piece.material.transparent = true;
      piece.material.opacity = piece.userData._life;
    }
    const v = piece.userData._vel;
    v.y += gravity * dt;
    piece.position.addScaledVector(v, dt);
    // Bounce off ground
    if (piece.position.y < 0.1) {
      piece.position.y = 0.1;
      v.y = -v.y * 0.3;
      v.x *= 0.8;
      v.z *= 0.8;
    }
    // Angular velocity
    const av = piece.userData._angVel;
    piece.rotation.x += av.x * dt;
    piece.rotation.y += av.y * dt;
    piece.rotation.z += av.z * dt;
    av.multiplyScalar(0.98); // dampen
  }
  for (const p of toRemove) {
    scene.remove(p);
    p.geometry.dispose();
    p.material.dispose();
    const idx = window._activeDebris.indexOf(p);
    if (idx >= 0) window._activeDebris.splice(idx, 1);
  }
}

// === GRAPPLING HOOK SYSTEM (v215) ===
let _grappleState = null;
window._grappleHook = function() {
  if (_grappleState) { cancelGrapple(); return; }
  const cam = window._cam || camera;
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
  const rc = new THREE.Raycaster(cam.position.clone(), dir, 0, 80);
  const targets = [];
  scene.traverse(c => { if (c.isMesh && !c.userData._debris && !c.userData._bullet) targets.push(c); });
  const hits = rc.intersectObjects(targets, false);
  if (hits.length === 0) return;
  
  const hitPoint = hits[0].point;
  
  // Create rope visual
  const ropeGeo = new THREE.BufferGeometry();
  const ropeMat = new THREE.LineBasicMaterial({ color: 0xffaa00, linewidth: 2 });
  const startPos = cam.position.clone().add(new THREE.Vector3(0, -0.5, 0));
  ropeGeo.setFromPoints([startPos, hitPoint]);
  const rope = new THREE.Line(ropeGeo, ropeMat);
  scene.add(rope);
  
  _grappleState = {
    target: hitPoint.clone(),
    rope: rope,
    speed: 0,
    maxSpeed: 40,
    accel: 50,
  };
};

function cancelGrapple() {
  if (_grappleState) {
    scene.remove(_grappleState.rope);
    _grappleState.rope.geometry.dispose();
    _grappleState.rope.material.dispose();
    _grappleState = null;
  }
}

function updateGrapple(dt) {
  if (!_grappleState || !characterController) return;
  const target = _grappleState.target;
  const dir = target.clone().sub(characterController.position);
  const dist = dir.length();
  
  if (dist < 2) { cancelGrapple(); return; }
  
  dir.normalize();
  _grappleState.speed = Math.min(_grappleState.speed + _grappleState.accel * dt, _grappleState.maxSpeed);
  
  characterController.position.addScaledVector(dir, _grappleState.speed * dt);
  
  // Update rope visual
  const startPos = characterController.position.clone().add(new THREE.Vector3(0, 1, 0));
  _grappleState.rope.geometry.setFromPoints([startPos, target]);
  _grappleState.rope.geometry.attributes.position.needsUpdate = true;
}

// === PHOTO MODE (v215) ===
let _photoMode = false;
let _photoCamera = null;
let _photoPrevCam = null;
window._togglePhotoMode = function() {
  _photoMode = !_photoMode;
  if (_photoMode) {
    // Save current camera state
    _photoPrevCam = { pos: camera.position.clone(), rot: camera.quaternion.clone() };
    // Create free-fly camera
    _photoCamera = { speed: 0.3, fov: camera.fov };
    // Show photo UI
    let ui = document.getElementById('photo-mode-ui');
    if (!ui) {
      ui = document.createElement('div');
      ui.id = 'photo-mode-ui';
      ui.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.8);color:#fff;padding:12px 24px;border-radius:12px;font-family:system-ui;font-size:13px;z-index:99999;display:flex;gap:16px;align-items:center;';
      ui.innerHTML = `
        <span>📸 PHOTO MODE</span>
        <label>FOV <input type="range" id="photo-fov" min="20" max="120" value="${camera.fov}" style="width:80px"></label>
        <label>Filter <select id="photo-filter" style="background:#333;color:#fff;border:none;padding:2px 6px;border-radius:4px;">
          <option value="none">None</option>
          <option value="vintage">Vintage</option>
          <option value="noir">Noir</option>
          <option value="vibrant">Vibrant</option>
          <option value="cold">Cold</option>
        </select></label>
        <button id="photo-snap" style="background:#4ade80;color:#000;border:none;padding:6px 16px;border-radius:6px;cursor:pointer;font-weight:bold;">📷 Snap</button>
        <button id="photo-exit" style="background:#ef4444;color:#fff;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;">✕ Exit</button>
      `;
      document.body.appendChild(ui);
      
      document.getElementById('photo-fov').addEventListener('input', e => {
        camera.fov = parseFloat(e.target.value);
        camera.updateProjectionMatrix();
      });
      
      document.getElementById('photo-filter').addEventListener('change', e => {
        const canvas = renderer.domElement;
        const filters = {
          none: 'none',
          vintage: 'sepia(0.4) contrast(1.1) brightness(0.9)',
          noir: 'grayscale(1) contrast(1.3) brightness(0.8)',
          vibrant: 'saturate(1.5) contrast(1.1)',
          cold: 'hue-rotate(20deg) saturate(0.8) brightness(1.05)',
        };
        canvas.style.filter = filters[e.target.value] || 'none';
      });
      
      document.getElementById('photo-snap').addEventListener('click', () => {
        renderer.render(scene, camera);
        const link = document.createElement('a');
        link.download = 'crate-engine-photo.png';
        link.href = renderer.domElement.toDataURL('image/png');
        link.click();
      });
      
      document.getElementById('photo-exit').addEventListener('click', () => { window._togglePhotoMode(); });
    }
    ui.style.display = 'flex';
    
    // Pause game time
    if (characterController && characterController.model) characterController.model.visible = true;
    
    // Unlock pointer for free camera
    document.exitPointerLock();
  } else {
    // Exit photo mode
    const ui = document.getElementById('photo-mode-ui');
    if (ui) ui.style.display = 'none';
    renderer.domElement.style.filter = 'none';
    if (_photoPrevCam) {
      camera.position.copy(_photoPrevCam.pos);
      camera.quaternion.copy(_photoPrevCam.rot);
      camera.fov = 60;
      camera.updateProjectionMatrix();
    }
    _photoMode = false;
  }
  return _photoMode;
};

// === SCREEN EFFECTS (v215) ===
function showDamageVignette() {
  let v = document.getElementById('damage-vignette');
  if (!v) {
    v = document.createElement('div');
    v.id = 'damage-vignette';
    v.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:99990;opacity:0;transition:opacity 0.1s;';
    v.style.background = 'radial-gradient(ellipse at center, transparent 50%, rgba(180,0,0,0.5) 100%)';
    document.body.appendChild(v);
  }
  v.style.opacity = '1';
  setTimeout(() => { v.style.opacity = '0'; }, 300);
}
window.showDamageVignette = showDamageVignette;

function showUnderwaterEffect(active) {
  let uw = document.getElementById('underwater-fx');
  if (!uw) {
    uw = document.createElement('div');
    uw.id = 'underwater-fx';
    uw.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:99989;opacity:0;transition:opacity 0.5s;';
    uw.style.background = 'radial-gradient(ellipse at center, rgba(0,40,80,0.2) 0%, rgba(0,20,50,0.5) 100%)';
    document.body.appendChild(uw);
  }
  uw.style.opacity = active ? '1' : '0';
  renderer.domElement.style.filter = active ? 'blur(0.5px) brightness(0.8) hue-rotate(10deg)' : (_photoMode ? '' : 'none');
}

function showSpeedLines(active) {
  let sl = document.getElementById('speed-lines');
  if (!sl) {
    sl = document.createElement('div');
    sl.id = 'speed-lines';
    sl.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:99988;opacity:0;transition:opacity 0.3s;background:radial-gradient(ellipse at center, transparent 40%, rgba(255,255,255,0.05) 100%);';
    document.body.appendChild(sl);
  }
  sl.style.opacity = active ? '1' : '0';
}

// === WALL RUNNING (v215) ===
let _wallRunState = null;

function checkWallRun(playerPos, moveDir, dt) {
  if (!characterController || !playMode) return;
  if (characterController._onGround) { _wallRunState = null; return; }
  
  // Cast rays left and right to detect walls
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const left = right.clone().negate();
  
  const targets = [];
  scene.traverse(c => { if (c.isMesh && c.userData._building) targets.push(c); });
  if (targets.length === 0) return;
  
  for (const [dir, side] of [[right, 'right'], [left, 'left']]) {
    const rc = new THREE.Raycaster(playerPos.clone(), dir, 0, 1.5);
    const hits = rc.intersectObjects(targets, true);
    if (hits.length > 0) {
      // Start wall run
      if (!_wallRunState) {
        _wallRunState = { side, normal: hits[0].face.normal.clone(), timer: 0 };
      }
      _wallRunState.timer += dt;
      if (_wallRunState.timer > 1.5) { _wallRunState = null; return; } // Max 1.5s
      
      // Slow fall + move forward along wall
      characterController.velocity.y = 1; // Slight upward
      // Tilt camera
      const tilt = side === 'right' ? -0.15 : 0.15;
      camera.rotation.z = THREE.MathUtils.lerp(camera.rotation.z, tilt, 0.1);
      return;
    }
  }
  
  // No wall nearby, reset
  if (_wallRunState) {
    _wallRunState = null;
    camera.rotation.z = THREE.MathUtils.lerp(camera.rotation.z, 0, 0.1);
  }
}

// === DOUBLE JUMP (v215) ===
let _jumpCount = 0;
let _maxJumps = 2;
window._setMaxJumps = function(n) { _maxJumps = n; };

// Hook into existing jump logic - expose for animate loop
window._checkDoubleJump = function(keys) {
  if (!characterController) return false;
  if (characterController._onGround) { _jumpCount = 0; }
  if (keys.space && _jumpCount < _maxJumps) {
    _jumpCount++;
    return true;
  }
  return false;
};

// === SLIDE / CROUCH (v215) ===
let _isCrouching = false;
let _isSliding = false;
let _slideTimer = 0;
const _normalHeight = 1.7;
const _crouchHeight = 0.9;

window._toggleCrouch = function() {
  _isCrouching = !_isCrouching;
  if (characterController) {
    // Adjust capsule height conceptually
    if (_isCrouching) {
      camera.position.y -= 0.5;
    } else {
      camera.position.y += 0.5;
    }
  }
  return _isCrouching;
};

function startSlide() {
  if (_isSliding || !characterController) return;
  _isSliding = true;
  _slideTimer = 0.8; // 0.8s slide duration
  _isCrouching = true;
  camera.position.y -= 0.5;
  // Speed boost
  if (characterController.velocity) {
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    characterController.velocity.addScaledVector(fwd, 8);
  }
}

function updateSlide(dt) {
  if (!_isSliding) return;
  _slideTimer -= dt;
  if (_slideTimer <= 0) {
    _isSliding = false;
    if (_isCrouching) window._toggleCrouch();
  }
}

// === HEADBOB (v215) ===
let _headbobTime = 0;
function updateHeadbob(dt, isMoving, isRunning) {
  if (!playMode || _photoMode || activeVehicle) return;
  if (isMoving) {
    const speed = isRunning ? 14 : 8;
    const intensity = isRunning ? 0.04 : 0.02;
    _headbobTime += dt * speed;
    const bobY = Math.sin(_headbobTime) * intensity;
    const bobX = Math.cos(_headbobTime * 0.5) * intensity * 0.5;
    camera.position.y += bobY;
    camera.position.x += bobX;
  } else {
    _headbobTime = 0;
  }
}

// === INTERACTION SYSTEM (v215) ===
let _interactTarget = null;
function updateInteractionPrompt() {
  if (!playMode || _photoMode) return;
  const cam = window._cam || camera;
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
  const rc = new THREE.Raycaster(cam.position.clone(), dir, 0, 5);
  const targets = [];
  scene.traverse(c => { 
    if (c.isMesh && (c.userData.interactable || c.userData.destructible || c.userData._door || c.userData._vehicle)) 
      targets.push(c); 
  });
  const hits = rc.intersectObjects(targets, true);
  
  let prompt = document.getElementById('interact-prompt');
  if (!prompt) {
    prompt = document.createElement('div');
    prompt.id = 'interact-prompt';
    prompt.style.cssText = 'position:fixed;bottom:30%;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.7);color:#fff;padding:8px 18px;border-radius:8px;font-family:system-ui;font-size:14px;z-index:99995;display:none;border:1px solid rgba(255,255,255,0.2);';
    document.body.appendChild(prompt);
  }
  
  if (hits.length > 0) {
    const obj = hits[0].object;
    let label = '';
    if (obj.userData._door) label = '[E] Open Door';
    else if (obj.userData._vehicle) label = '[E] Enter Vehicle';
    else if (obj.userData.destructible) label = '[E] Break';
    else if (obj.userData.interactable) label = `[E] ${obj.userData.interactLabel || 'Interact'}`;
    
    if (label) {
      prompt.textContent = label;
      prompt.style.display = 'block';
      _interactTarget = obj;
    } else {
      prompt.style.display = 'none';
      _interactTarget = null;
    }
  } else {
    prompt.style.display = 'none';
    _interactTarget = null;
  }
}

// === CROSSHAIR (v215) ===
function showCrosshair(show) {
  let
  ch = document.getElementById('crosshair');
  if (!ch) {
    ch = document.createElement('div');
    ch.id = 'crosshair';
    ch.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);pointer-events:none;z-index:99994;display:none;';
    ch.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="2" fill="none" stroke="rgba(255,255,255,0.8)" stroke-width="1"/><line x1="12" y1="4" x2="12" y2="9" stroke="rgba(255,255,255,0.6)" stroke-width="1"/><line x1="12" y1="15" x2="12" y2="20" stroke="rgba(255,255,255,0.6)" stroke-width="1"/><line x1="4" y1="12" x2="9" y2="12" stroke="rgba(255,255,255,0.6)" stroke-width="1"/><line x1="15" y1="12" x2="20" y2="12" stroke="rgba(255,255,255,0.6)" stroke-width="1"/></svg>';
    document.body.appendChild(ch);
  }
  ch.style.display = show ? 'block' : 'none';
}
window.showCrosshair = showCrosshair;

// === COMPASS / HEADING (v215) ===
function createCompass() {
  let comp = document.getElementById('compass');
  if (comp) return;
  comp = document.createElement('div');
  comp.id = 'compass';
  comp.style.cssText = 'position:fixed;top:10px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.5);color:#fff;padding:4px 20px;border-radius:20px;font-family:monospace;font-size:12px;z-index:99993;letter-spacing:4px;pointer-events:none;white-space:nowrap;overflow:hidden;width:200px;text-align:center;';
  document.body.appendChild(comp);
}

function updateCompass() {
  const comp = document.getElementById('compass');
  if (!comp || !playMode) { if (comp) comp.style.display = 'none'; return; }
  comp.style.display = 'block';
  
  const cam = window._cam || camera;
  let angle = Math.atan2(-cam.getWorldDirection(new THREE.Vector3()).x, -cam.getWorldDirection(new THREE.Vector3()).z);
  angle = ((angle * 180 / Math.PI) + 360) % 360;
  
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round(angle / 45) % 8;
  const mainDir = dirs[idx];
  
  comp.innerHTML = `<span style="color:#4ade80;font-weight:bold">${mainDir}</span> <span style="opacity:0.6">${Math.round(angle)}°</span>`;
}

// === SPRINT STAMINA VISUAL (v215) ===
function createStaminaBar() {
  let bar = document.getElementById('stamina-bar');
  if (bar) return;
  bar = document.createElement('div');
  bar.id = 'stamina-bar';
  bar.style.cssText = 'position:fixed;bottom:60px;left:50%;transform:translateX(-50%);width:200px;height:4px;background:rgba(0,0,0,0.4);border-radius:2px;z-index:99993;display:none;';
  bar.innerHTML = '<div id="stamina-fill" style="width:100%;height:100%;background:#4ade80;border-radius:2px;transition:width 0.1s;"></div>';
  document.body.appendChild(bar);
}

function updateStaminaBar(current, max) {
  const bar = document.getElementById('stamina-bar');
  const fill = document.getElementById('stamina-fill');
  if (!bar || !fill) return;
  const pct = Math.max(0, Math.min(1, current / max));
  bar.style.display = pct < 0.99 ? 'block' : 'none';
  fill.style.width = (pct * 100) + '%';
  fill.style.background = pct > 0.5 ? '#4ade80' : pct > 0.25 ? '#f59e0b' : '#ef4444';
}
window.updateStaminaBar = updateStaminaBar;

// === KILL FEED / EVENT LOG (v215) ===
function showKillFeed(text, color) {
  feed = document.getElementById('kill-feed');
  if (!feed) {
    feed = document.createElement('div');
    feed.id = 'kill-feed';
    feed.style.cssText = 'position:fixed;top:80px;right:20px;z-index:99993;pointer-events:none;font-family:system-ui;font-size:13px;';
    document.body.appendChild(feed);
  }
  const entry = document.createElement('div');
  entry.style.cssText = `color:${color || '#fff'};background:rgba(0,0,0,0.5);padding:4px 12px;border-radius:4px;margin-bottom:4px;opacity:1;transition:opacity 0.5s;`;
  entry.textContent = text;
  feed.appendChild(entry);
  setTimeout(() => { entry.style.opacity = '0'; }, 3000);
  setTimeout(() => { entry.remove(); }, 3500);
  // Max 5 entries
  while (feed.children.length > 5) feed.removeChild(feed.firstChild);
}
window.showKillFeed = showKillFeed;

// Hit markers — using existing showHitMarker()

// === OBJECT HIGHLIGHTING (v215) ===
let _highlightedObj = null;
function updateHighlight() {
  if (!playMode || _photoMode) return;
  const cam = window._cam || camera;
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
  const rc = new THREE.Raycaster(cam.position.clone(), dir, 0, 30);
  const meshes = [];
  (window._sceneObjects || []).forEach(o => { if (o) o.traverse(c => { if (c.isMesh) meshes.push(c); }); });
  const hits = rc.intersectObjects(meshes, false);
  
  // Remove old highlight
  if (_highlightedObj && _highlightedObj.userData._origEmissive !== undefined) {
    _highlightedObj.material.emissive = new THREE.Color(_highlightedObj.userData._origEmissive);
    _highlightedObj.material.emissiveIntensity = _highlightedObj.userData._origEmissiveInt || 0;
    _highlightedObj = null;
  }
  
  if (hits.length > 0 && hits[0].object.material && hits[0].object.material.emissive) {
    const obj = hits[0].object;
    obj.userData._origEmissive = obj.material.emissive.getHex();
    obj.userData._origEmissiveInt = obj.material.emissiveIntensity;
    obj.material.emissive = new THREE.Color(0x222222);
    obj.material.emissiveIntensity = 0.3;
    _highlightedObj = obj;
  }
}


// === V215 KEYBINDINGS ===
window.addEventListener('keydown', e => {
  if (!playMode) return;
  const k = e.key.toLowerCase();
  // G = Grappling hook
  if (k === 'g' && !e.ctrlKey && !e.metaKey) { if (window._grappleHook) window._grappleHook(); }
  // F = Flashlight (already exists, just ensure)
  // P = Photo mode
  if (k === 'p' && !e.ctrlKey && !e.metaKey) { if (window._togglePhotoMode) window._togglePhotoMode(); e.preventDefault(); }
  // C = Crouch
  if (k === 'c' && !e.ctrlKey && !e.metaKey) { if (window._toggleCrouch) window._toggleCrouch(); }
  // E = Interact with looked-at object
  if (k === 'e' && !e.ctrlKey && !e.metaKey) {
    if (_interactTarget) {
      if (_interactTarget.userData._vehicle) {
        // Enter vehicle
        if (window._runCommand) window._runCommand('enter vehicle');
      } else if (_interactTarget.userData._door) {
        // Open door
        const door = _interactTarget;
        if (!door.userData._opened) {
          door.rotation.y += Math.PI / 2;
          door.userData._opened = true;
        } else {
          door.rotation.y -= Math.PI / 2;
          door.userData._opened = false;
        }
      } else if (_interactTarget.userData.destructible) {
        damageObject(_interactTarget, 50);
      }
    }
  }
  // V = Toggle first/third person
  if (k === 'v' && !e.ctrlKey && !e.metaKey && characterController) {
    characterController._firstPerson = !characterController._firstPerson;
    if (characterController.model) characterController.model.visible = !characterController._firstPerson;
    showKillFeed(characterController._firstPerson ? '👁 First Person' : '👤 Third Person', '#4ade80');
  }
});

// === WEAPON PICKUP SYSTEM (v215) ===
const _pickupItems = [];
window._pickupItems = _pickupItems;

function registerPickup(mesh, type, data) {
  if (!mesh) return;
  mesh.userData._pickup = true;
  mesh.userData._pickupType = type; // 'weapon', 'health', 'ammo', 'key'
  mesh.userData._pickupData = data || {};
  _pickupItems.push(mesh);
  
  // Add floating/bobbing animation
  mesh.userData._pickupBaseY = mesh.position.y;
  mesh.userData._pickupPhase = Math.random() * Math.PI * 2;
  
  // Add glow
  const glow = new THREE.PointLight(
    type === 'health' ? 0x22ff22 : type === 'ammo' ? 0xffaa00 : 0x4488ff,
    0.5, 5
  );
  glow.position.set(0, 0.5, 0);
  mesh.add(glow);
  mesh.userData._pickupGlow = glow;
}
window.registerPickup = registerPickup;

function updatePickups(dt, t) {
  if (!playMode || !characterController) return;
  const playerPos = characterController.position;
  const toRemove = [];
  
  for (const item of _pickupItems) {
    if (!item.parent) { toRemove.push(item); continue; }
    
    // Bob up and down
    const baseY = item.userData._pickupBaseY || 0.5;
    item.position.y = baseY + Math.sin(t * 2 + (item.userData._pickupPhase || 0)) * 0.15;
    item.rotation.y += dt * 1.5; // Slow spin
    
    // Check pickup distance
    const dist = playerPos.distanceTo(item.position);
    if (dist < 2.5) {
      // Pick up!
      const type = item.userData._pickupType;
      const data = item.userData._pickupData;
      
      if (type === 'weapon') {
        showKillFeed('🗡️ Picked up ' + (data.name || 'weapon'), '#4ade80');
        // Add to inventory if characterController has it
        if (characterController.inventory) {
          characterController.inventory.push(data);
        }
      } else if (type === 'health') {
        if (characterController.hp !== undefined) {
          characterController.hp = Math.min(characterController.maxHp || 200, characterController.hp + (data.amount || 50));
          showKillFeed('❤️ +' + (data.amount || 50) + ' HP', '#22ff22');
        }
      } else if (type === 'ammo') {
        ammo = Math.min(maxAmmo, ammo + (data.amount || 15));
        showKillFeed('🔫 +' + (data.amount || 15) + ' ammo', '#ffaa00');
      }
      
      // Remove from scene with a little flash
      scene.remove(item);
      toRemove.push(item);
    }
  }
  
  for (const item of toRemove) {
    const idx = _pickupItems.indexOf(item);
    if (idx >= 0) _pickupItems.splice(idx, 1);
  }
}



// === EXPLOSION EFFECT (v217) ===
function createExplosionV2(position, size = 3, color = 0xff6600) {
  // Fireball
  const fireGeo = new THREE.SphereGeometry(size * 0.4, 12, 12);
  const fireMat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.9 });
  const fireball = new THREE.Mesh(fireGeo, fireMat);
  fireball.position.copy(position);
  scene.add(fireball);
  
  // Point light
  const light = new THREE.PointLight(color, 5, size * 8);
  light.position.copy(position);
  scene.add(light);
  
  // Smoke particles
  const smokeCount = 20;
  const smokeParticles = [];
  for (let i = 0; i < smokeCount; i++) {
    const sGeo = new THREE.SphereGeometry(size * 0.15 * (0.5 + Math.random()), 6, 6);
    const sMat = new THREE.MeshBasicMaterial({ 
      color: Math.random() > 0.5 ? 0x333333 : 0xff4400, 
      transparent: true, opacity: 0.8 
    });
    const smoke = new THREE.Mesh(sGeo, sMat);
    smoke.position.copy(position);
    smoke.userData._vel = new THREE.Vector3(
      (Math.random() - 0.5) * size * 3,
      2 + Math.random() * size * 2,
      (Math.random() - 0.5) * size * 3
    );
    smoke.userData._life = 0.5 + Math.random() * 1;
    scene.add(smoke);
    smokeParticles.push(smoke);
  }
  
  // Animate
  let elapsed = 0;
  const tick = () => {
    elapsed += 0.016;
    
    // Expand fireball
    const scale = 1 + elapsed * 8;
    fireball.scale.set(scale, scale, scale);
    fireball.material.opacity = Math.max(0, 0.9 - elapsed * 2);
    light.intensity = Math.max(0, 5 - elapsed * 10);
    
    // Move smoke
    for (const s of smokeParticles) {
      s.userData._life -= 0.016;
      s.position.addScaledVector(s.userData._vel, 0.016);
      s.userData._vel.y -= 2 * 0.016; // gravity
      s.material.opacity = Math.max(0, s.userData._life);
      const ss = 1 + (0.5 - s.userData._life) * 2;
      s.scale.set(ss, ss, ss);
    }
    
    if (elapsed < 1.5) {
      requestAnimationFrame(tick);
    } else {
      // Cleanup
      scene.remove(fireball); fireball.geometry.dispose(); fireball.material.dispose();
      scene.remove(light);
      smokeParticles.forEach(s => { scene.remove(s); s.geometry.dispose(); s.material.dispose(); });
    }
  };
  requestAnimationFrame(tick);
  
  // Screen shake
  if (characterController) {
    const origPos = camera.position.clone();
    let shakeTime = 0;
    const shake = () => {
      shakeTime += 0.016;
      const intensity = Math.max(0, 0.3 - shakeTime * 0.6) * size * 0.3;
      camera.position.x += (Math.random() - 0.5) * intensity;
      camera.position.y += (Math.random() - 0.5) * intensity;
      if (shakeTime < 0.5) requestAnimationFrame(shake);
    };
    shake();
  }
}
window.createExplosionV2 = createExplosionV2;

// === LOADING SCREEN FOR WORLD GENERATION (v217) ===
function showLoadingScreen(title, total) {
  let ls = document.getElementById('loading-screen');
  if (ls) ls.remove();
  ls = document.createElement('div');
  ls.id = 'loading-screen';
  ls.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:10020;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:-apple-system,sans-serif;backdrop-filter:blur(5px);';
  ls.innerHTML = `
    <div style="font-size:48px;margin-bottom:16px;">🔨</div>
    <div style="color:#fff;font-size:20px;font-weight:600;margin-bottom:8px;">${title}</div>
    <div id="loading-status" style="color:#888;font-size:13px;margin-bottom:20px;">Preparing...</div>
    <div style="width:300px;height:4px;background:#1a1a1a;border-radius:4px;overflow:hidden;">
      <div id="loading-bar" style="width:0%;height:100%;background:linear-gradient(90deg,#ff6b35,#f59e0b);border-radius:4px;transition:width 0.15s;"></div>
    </div>
    <div id="loading-pct" style="color:#666;font-size:11px;margin-top:8px;">0%</div>
  `;
  document.body.appendChild(ls);
  
  return {
    update(current, statusText) {
      const pct = Math.min(100, Math.round((current / total) * 100));
      const bar = document.getElementById('loading-bar');
      const pctEl = document.getElementById('loading-pct');
      const status = document.getElementById('loading-status');
      if (bar) bar.style.width = pct + '%';
      if (pctEl) pctEl.textContent = pct + '%';
      if (status && statusText) status.textContent = statusText;
    },
    close() {
      const el = document.getElementById('loading-screen');
      if (el) { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; setTimeout(() => el.remove(), 300); }
    }
  };
}
window.showLoadingScreen = showLoadingScreen;

// === FLOATING DAMAGE NUMBERS (v217) ===
function showDamageNumberV2(position, amount, color) {
  const div = document.createElement('div');
  div.style.cssText = 'position:fixed;pointer-events:none;z-index:99996;font-family:monospace;font-weight:bold;font-size:18px;text-shadow:0 0 4px rgba(0,0,0,0.8);transition:all 0.8s ease-out;';
  div.style.color = color || (amount > 0 ? '#ef4444' : '#4ade80');
  div.textContent = (amount > 0 ? '-' : '+') + Math.abs(amount);
  
  // Project 3D position to screen
  const cam = window._cam || camera;
  const vec = position.clone().project(cam);
  const x = (vec.x * 0.5 + 0.5) * window.innerWidth;
  const y = (-vec.y * 0.5 + 0.5) * window.innerHeight;
  div.style.left = x + 'px';
  div.style.top = y + 'px';
  
  document.body.appendChild(div);
  
  requestAnimationFrame(() => {
    div.style.top = (y - 60) + 'px';
    div.style.opacity = '0';
    div.style.fontSize = '24px';
  });
  
  setTimeout(() => div.remove(), 800);
}
window.showDamageNumberV2 = showDamageNumberV2;

// === FOOTSTEP SOUND SYSTEM (v217) ===
let _footstepCtx = null;
let _lastFootstep = 0;
function playFootstep(surface) {
  const now = performance.now();
  if (now - _lastFootstep < 300) return; // Rate limit
  _lastFootstep = now;
  
  if (!_footstepCtx) {
    try { _footstepCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) { return; }
  }
  const ctx = _footstepCtx;
  if (ctx.state === 'suspended') ctx.resume();
  
  // Synthesize a footstep
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  
  osc.type = 'white' in osc ? 'white' : 'sawtooth'; // noise-like
  osc.frequency.value = surface === 'concrete' ? 200 : surface === 'grass' ? 80 : 120;
  filter.type = 'lowpass';
  filter.frequency.value = surface === 'concrete' ? 800 : 400;
  gain.gain.value = 0.05;
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
  
  osc.connect(filter).connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.08);
}

// === AMBIENT SOUND GENERATOR (v217) ===
let _ambientCtx = null;
let _ambientNodes = {};
function setAmbientSound(type) {
  if (!_ambientCtx) {
    try { _ambientCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) { return; }
  }
  // Stop existing
  Object.values(_ambientNodes).forEach(n => { try { n.stop(); } catch(e) {} });
  _ambientNodes = {};
  
  if (type === 'off' || type === 'none') return;
  
  const ctx = _ambientCtx;
  if (ctx.state === 'suspended') ctx.resume();
  
  if (type === 'city' || type === 'traffic' || type === 'urban') {
    // City ambient — low traffic rumble + occasional horn
    const bufferSize = ctx.sampleRate * 4;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      data[i] = (last + (0.015 * white)) / 1.015;
      last = data[i];
      data[i] *= 2.5;
      // Occasional honk bursts
      if (Math.random() < 0.00002) {
        for (let j = 0; j < Math.min(800, bufferSize - i); j++) {
          data[i + j] += Math.sin(j * 0.15) * 0.3 * Math.exp(-j * 0.005);
        }
      }
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer; src.loop = true;
    const gain = ctx.createGain(); gain.gain.value = 0.04;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 600;
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start();
    _ambientNodes.city = src;
  } else if (type === 'wind' || type === 'outdoor') {
    // Brown noise for wind
    const bufferSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    last = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      data[i] = (last + (0.02 * white)) / 1.02;
      last = data[i];
      data[i] *= 3.5;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = 0.03;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start();
    _ambientNodes.wind = src;
  }
}
window.setAmbientSound = setAmbientSound;

// === COORDINATE DISPLAY (v217) ===
function updateCoordDisplay() {
  if (!playMode) return;
  let cd = document.getElementById('coord-display');
  if (!cd) {
    cd = document.createElement('div');
    cd.id = 'coord-display';
    cd.style.cssText = 'position:fixed;bottom:44px;left:8px;color:rgba(255,255,255,0.3);font-family:monospace;font-size:10px;z-index:99990;pointer-events:none;';
    document.body.appendChild(cd);
  }
  const pos = characterController ? characterController.position : camera.position;
  cd.textContent = `X:${pos.x.toFixed(0)} Y:${pos.y.toFixed(1)} Z:${pos.z.toFixed(0)}`;
}



// === PROCEDURAL CLOUD SYSTEM (v217) ===
let _cloudGroup = null;
function createClouds(count = 15) {
  if (_cloudGroup) { scene.remove(_cloudGroup); }
  _cloudGroup = new THREE.Group();
  _cloudGroup.userData.name = '_clouds';
  
  for (let i = 0; i < count; i++) {
    const cloud = new THREE.Group();
    // Each cloud is 3-6 merged spheres
    const puffs = 3 + Math.floor(Math.random() * 4);
    for (let j = 0; j < puffs; j++) {
      const size = 4 + Math.random() * 8;
      const geo = new THREE.SphereGeometry(size, 8, 6);
      const mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 1,
        metalness: 0,
        transparent: true,
        opacity: 0.7 + Math.random() * 0.2,
      });
      const puff = new THREE.Mesh(geo, mat);
      puff.position.set(
        (Math.random() - 0.5) * size * 2,
        (Math.random() - 0.5) * size * 0.5,
        (Math.random() - 0.5) * size * 1.5
      );
      puff.scale.y = 0.4 + Math.random() * 0.3; // Flatten
      cloud.add(puff);
    }
    
    cloud.position.set(
      (Math.random() - 0.5) * 400,
      40 + Math.random() * 30,
      (Math.random() - 0.5) * 400
    );
    cloud.userData._speed = 0.5 + Math.random() * 1.5;
    _cloudGroup.add(cloud);
  }
  
  scene.add(_cloudGroup);
  return _cloudGroup;
}
window.createClouds = createClouds;

function updateClouds(dt) {
  if (!_cloudGroup) return;
  for (const cloud of _cloudGroup.children) {
    cloud.position.x += (cloud.userData._speed || 1) * dt;
    if (cloud.position.x > 220) cloud.position.x = -220;
  }
}

// Low-poly clouds disabled — procedural AAA sky is better
// To re-enable: createClouds(); or use settings panel


// === ENHANCED VEHICLE HUD (v217) ===
function showVehicleHUD(active) {
  let vhud = document.getElementById('vehicle-hud');
  if (!active) {
    if (vhud) vhud.style.display = 'none';
    return;
  }
  if (!vhud) {
    vhud = document.createElement('div');
    vhud.id = 'vehicle-hud';
    vhud.style.cssText = 'position:fixed;bottom:80px;right:20px;z-index:9998;font-family:monospace;pointer-events:none;text-align:right;';
    vhud.innerHTML = `
      <div style="background:rgba(0,0,0,0.7);border:1px solid #333;border-radius:12px;padding:12px 20px;backdrop-filter:blur(5px);">
        <div style="font-size:36px;color:#4ade80;font-weight:bold;" id="v-speed">0</div>
        <div style="font-size:11px;color:#666;">KM/H</div>
        <div style="margin-top:8px;width:120px;height:3px;background:#1a1a1a;border-radius:2px;">
          <div id="v-rpm-bar" style="width:0%;height:100%;background:linear-gradient(90deg,#4ade80,#f59e0b,#ef4444);border-radius:2px;transition:width 0.1s;"></div>
        </div>
        <div style="font-size:10px;color:#555;margin-top:4px;">
          <span id="v-gear">N</span> | RPM <span id="v-rpm">0</span>
        </div>
      </div>
    `;
    document.body.appendChild(vhud);
  }
  vhud.style.display = 'block';
}

function updateVehicleHUD(vp) {
  const speed = Math.abs(Math.round(vp.speed * 3.6));
  const rpm = Math.round(vp.rpm || 0);
  const gear = speed < 5 ? 'N' : speed < 30 ? '1' : speed < 60 ? '2' : speed < 100 ? '3' : speed < 150 ? '4' : '5';
  
  const sEl = document.getElementById('v-speed');
  const rEl = document.getElementById('v-rpm');
  const gEl = document.getElementById('v-gear');
  const rBar = document.getElementById('v-rpm-bar');
  
  if (sEl) sEl.textContent = speed;
  if (rEl) rEl.textContent = rpm;
  if (gEl) gEl.textContent = gear;
  if (rBar) rBar.style.width = Math.min(100, (rpm / 7000) * 100) + '%';
}


// === WATER SPLASH EFFECT (v217) ===
function createWaterSplash(position) {
  const count = 12;
  const splashes = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const speed = 2 + Math.random() * 4;
    const geo = new THREE.SphereGeometry(0.1 + Math.random() * 0.15, 4, 4);
    const mat = new THREE.MeshBasicMaterial({ color: 0x66bbff, transparent: true, opacity: 0.7 });
    const drop = new THREE.Mesh(geo, mat);
    drop.position.copy(position);
    drop.userData._vel = new THREE.Vector3(
      Math.cos(angle) * speed * (0.5 + Math.random()),
      3 + Math.random() * 4,
      Math.sin(angle) * speed * (0.5 + Math.random())
    );
    drop.userData._life = 0.8 + Math.random() * 0.5;
    scene.add(drop);
    splashes.push(drop);
  }
  
  // Ring ripple
  const ringGeo = new THREE.RingGeometry(0.1, 0.5, 16);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x88ccff, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.copy(position);
  ring.position.y += 0.05;
  ring.rotation.x = -Math.PI / 2;
  scene.add(ring);
  
  let t = 0;
  const animate = () => {
    t += 0.016;
    
    // Expand ring
    const rs = 1 + t * 15;
    ring.scale.set(rs, rs, 1);
    ring.material.opacity = Math.max(0, 0.5 - t);
    
    // Move drops
    for (const drop of splashes) {
      drop.userData._life -= 0.016;
      drop.userData._vel.y -= 15 * 0.016;
      drop.position.addScaledVector(drop.userData._vel, 0.016);
      drop.material.opacity = Math.max(0, drop.userData._life * 0.7);
    }
    
    if (t < 1.2) {
      requestAnimationFrame(animate);
    } else {
      scene.remove(ring); ring.geometry.dispose(); ring.material.dispose();
      splashes.forEach(s => { scene.remove(s); s.geometry.dispose(); s.material.dispose(); });
    }
  };
  requestAnimationFrame(animate);
}
window.createWaterSplash = createWaterSplash;

// === LANDING DUST EFFECT (v217) ===
function createLandingDust(position) {
  const count = 8;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const geo = new THREE.SphereGeometry(0.2 + Math.random() * 0.3, 4, 4);
    const mat = new THREE.MeshBasicMaterial({ color: 0x998866, transparent: true, opacity: 0.4 });
    const puff = new THREE.Mesh(geo, mat);
    puff.position.copy(position);
    const speed = 1.5 + Math.random() * 2;
    puff.userData._vel = new THREE.Vector3(Math.cos(angle) * speed, 0.5 + Math.random(), Math.sin(angle) * speed);
    puff.userData._life = 0.5 + Math.random() * 0.3;
    scene.add(puff);
    
    const tick = () => {
      puff.userData._life -= 0.016;
      puff.position.addScaledVector(puff.userData._vel, 0.016);
      puff.userData._vel.multiplyScalar(0.95);
      const s = 1 + (0.5 - puff.userData._life) * 3;
      puff.scale.set(s, s, s);
      puff.material.opacity = Math.max(0, puff.userData._life * 0.4);
      if (puff.userData._life > 0) requestAnimationFrame(tick);
      else { scene.remove(puff); puff.geometry.dispose(); puff.material.dispose(); }
    };
    requestAnimationFrame(tick);
  }
}
window.createLandingDust = createLandingDust;

// === MUZZLE FLASH IMPROVEMENT (v217) ===
function createMuzzleFlash(position, direction) {
  const flashGeo = new THREE.SphereGeometry(0.2, 6, 6);
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffcc00, transparent: true, opacity: 1 });
  const flash = new THREE.Mesh(flashGeo, flashMat);
  flash.position.copy(position).addScaledVector(direction, 0.5);
  scene.add(flash);
  
  const light = new THREE.PointLight(0xffaa00, 3, 8);
  light.position.copy(flash.position);
  scene.add(light);
  
  t = 0;
  const tick = () => {
    t += 0.016;
    flash.material.opacity = Math.max(0, 1 - t * 15);
    light.intensity = Math.max(0, 3 - t * 40);
    const s = 1 + t * 5;
    flash.scale.set(s, s, s);
    if (t < 0.1) requestAnimationFrame(tick);
    else {
      scene.remove(flash); flash.geometry.dispose(); flash.material.dispose();
      scene.remove(light);
    }
  };
  requestAnimationFrame(tick);
}
window.createMuzzleFlash = createMuzzleFlash;


// === XP & LEVEL PROGRESSION (v217) ===
let _playerXP = 0;
let _playerLevel = 1;
const _xpPerLevel = 100;

function addXP(amount, reason) {
  _playerXP += amount;
  
  // Level up check
  const newLevel = Math.floor(_playerXP / _xpPerLevel) + 1;
  if (newLevel > _playerLevel) {
    _playerLevel = newLevel;
    showLevelUp(_playerLevel);
  }
  
  // Update HUD if exists
  const xpEl = document.getElementById('hud-xp');
  if (xpEl) xpEl.textContent = _playerXP;
  
  if (reason) showKillFeed('⭐ +' + amount + ' XP — ' + reason, '#ffd700');
}
window.addXP = addXP;
window._getXP = () => ({ xp: _playerXP, level: _playerLevel });

function showLevelUp(level) {
  const div = document.createElement('div');
  div.style.cssText = 'position:fixed;top:30%;left:50%;transform:translate(-50%,-50%);z-index:99999;text-align:center;pointer-events:none;animation:levelUp 2s forwards;';
  div.innerHTML = `
    <div style="font-size:48px;color:#ffd700;font-weight:bold;font-family:-apple-system,sans-serif;text-shadow:0 0 20px rgba(255,215,0,0.5);">
      ⬆ LEVEL ${level}
    </div>
    <div style="font-size:16px;color:#ffaa00;margin-top:8px;">Keep building!</div>
  `;
  
  // Add animation keyframes if not exist
  if (!document.getElementById('level-up-style')) {
    const style = document.createElement('style');
    style.id = 'level-up-style';
    style.textContent = '@keyframes levelUp { 0% { opacity:0; transform:translate(-50%,-50%) scale(0.5); } 20% { opacity:1; transform:translate(-50%,-50%) scale(1.2); } 40% { transform:translate(-50%,-50%) scale(1); } 80% { opacity:1; } 100% { opacity:0; transform:translate(-50%,-70%) scale(1); } }';
    document.head.appendChild(style);
  }
  
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 2000);
}

// Grant XP for various actions
window._grantBuildXP = function() { addXP(5, 'Object placed'); };
window._grantKillXP = function() { addXP(20, 'Enemy defeated'); };
window._grantExploreXP = function() { addXP(10, 'New area explored'); };




// === AUTO-DRIVING CARS ===
let _drivingCars = [];

function spawnDrivingCar(scene, roadX, startZ, direction) {
  const carModels = ['sedan', 'taxi', 'suv', 'police_car', 'van', 'ambulance'];
  const modelName = carModels[Math.floor(Math.random() * carModels.length)];
  const carColors = [0x2244aa, 0xcc2222, 0x22aa44, 0xeeeeee, 0x222222, 0xaaaa22, 0x8844cc];
  const color = carColors[Math.floor(Math.random() * carColors.length)];
  
  // Simple box car for now (GLB loading is async and complex)
  const g = new THREE.Group();
  g.userData.name = 'Driving Car';
  g.userData.isDrivingCar = true;
  const bodyMat = new THREE.MeshStandardMaterial({color, roughness: 0.3, metalness: 0.5});
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 1.2, 4), bodyMat);
  body.position.y = 0.8; body.castShadow = true; g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.8, 2), bodyMat);
  cabin.position.y = 1.7; cabin.castShadow = true; g.add(cabin);
  // Windows
  const glassMat = new THREE.MeshPhysicalMaterial({color: 0x88ccee, roughness: 0.05, transparent: true, opacity: 0.3});
  const windshield = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.7), glassMat);
  windshield.position.set(0, 1.7, -0.99); g.add(windshield);
  // Wheels
  const wheelMat = new THREE.MeshStandardMaterial({color: 0x222222, roughness: 0.8});
  [[-0.9, 0.35, -1.2], [0.9, 0.35, -1.2], [-0.9, 0.35, 1.2], [0.9, 0.35, 1.2]].forEach(([wx,wy,wz]) => {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.2, 12), wheelMat);
    wheel.rotation.z = Math.PI/2; wheel.position.set(wx,wy,wz); g.add(wheel);
  });
  // Headlights
  const lightMat = new THREE.MeshBasicMaterial({color: 0xffffcc});
  [-0.6, 0.6].forEach(x => {
    const hl = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), lightMat);
    hl.position.set(x, 0.7, -2); g.add(hl);
  });
  // Tail lights
  const tailMat = new THREE.MeshBasicMaterial({color: 0xff0000});
  [-0.6, 0.6].forEach(x => {
    const tl = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), tailMat);
    tl.position.set(x, 0.7, 2); g.add(tl);
  });
  
  g.position.set(roadX, 0, startZ);
  g.rotation.y = direction > 0 ? 0 : Math.PI; // Face direction of travel
  scene.add(g);
  
  _drivingCars.push({
    obj: g,
    speed: 8 + Math.random() * 12, // 8-20 units/sec
    roadX: roadX,
    direction: direction, // 1 = +z, -1 = -z
    minZ: -80,
    maxZ: 160
  });
  return g;
}

function updateDrivingCars(dt) {
  const isNight = (_dayTime < 6 || _dayTime > 18);
  for (let i = 0; i < _drivingCars.length; i++) {
    const car = _drivingCars[i];
    car.obj.position.z += car.speed * car.direction * dt;
    // Loop around
    if (car.direction > 0 && car.obj.position.z > car.maxZ) {
      car.obj.position.z = car.minZ;
    } else if (car.direction < 0 && car.obj.position.z < car.minZ) {
      car.obj.position.z = car.maxZ;
    }
    // Keep on road height
    car.obj.position.y = 0.05;
    car.obj.position.x = car.roadX;
    // Headlights at night
    if (isNight && !car.headlight) {
      const hl = new THREE.SpotLight(0xffffcc, 3, 20, 0.5, 0.5);
      hl.position.set(0, 1, car.direction > 0 ? -2.5 : 2.5);
      hl.target.position.set(0, 0, car.direction > 0 ? -10 : 10);
      car.obj.add(hl);
      car.obj.add(hl.target);
      car.headlight = hl;
    } else if (!isNight && car.headlight) {
      car.obj.remove(car.headlight);
      car.obj.remove(car.headlight.target);
      car.headlight.dispose();
      car.headlight = null;
    }
  }
}

function clearDrivingCars() {
  for (let i = 0; i < _drivingCars.length; i++) {
    scene.remove(_drivingCars[i].obj);
  }
  _drivingCars.length = 0;
}

// === NIGHT LIGHTING SYSTEM ===
let _nightLights = [];
let _lastNightCheck = 0;

function updateNightLighting(t) {
  // Check every 2 seconds
  if (t - _lastNightCheck < 2) return;
  _lastNightCheck = t;
  
  const isNight = (_dayTime < 6 || _dayTime > 18);
  
  if (isNight && _nightLights.length === 0) {
    // Add point lights to street lamps and buildings
    for (let i = 0; i < objects.length; i++) {
      const obj = objects[i];
      const name = (obj.userData.name || '').toLowerCase();
      if (name.includes('lamp') || name.includes('street_lamp') || name.includes('light_post')) {
        const pos = new THREE.Vector3();
        obj.getWorldPosition(pos);
        const light = new THREE.PointLight(0xffcc66, 2, 15);
        light.position.set(pos.x, pos.y + 3.5, pos.z);
        scene.add(light);
        _nightLights.push(light);
      } else if (name.includes('house') || name.includes('shop') || name.includes('salon') || name.includes('restaurant') || name.includes('cafe') || name.includes('grocery') || name.includes('pharmacy') || name.includes('bank') || name.includes('barber') || name.includes('clothing') || name.includes('gym')) {
        // Window glow for buildings
        const pos = new THREE.Vector3();
        obj.getWorldPosition(pos);
        const light = new THREE.PointLight(0xffeecc, 0.8, 12);
        light.position.set(pos.x, pos.y + 2, pos.z);
        scene.add(light);
        _nightLights.push(light);
      }
    }
  } else if (!isNight && _nightLights.length > 0) {
    // Remove night lights during day
    for (let i = 0; i < _nightLights.length; i++) {
      scene.remove(_nightLights[i]);
      _nightLights[i].dispose();
    }
    _nightLights.length = 0;
  }
}


// === TRAFFIC AI - Better Road Following ===
function updateTrafficCars(dt) {
  if (!window._trafficCars) return;
  for (const car of window._trafficCars) {
    if (!car.mesh || !car.mesh.parent) continue;
    const pos = car.mesh.position;
    const speed = car.speed || 8;
    
    // Move along lane direction
    const dir = car.direction || new THREE.Vector3(0, 0, 1);
    pos.addScaledVector(dir, speed * dt);
    
    // Snap to road Y
    const ty = _getTerrainY(pos.x, pos.z);
    if (ty > -0.1) pos.y = ty + 0.1;
    
    // Turn at intersections
    const crossZ = Math.round(pos.z / 30) * 30;
    if (Math.abs(pos.z - crossZ) < 1 && Math.random() < 0.02) {
      // Random turn
      const turn = Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
      dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), turn);
      car.mesh.rotation.y = Math.atan2(dir.x, dir.z);
    }
    
    // Despawn if too far
    const cam = window._cam || camera;
    if (cam && pos.distanceTo(cam.position) > 200) {
      // Respawn near camera
      const angle = Math.random() * Math.PI * 2;
      pos.set(cam.position.x + Math.cos(angle) * 80, 0, cam.position.z + Math.sin(angle) * 80);
      pos.y = _getTerrainY(pos.x, pos.z) + 0.1;
    }
  }
}





// === SMART TRAFFIC AI SYSTEM (v228) ===
window._trafficCars = window._trafficCars || [];
window._trafficLights = window._trafficLights || [];
window._stopLines = [];

const TRAFFIC_CAR_MODELS = [
  'kenney_cars/sedan', 'kenney_cars/sedan-sports', 'kenney_cars/suv', 
  'kenney_cars/suv-luxury', 'kenney_cars/taxi', 'kenney_cars/police',
  'kenney_cars/hatchback-sports', 'kenney_cars/van', 'kenney_cars/truck',
  'kenney_cars/ambulance', 'kenney_cars/delivery'
];

const TRAFFIC_CAR_COLORS = [0xcc3333, 0x3333cc, 0x33cc33, 0xcccc33, 0x333333, 0xffffff, 0x666666, 0xcc6633, 0x663399];

function spawnTrafficCar(roadX, roadZ, dir, laneOffset) {
  const carModel = TRAFFIC_CAR_MODELS[Math.floor(Math.random() * TRAFFIC_CAR_MODELS.length)];
  const carColor = TRAFFIC_CAR_COLORS[Math.floor(Math.random() * TRAFFIC_CAR_COLORS.length)];
  
  // Load GLB car
  const modelPath = '/models/' + carModel + '.glb';
  const loader = window._gltfLoader || new THREE.GLTFLoader();
  
  loader.load(modelPath, (gltf) => {
    const car = gltf.scene;
    car.scale.setScalar(2.8); // Kenney cars need upscaling to match world
    
    // Position on road lane
    const lx = roadX + laneOffset;
    car.position.set(lx, 0.05, roadZ);
    car.rotation.y = Math.atan2(dir.x, dir.z);
    
    // Tint car color
    car.traverse(child => {
      if (child.isMesh && child.material) {
        const mat = child.material.clone();
        if (Math.random() < 0.5) mat.color.setHex(carColor);
        child.material = mat;
      }
    });
    
    scene.add(car);
    objects.push(car);
    
    const carData = {
      mesh: car,
      speed: 5 + Math.random() * 8, // 5-13 m/s (18-47 km/h city speed)
      maxSpeed: 5 + Math.random() * 8,
      direction: dir.clone(),
      lane: laneOffset,
      roadAxis: Math.abs(dir.x) > Math.abs(dir.z) ? 'x' : 'z',
      stopped: false,
      stopTimer: 0,
      brakingDistance: 8,
      turnCooldown: 0,
      // Headlights
      headlightL: null, headlightR: null,
      // Taillights
      taillightL: null, taillightR: null,
    };
    
    // Add headlights
    const hlGeo = new THREE.SphereGeometry(0.08, 4, 4);
    const hlMat = new THREE.MeshBasicMaterial({ color: 0xffffcc });
    const tlMat = new THREE.MeshBasicMaterial({ color: 0xff2200 });
    
    const hlL = new THREE.Mesh(hlGeo, hlMat);
    const hlR = new THREE.Mesh(hlGeo, hlMat);
    hlL.position.set(-0.4, 0.5, 0.9);
    hlR.position.set(0.4, 0.5, 0.9);
    car.add(hlL); car.add(hlR);
    
    const tlL = new THREE.Mesh(hlGeo, tlMat);
    const tlR = new THREE.Mesh(hlGeo, tlMat);
    tlL.position.set(-0.4, 0.5, -0.9);
    tlR.position.set(0.4, 0.5, -0.9);
    car.add(tlL); car.add(tlR);
    
    carData.headlightL = hlL;
    carData.headlightR = hlR;
    carData.taillightL = tlL;
    carData.taillightR = tlR;
    
    window._trafficCars.push(carData);
  }, undefined, (err) => {
    // Fallback to box car if model fails
    const geo = new THREE.BoxGeometry(1.8, 1.2, 3.5);
    const mat = new THREE.MeshStandardMaterial({ color: carColor, roughness: 0.3, metalness: 0.6 });
    const car = new THREE.Mesh(geo, mat);
    car.position.set(roadX + laneOffset, 0.6, roadZ);
    car.rotation.y = Math.atan2(dir.x, dir.z);
    scene.add(car);
    objects.push(car);
    window._trafficCars.push({ mesh: car, speed: 6 + Math.random() * 6, maxSpeed: 12, direction: dir.clone(), lane: laneOffset, roadAxis: 'z', stopped: false, stopTimer: 0, brakingDistance: 8, turnCooldown: 0 });
  });
}

function updateSmartTraffic(dt) {
  if (!window._trafficCars) return;
  
  const playerPos = window._characterController ? 
    (window._characterController.position || window._characterController.model?.position) : null;
  
  for (let i = window._trafficCars.length - 1; i >= 0; i--) {
    const car = window._trafficCars[i];
    if (!car.mesh || !car.mesh.parent) { window._trafficCars.splice(i, 1); continue; }
    
    const pos = car.mesh.position;
    let shouldStop = false;
    let brakePower = 0;
    
    // 1. CHECK FOR OTHER CARS AHEAD (collision avoidance)
    for (const other of window._trafficCars) {
      if (other === car || !other.mesh) continue;
      const toOther = new THREE.Vector3().subVectors(other.mesh.position, pos);
      const forward = car.direction.clone();
      const dot = toOther.normalize().dot(forward);
      const dist = pos.distanceTo(other.mesh.position);
      
      if (dot > 0.7 && dist < car.brakingDistance) {
        shouldStop = true;
        brakePower = Math.max(brakePower, 1 - dist / car.brakingDistance);
      }
    }
    
    // 2. CHECK FOR PEDESTRIANS (NPCs) CROSSING
    if (typeof npcController !== 'undefined' && npcController.npcs) {
      for (const npc of npcController.npcs) {
        if (!npc.model) continue;
        const npcPos = npc.model.position;
        const toNPC = new THREE.Vector3().subVectors(npcPos, pos);
        const forward = car.direction.clone();
        const dot = toNPC.normalize().dot(forward);
        const dist = pos.distanceTo(npcPos);
        
        if (dot > 0.5 && dist < 6) {
          shouldStop = true;
          brakePower = Math.max(brakePower, 1 - dist / 6);
        }
      }
    }
    
    // 3. CHECK FOR PLAYER
    if (playerPos) {
      const toPlayer = new THREE.Vector3().subVectors(playerPos, pos);
      const forward = car.direction.clone();
      const dot = toPlayer.normalize().dot(forward);
      const dist = pos.distanceTo(playerPos);
      
      if (dot > 0.5 && dist < 7) {
        shouldStop = true;
        brakePower = Math.max(brakePower, 1 - dist / 7);
      }
    }
    
    // 4. STOP AT INTERSECTIONS (every 30 units on both axes)
    const crossX = Math.round(pos.x / 30) * 30;
    const crossZ = Math.round(pos.z / 30) * 30;
    const distToIntersectionX = Math.abs(pos.x - crossX);
    const distToIntersectionZ = Math.abs(pos.z - crossZ);
    const nearIntersection = (distToIntersectionX < 8 && distToIntersectionZ < 8);
    
    // Simple traffic light logic: alternate every 8 seconds
    const lightPhase = Math.floor(Date.now() / 8000) % 2;
    const carOnXRoad = car.roadAxis === 'x';
    const redLight = nearIntersection && ((carOnXRoad && lightPhase === 1) || (!carOnXRoad && lightPhase === 0));
    
    if (redLight && ((car.roadAxis === 'z' && distToIntersectionZ > 3 && distToIntersectionZ < 8) ||
                     (car.roadAxis === 'x' && distToIntersectionX > 3 && distToIntersectionX < 8))) {
      shouldStop = true;
      brakePower = Math.max(brakePower, 0.9);
    }
    
    // 5. APPLY SPEED
    if (shouldStop) {
      car.speed = Math.max(0, car.speed - car.maxSpeed * brakePower * dt * 3);
      // Taillights brighter when braking
      if (car.taillightL) car.taillightL.material.emissiveIntensity = 2;
      if (car.taillightR) car.taillightR.material.emissiveIntensity = 2;
    } else {
      car.speed = Math.min(car.maxSpeed, car.speed + car.maxSpeed * dt * 2);
      if (car.taillightL) car.taillightL.material.emissiveIntensity = 0.5;
    }
    
    // 6. MOVE
    if (car.speed > 0.1) {
      pos.addScaledVector(car.direction, car.speed * dt);
      car.mesh.rotation.y = Math.atan2(car.direction.x, car.direction.z);
    }
    
    // 7. TURN AT INTERSECTIONS (random chance)
    car.turnCooldown = Math.max(0, (car.turnCooldown || 0) - dt);
    if (nearIntersection && distToIntersectionX < 2 && distToIntersectionZ < 2 && car.turnCooldown <= 0 && Math.random() < 0.03) {
      const turn = Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
      car.direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), turn);
      car.direction.normalize();
      car.roadAxis = Math.abs(car.direction.x) > Math.abs(car.direction.z) ? 'x' : 'z';
      car.turnCooldown = 5;
    }
    
    // 8. SNAP TO ROAD Y
    const ty = (typeof _getTerrainY === 'function') ? _getTerrainY(pos.x, pos.z) : 0;
    if (ty > -0.1) pos.y = ty + 0.05;
    
    // 9. HEADLIGHTS at night
    const isNight = window._dayTime !== undefined ? (window._dayTime < 6 || window._dayTime > 18) : false;
    if (car.headlightL) {
      car.headlightL.visible = isNight;
      car.headlightR.visible = isNight;
    }
    
    // 10. DESPAWN / RESPAWN if too far from camera
    const cam = window._cam || camera;
    if (cam && pos.distanceTo(cam.position) > 150) {
      // Respawn on a road near camera
      const angle = Math.random() * Math.PI * 2;
      const spawnDist = 60 + Math.random() * 30;
      const nx = cam.position.x + Math.cos(angle) * spawnDist;
      const nz = cam.position.z + Math.sin(angle) * spawnDist;
      // Snap to nearest road (roads at multiples of 30 offset by lane)
      const nearestRoadX = Math.round(nx / 30) * 30;
      const nearestRoadZ = Math.round(nz / 30) * 30;
      const useX = Math.abs(nx - nearestRoadX) < Math.abs(nz - nearestRoadZ);
      if (useX) {
        pos.set(nearestRoadX + car.lane, 0.05, nz);
        car.direction.set(0, 0, Math.random() < 0.5 ? 1 : -1);
      } else {
        pos.set(nx, 0.05, nearestRoadZ + car.lane);
        car.direction.set(Math.random() < 0.5 ? 1 : -1, 0, 0);
      }
      car.roadAxis = Math.abs(car.direction.x) > Math.abs(car.direction.z) ? 'x' : 'z';
      car.speed = car.maxSpeed * 0.5;
    }
  }
}
window.updateSmartTraffic = updateSmartTraffic;
window.spawnTrafficCar = spawnTrafficCar;



// === BUILDING PLACEMENT HELPER — avoid roads ===
function snapBuildingOffRoad(x, z) {
  // Main avenue at x=0, ±30
  // Cross streets at z=-40, 40, 120
  const roadHalf = 8; // half road + sidewalk width to keep buildings off
  
  // Check main avenue
  if (Math.abs(x) < roadHalf) x = (x >= 0 ? 1 : -1) * (roadHalf + 2);
  
  // Check secondary avenues  
  for (const ax of [-30, 30]) {
    if (Math.abs(x - ax) < roadHalf) x = ax + (x >= ax ? 1 : -1) * (roadHalf + 2);
  }
  
  // Check cross streets
  for (const cz of [-40, 40, 120]) {
    if (Math.abs(z - cz) < roadHalf) z = cz + (z >= cz ? 1 : -1) * (roadHalf + 2);
  }
  
  return { x, z };
}
window.snapBuildingOffRoad = snapBuildingOffRoad;

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  const t = clock.getElapsedTime();
  
  // Rebuild collision octree if dirty (after object placement)
  collisionWorld.updateIfDirty();
  
  // === AUTO-QUALITY SCALING ===
  if (!window._fpsHistory) window._fpsHistory = [];
  if (!window._lastFpsCheck) window._lastFpsCheck = performance.now();
  window._fpsHistory.push(dt);
  if (window._fpsHistory.length > 120) window._fpsHistory.shift();
  if (performance.now() - window._lastFpsCheck > 5000) {
    window._lastFpsCheck = performance.now();
    const avgDt = window._fpsHistory.reduce((a,b)=>a+b,0) / window._fpsHistory.length;
    const avgFps = 1 / avgDt;
    if (avgFps < 30 && !window._autoReducedQuality) {
      window._autoReducedQuality = true;
      // Reduce quality
      renderer.setPixelRatio(1.0);
      if (rainParticles && rainParticles.geometry.attributes.position.count > 3000) {
        // Cut rain particles in half
        scene.remove(rainParticles);
        rainParticles = null;
        setWeather('rain'); // Will recreate with current settings
      }
      console.log('[AutoQuality] FPS dropped to ' + avgFps.toFixed(0) + ', reducing quality');
    }
  }
  // FPS counter display (toggle with ` key)
  if (!window._fpsEl) {
    window._fpsEl = document.createElement('div');
    window._fpsEl.id = 'fps-counter';
    window._fpsEl.style.cssText = 'position:fixed;top:4px;left:4px;color:rgba(255,255,255,0.4);font-size:10px;font-family:monospace;z-index:99999;pointer-events:none;display:none;';
    document.body.appendChild(window._fpsEl);
    document.addEventListener('keydown', e => { if (e.key === '`') window._fpsEl.style.display = window._fpsEl.style.display === 'none' ? 'block' : 'none'; });
  }
  if (window._fpsEl.style.display !== 'none') {
    const fps = 1 / Math.max(dt, 0.001);
    const col = fps > 55 ? '#4ade80' : fps > 30 ? '#f59e0b' : '#ef4444';
    window._fpsEl.innerHTML = '<span style="color:' + col + '">' + fps.toFixed(0) + ' FPS</span> | ' + objects.length + ' obj | ' + (npcController ? npcController.npcs.length : 0) + ' npc | ' + renderer.info.render.triangles + ' tri';
  updateSmartTraffic(dt);

  // Minimap render
  if (window._minimapOn && window._minimapCtx && window._minimapCanvas) {
    const ctx = window._minimapCtx;
    const mc = window._minimapCanvas;
    const sz = mc.width;
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, sz, sz);
    // Clip to circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(sz/2, sz/2, sz/2 - 2, 0, Math.PI*2);
    ctx.clip();
    
    const player = window._characterController;
    const pp = player ? (player.position || player.model?.position) : null;
    const px = pp ? pp.x : 0;
    const pz = pp ? pp.z : 0;
    const scale = 2; // pixels per unit
    
    // Draw objects
    for (const obj of objects) {
      const ox = (obj.position.x - px) * scale + sz/2;
      const oz = (obj.position.z - pz) * scale + sz/2;
      if (ox < -10 || ox > sz+10 || oz < -10 || oz > sz+10) continue;
      const isRoad = obj.userData?.name?.includes('Road');
      const isBuilding = obj.userData?.name?.includes('Building') || obj.userData?.name?.includes('House') || obj.userData?.name?.includes('Shop');
      const isNPC = false;
      ctx.fillStyle = isRoad ? '#333' : isBuilding ? '#555' : '#444';
      ctx.fillRect(ox-1, oz-1, 3, 3);
    }
    
    // Draw NPCs
    if (npcController) {
      for (const npc of npcController.npcs) {
        const nx = (npc.model.position.x - px) * scale + sz/2;
        const nz = (npc.model.position.z - pz) * scale + sz/2;
        if (nx < 0 || nx > sz || nz < 0 || nz > sz) continue;
        ctx.fillStyle = npc.behavior === 'aggro' ? '#f44' : '#4f4';
        ctx.fillRect(nx-2, nz-2, 4, 4);
      }
    }
    
    // Player dot (center)
    ctx.fillStyle = '#4af';
    ctx.beginPath();
    ctx.arc(sz/2, sz/2, 4, 0, Math.PI*2);
    ctx.fill();
    
    // Player direction arrow
    if (player && player.model) {
      const angle = player.model.rotation.y;
      ctx.strokeStyle = '#4af';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sz/2, sz/2);
      ctx.lineTo(sz/2 + Math.sin(angle)*12, sz/2 - Math.cos(angle)*12);
      ctx.stroke();
    }
    
    ctx.restore();
    // Circle border
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sz/2, sz/2, sz/2 - 1, 0, Math.PI*2);
    ctx.stroke();
  }

  }


  if (window._godmode) window._godmode.updateBehaviors(dt, t);
  if (window._sound && window._sound.updateMusic) { window._sound.updateMusic(dt); } if (window._sound && window._sound.updateAmbient) { window._sound.updateAmbient(dt, window._currentBiome || 'peaceful'); }
  if (window._updateAmbientOneShots) window._updateAmbientOneShots(dt);
  updateDayNightCycle(dt); updateHealthRegen(dt);
  updateDebris(dt);
  updatePickups(dt, t);
  updateGrapple(dt);
  updateSlide(dt);
  updateInteractionPrompt();
  updateCompass();
  updateClouds(dt);
  if (window._grassSystem) window._grassSystem.update(dt);
  updateCoordDisplay(); recordReplayFrame();
  updateHighlight();
  if (!playMode) controls.update();
  if (window._updateEditorCamera) window._updateEditorCamera(dt);
  if (window._updateShadowCascades) window._updateShadowCascades();
  updateAmbientParticles(clock.getDelta() || 0.016, camera.position);
  if (activeVehicle) { updateVehicle(dt); updateVehiclePrompt(); if (activeVehicle) updateVehicleHUD(activeVehicle);
  // Swimming/buoyancy — keep player above water
  const _waterLevel = -0.1; // Just above ocean surface at -0.3
  if (playMode && !activeVehicle) {
    const playerY = characterController ? characterController.position.y : camera.position.y;
    if (playerY < _waterLevel) {
      // Push player up to water surface (buoyancy)
      if (characterController) {
        characterController.position.y = THREE.MathUtils.lerp(characterController.position.y, _waterLevel, 0.1);
        if (characterController.model) characterController.position.y = characterController.position.y;
      } else {
        camera.position.y = THREE.MathUtils.lerp(camera.position.y, _waterLevel + 1.5, 0.1);
      }
    }
  }
  // NPC buoyancy — NPCs float on water too
  if (typeof npcController !== 'undefined' && npcController.npcs) {
    for (const npc of npcController.npcs) {
      if (npc.model && npc.model.position.y < _waterLevel) {
        npc.model.position.y = THREE.MathUtils.lerp(npc.model.position.y, _waterLevel, 0.05);
      }
    }
  }
  // Combat & UI systems
  if (typeof window._updateCombat === 'function') window._updateCombat(dt);
  if (typeof window._updateMiniMap === 'function') window._updateMiniMap(); }
      if (shooterMode) { updateBullets(dt); updateShooterHUD(); }
    updateWaterAnimation(performance.now() * 0.001);
  updateUserScripts(dt);
  
  // Weather follows camera for full-scene coverage
  const _wcam = playMode && characterController && characterController.model ? characterController.position : camera.position;
  if (rainParticles) {
    rainParticles.position.x = _wcam.x;
    rainParticles.position.z = _wcam.z;
    const p = rainParticles.geometry.attributes.position.array;
    const _windX = weatherSystem === 'storm' ? 8 : 2; for (let i=0;i<p.length;i+=3) { p[i+1]-=22*dt; p[i]+=_windX*dt; if(p[i+1]<-2||p[i]>75){p[i+1]=20+Math.random()*8;p[i]=(Math.random()-0.5)*150;p[i+2]=(Math.random()-0.5)*150;} }
    rainParticles.geometry.attributes.position.needsUpdate=true;
  }
  updateLightning(dt, weatherSystem);
  updateNightLighting(t);
  // updateDrivingCars replaced by updateSmartTraffic
  if (window._cityCarUpdate) window._cityCarUpdate(dt);
  if (snowParticles) {
    snowParticles.position.x = _wcam.x;
    snowParticles.position.z = _wcam.z;
    const p = snowParticles.geometry.attributes.position.array;
    for (let i=0;i<p.length;i+=3) { p[i+1]-=1.5*dt; p[i]+=Math.sin(t+i*0.01)*0.3*dt; if(p[i+1]<-2){p[i+1]=18+Math.random()*6;p[i]=(Math.random()-0.5)*150;p[i+2]=(Math.random()-0.5)*150;} }
    snowParticles.geometry.attributes.position.needsUpdate=true;
  }

  // Update particle effects
  // Update particles every other frame
  if (!window._particleSkip) updateParticleEffects(0.016);
  window._particleSkip = !window._particleSkip;
  
  // Water wave (every 3rd frame)
  window._waterFrame = (window._waterFrame || 0) + 1;
  if (window._waterFrame % 3 === 0) {
    for (let wi = 0; wi < objects.length; wi++) {
      const o = objects[wi];
      if (o.userData.isWater) {
        const p = o.geometry.attributes.position;
        for (let i=0;i<p.count;i++) {
          const x=p.getX(i), y=p.getY(i);
          p.setZ(i, Math.sin(x*0.5+t*2)*0.1 + Math.cos(y*0.3+t*1.5)*0.08);
        }
        p.needsUpdate=true; o.geometry.computeVertexNormals();
      }
    }
  }
  
  if (sunMesh) { sunMesh.position.copy(sunLight.position); }
  // === RAPIER PHYSICS STEP ===
  if (window._physicsEnabled && physics.isReady()) physics.step(dt);

  // === DISTANCE-BASED SHADOW CULLING (LOD) — saves GPU on large scenes ===
  if (!window._shadowCullFrame) window._shadowCullFrame = 0;
  if (++window._shadowCullFrame % 30 === 0) {
    const _camP = camera.position;
    for (let _i = 0; _i < objects.length; _i++) {
      const _o = objects[_i];
      if (!_o.userData.isGLB) continue;
      const _d = _camP.distanceTo(_o.position);
      const _castShadow = _d < 80;
      _o.traverse(c => { if (c.isMesh) c.castShadow = _castShadow; });
    }
  }

  // Update animations
  animationMixers.forEach(mixer => mixer.update(dt));
  // Update multiplayer peer interpolation
  if (window._mp && window._mp.connected) window._mp.update(dt);
  // Play mode + triggers
  if (playMode && characterController && characterController.model) {
    // === DEMO AUTO-PLAY ===
    if (window._demoMode && characterController) {
      window._demoTime = (window._demoTime || 0) + dt;
      var dT = window._demoTime;
      var cc = characterController;
      
      // Reset all keys each frame, then set what we need
      cc.keys['w'] = false;
      cc.keys['s'] = false;
      cc.keys['a'] = false;
      cc.keys['d'] = false;
      cc.keys['e'] = false;
      cc.keys['q'] = false;
      cc.keys['shift'] = false;
      
      // Find nearest alive enemy
      var nearestEnemy = null;
      var nearestDist = 999;
      if (npcController) {
        for (var npc of npcController.npcs) {
          if (npc.isDead) continue;
          if (!npc.model) continue;
          var d = cc.position.distanceTo(npc.model.position);
          if (d < nearestDist) { nearestDist = d; nearestEnemy = npc; }
        }
      }
      
      // Find nearest collectible
      var nearestItem = null;
      var nearestItemDist = 999;
      for (var obj of objects) {
        if (!obj.userData.name) continue;
        var n = obj.userData.name.toLowerCase();
        if (n.includes('pickup') || n.includes('collectible') || n.includes('lootbox') || n.includes('heart') || n.includes('gear') || n.includes('board')) {
          var dd = cc.position.distanceTo(obj.position);
          if (dd < nearestItemDist) { nearestItemDist = dd; nearestItem = obj; }
        }
      }
      
      // AI Decision tree
      var target = null;
      var shouldAttack = false;
      var shouldRun = false;
      
      if (nearestEnemy && nearestDist < 4) {
        // Close to enemy — FIGHT
        target = nearestEnemy.model.position.clone();
        if (nearestDist < 2.5) {
          shouldAttack = true;
        }
      } else if (nearestItem && nearestItemDist < 12) {
        // Grab nearby item
        target = nearestItem.position.clone();
        shouldRun = true;
      } else if (nearestEnemy) {
        // Chase enemy
        target = nearestEnemy.model.position.clone();
        shouldRun = true;
      } else {
        // Patrol in a circle
        target = new THREE.Vector3(Math.sin(dT * 0.4) * 10, 0, Math.cos(dT * 0.4) * 10);
      }
      
      if (target) {
        var dir = new THREE.Vector3().subVectors(target, cc.position);
        dir.y = 0;
        var dist = dir.length();
        
        if (dist > 0.8) {
          dir.normalize();
          // Face the target
          cc.rotation = Math.atan2(dir.x, dir.z);
          // Move forward
          cc.keys['w'] = true;
          if (shouldRun) {
            cc.isRunning = true;
            cc.keys['shift'] = true;
          }
        }
        
        // Camera follows behind character smoothly
        var camAngle = cc.rotation + Math.PI;
        cc.cameraYaw += (camAngle - cc.cameraYaw) * 3 * dt;
      }
      
      // Attack when in range — 3 punch combo
      if (shouldAttack) {
        // Face enemy
        if (nearestEnemy) {
          var eDir = new THREE.Vector3().subVectors(nearestEnemy.model.position, cc.position);
          eDir.y = 0;
          cc.rotation = Math.atan2(eDir.x, eDir.z);
          // Step closer during combo
          if (nearestDist > 1.5) cc.keys['w'] = true;
        }
        // 3-hit combo: E E E with 0.5s between hits, then 1s pause before next combo
        window._demoComboHit = window._demoComboHit || 0;
        window._demoAtkTimer = window._demoAtkTimer || 0;
        window._demoAtkTimer -= dt;
        if (window._demoAtkTimer <= 0) {
          window._demoComboHit++;
          cc.keys['e'] = true;
          if (window._demoComboHit >= 3) {
            // Combo finished — pause before next
            window._demoComboHit = 0;
            window._demoAtkTimer = 1.2;
          } else {
            // Next hit in combo
            window._demoAtkTimer = 0.45;
          }
        }
      } else {
        window._demoComboHit = 0;
      }
      
      // Health floor so character never dies + slow regen
      if (cc.health < 30) cc.health = 30;
      if (cc.health < cc.maxHealth) cc.health = Math.min(cc.maxHealth, cc.health + dt * 3);
      
      // Auto-collect items
      for (var ci = objects.length - 1; ci >= 0; ci--) {
        var cObj = objects[ci];
        if (!cObj.userData.name) continue;
        var cn = cObj.userData.name.toLowerCase();
        if ((cn.includes('pickup') || cn.includes('collectible') || cn.includes('heart') || cn.includes('gear') || cn.includes('board') || cn.includes('lootbox')) && cc.position.distanceTo(cObj.position) < 2.5) {
          gameScore += 50;
          scene.remove(cObj);
          objects.splice(ci, 1);
          if (cn.includes('health') || cn.includes('heart')) {
            cc.health = Math.min(cc.maxHealth, cc.health + 50);
            showNotification('❤️ +50 HP!');
          } else {
            showNotification('⭐ +50 points!');
          }
          updateHUD();
        }
      }
    }
    
    // Demo mode: force character to ground (no floating/jumping)
    if (window._demoMode && characterController) {
      characterController.position.y = 0;
      characterController.isGrounded = true;
      characterController.jumpVelocity = 0;
    }
    if (window._gamepad) window._gamepad.update();
    if (window._updateLOD) window._updateLOD(camera.position);
    if (characterController) characterController.update(dt);
    if (npcController && characterController) {
      // Zone-based aggro — NPCs only engage when player enters their zone
      const playerPos = characterController.position;
      const aggroRange = 18; // Distance to trigger aggro
      const maxSimultaneousAttackers = 2; // Only 1-2 attack at once
      let currentAttackers = 0;
      
      for (const npc of npcController.npcs) {
        if (npc.isDead || !npc.model) continue;
        const distToPlayer = npc.model.position.distanceTo(playerPos);
        
        // Zone guard behavior — only aggro when player enters zone
        if (npc.behavior === 'zone_guard') {
          if (distToPlayer < aggroRange) {
            npc.isAggro = true;
            npc.aggroTarget = playerPos.clone();
          } else {
            npc.isAggro = false;
            npc.aggroTarget = null;
          }
        } else if (npc.isAggro && characterController.model) {
          npc.aggroTarget = playerPos.clone();
        }
        
        // Count active attackers (in attack range)
        if (npc.isAggro && distToPlayer < npc.attackRange) {
          currentAttackers++;
        }
      }
      
      // NPC attacks now handled by NPCAIStateMachine in character.mjs
      npcController.update(dt);
      npcController.updateHealthBarFacing(camera);
    }
    // Combat hit detection
    if (characterController && characterController._attackHitFrame && npcController) {
      const beforeCount = npcController.npcs.filter(n => n.isDead).length;
      characterController.checkAttackHit(npcController);
      const afterCount = npcController.npcs.filter(n => n.isDead).length;
      const kills = afterCount - beforeCount;
      if (kills > 0) {
        gameScore += kills * 100;
        if (levelSystem) levelSystem.addXP(kills * 30);
        // Kill feed
        if (window._killFeed) {
          for (let k = 0; k < kills; k++) window._killFeed('☠️ Enemy eliminated +100');
        }
        // Kill message
        msg = document.getElementById('pickup-msg');
        if (!msg) {
          msg = document.createElement('div');
          msg.id = 'pickup-msg';
          msg.style.cssText = 'position:fixed;top:40%;left:50%;transform:translateX(-50%);color:#ff4444;font-size:28px;font-family:monospace;z-index:9999;pointer-events:none;transition:opacity 0.5s;text-shadow:0 0 10px #ff0000;';
          document.body.appendChild(msg);
        }
        msg.textContent = '💀 KILL! +' + (kills * 100) + ' pts';
        const completedQuests = questSystem.progress('kill', kills);
        completedQuests.forEach(q => questSystem.showCompletion(q));
        msg.style.opacity = '1';
        msg.style.color = '#ff4444';
        setTimeout(() => { msg.style.opacity = '0'; }, 1500);
      }
    }
    // Pickup detection
    const pickup = characterController.checkPickups(objects, scene);
    if (pickup) {
      if (pickup.includes('Score')) gameScore += 50;
      if (pickup.includes('Equipped')) gameScore += 10;
      // Check if it was a material pickup
      if (pickup.includes('material:')) {
        const parts = pickup.match(/material:(\w+):(\d+)/);
        if (parts && craftingSystem) craftingSystem.addMaterial(parts[1], parseInt(parts[2]));
      }
      // Flash pickup message
      msg = document.getElementById('pickup-msg');
      if (!msg) {
        msg = document.createElement('div');
        msg.id = 'pickup-msg';
        msg.style.cssText = 'position:fixed;top:40%;left:50%;transform:translateX(-50%);color:#f59e0b;font-size:24px;font-family:monospace;z-index:9999;pointer-events:none;transition:opacity 0.5s;';
        document.body.appendChild(msg);
      }
      msg.textContent = pickup;
      msg.style.opacity = '1';
      setTimeout(() => { msg.style.opacity = '0'; }, 1500);
    }
    // Floating pickup animation
    objects.forEach(o => {
      if (o.userData.isPickup && o.userData.baseY !== undefined) {
        o.position.y = o.userData.baseY + Math.sin(t * 3) * 0.2;
        o.rotation.y += dt * 2;
      }
    });
    // Update minimap
    if (minimap) minimap.update(npcController ? npcController.npcs : []);
    if (gameHUD) {
      gameHUD.style.display = 'block';
      updateGameHUD(characterController, gameScore);
    }
  } else {
    updatePlayMode(dt);
    if (gameHUD) gameHUD.style.display = 'none';
    if (minimap) minimap.el.style.display = 'none';
    const xpBar = document.getElementById('xp-bar-container');
    if (xpBar) xpBar.style.display = 'none';
  }
  // Update procedural animations
  for (let pi = 0; pi < objects.length; pi++) {
    const po = objects[pi];
    if (po.userData._procAnim) {
      po.userData._procAnim.fn(po, t, dt);
    }
  }
  updateTriggers();
    updateVehiclePrompt();
  updateHUD();
  // NPC update — runs ALWAYS (editor + play mode)
  const _nc = npcController || window.npcController;
  if (_nc) { _nc.update(dt); _nc.updateHealthBarFacing(camera); }
  // If character model was deleted, switch to camera-only mode
  if (characterController && !characterController.model && !characterController._cameraOnlyMode && playMode) {
    characterController._cameraOnlyMode = true;
    try { controls.enabled = true; } catch(e) {}
    showToast('📷 Character removed — camera mode');
  }
  // Hard floor — prevent character from falling through world
  if (characterController && characterController.position && characterController.position.y < -2) {
    characterController.position.y = 2;
    if (characterController.collider && characterController.collider.teleport) {
      characterController.collider.teleport(characterController.position.x, 2, characterController.position.z);
    }
    characterController.jumpVelocity = 0;
    characterController.isGrounded = true;
  }

  if (ppEnabled && composer && !window._composerDisabled) {
      if (window._colorPass) window._colorPass.uniforms.time.value = performance.now() * 0.001;
      composer.render();
    } else {
      if (window._updateDoors) window._updateDoors(1/60);
      renderer.render(scene, camera);
    }
  // Render FPS weapon viewmodel on top (ALWAYS after main render)
  if (characterController && characterController.renderFPWeapon) {
    characterController.renderFPWeapon(renderer);
  }
}
animate();

// Signal engine is ready
// Expose command runner for auto-demo

// ============================================================================
// ENGINE BRIDGE — Exposes internals for Action API (Phase 2)
// ============================================================================
window._engineBridge = {
  // Asset system
  loadAssetCatalog: _loadAssetCatalog,
  loadGLBModel: loadGLBModel,
  showGallery: showGallery,
  showCategoryPicker: showCategoryPicker,
  searchModels: searchModels,
  
  // Scene
  get scene() { return scene; },
  get objects() { return objects; },
  get camera() { return camera; },
  clearScene() {
    while (objects.length) {
      const obj = objects.pop();
      scene.remove(obj);
    }
    sceneHistory.length = 0;
    if (window._waterZones) window._waterZones.length = 0;
    if (typeof clearDrivingCars === 'function') clearDrivingCars();
  },
  removeObject(obj) {
    const idx = objects.indexOf(obj);
    if (idx > -1) objects.splice(idx, 1);
    scene.remove(obj);
  },
  getSelected() { return selectedObject; },
  
  // Player
  enterPlayMode: enterPlayMode,
  exitPlayMode: exitPlayMode,
  get characterController() { return characterController; },
  
  // World building (calls the existing template system)
  async buildWorld(templateName) {
    return await execSingle('generate ' + templateName);
  },
  
  // Character
  async setCharacter(id) {
    return await execSingle('play as ' + id);
  },
  
  // Weapons
  equipWeapon(weaponId, slot) {
    if (characterController && characterController.equipWeapon) {
      return characterController.equipWeapon(weaponId, slot);
    }
    return null;
  },
  
  // NPCs
  async spawnNPCs(type, count, hostile, position) {
    const cmd = hostile ? `spawn ${count} hostile npcs` : `spawn ${count} npcs`;
    return await execSingle(cmd);
  },
  
  // Water
  setWaterPreset(preset) {
    // Find ocean in scene
    const ocean = objects.find(o => o.userData && o.userData.isGerstnerWater);
    if (!ocean) {
      // Create ocean first, then apply preset
      execSingle('add ocean');
      window._pendingWaterPreset = preset;
      return '🌊 Creating ocean with ' + preset + ' preset';
    }
    const p = typeof WATER_PRESETS !== 'undefined' ? WATER_PRESETS[preset] : null;
    if (p && ocean.material && ocean.material.uniforms) {
      const u = ocean.material.uniforms;
      if (p.waveA) u.waveA.value.set(...p.waveA);
      if (p.waveB) u.waveB.value.set(...p.waveB);
      if (p.waveC) u.waveC.value.set(...p.waveC);
      if (p.waterColor) u.waterColor.value.setHex(p.waterColor);
      if (p.deepColor) u.deepColor.value.setHex(p.deepColor);
      if (p.foamIntensity !== undefined) u.foamIntensity.value = p.foamIntensity;
      if (p.specularPower !== undefined) u.specularPower.value = p.specularPower;
      if (p.fresnelPower !== undefined) u.fresnelPower.value = p.fresnelPower;
      if (p.opacity !== undefined) u.opacity.value = p.opacity;
      return '🌊 Water preset: ' + preset;
    }
    return null;
  },
  
  // Terrain
  async setTerrain(type, options) {
    return await execSingle('terrain ' + type);
  },
  
  // Weather
  async setWeather(type) {
    if (type === 'clear') { setWeather(null); scene.fog = null; return '☀️ Weather cleared'; }
    if (type === 'storm') { setWeather('storm'); return '⛈️ Thunderstorm!'; }
    if (type === 'rain') { setWeather('rain'); return '🌧️ Rain started'; }
    if (type === 'snow') { setWeather('snow'); return '❄️ Snow started'; }
    if (type === 'overcast') { scene.fog = new THREE.FogExp2(0x888899, 0.004); return '☁️ Overcast'; }
    return await execSingle(type);
  },
  
  // Time
  async setTime(time) {
    return await execSingle('time ' + time);
  },
  
  // Interior
  async addInterior(type, options) {
    const floors = (options && options.floors) || 1;
    let obj;
    if (type === 'shop') obj = createInteriorShop();
    else if (type === 'tavern') obj = createInteriorTavern();
    else obj = createInteriorHouse({ floors });
    
    // Position in front of camera
    const px = camera.position.x + Math.sin(camera.rotation.y) * 10;
    const pz = camera.position.z + Math.cos(camera.rotation.y) * 10;
    addObj(obj.userData.name || 'Interior', obj, px, pz);
    return '🏠 Interior ' + type + ' created!' + (floors > 1 ? ' (' + floors + ' floors with stairs)' : ' Walk inside through the front door.');
  },
  
  // Help
  showHelp: showHelp,
  showGenerator: showGeneratorModal,
  showGameModes: showGameModesModal,
  showMeshyKey: showMeshyKeyModal,
  
  // Inventory
  async toggleInventory() {
    return await execSingle('inventory');
  },
  
  // Save/Load
  async save(name) {
    return await execSingle(name ? 'save ' + name : 'save');
  },
  async load() {
    return await execSingle('load');
  },
  
  // Legacy fallback
  parseAndExecute: parseAndExecute,
  execSingle: execSingle,
};

// Import and init the new interpreter
import('./interpreter.mjs').then(({ interpret, COMMANDS_SHOWCASE }) => {
  window._interpret = interpret;
  window._COMMANDS_SHOWCASE = COMMANDS_SHOWCASE;
  
  // Wrap _runCommand to use interpreter first
  const _origRunCommand = window._runCommand;
  window._runCommand = async function(cmd) {
    const intent = interpret(cmd);
    const bridge = window._engineBridge;
    
    // Execute based on intent
    result = null;
    try {
      // execRaw = pass directly to parseAndExecute (specific structures, etc.)
      if (intent.action === 'execRaw') {
        result = await bridge.execSingle(cmd);
        if (result) addToLog(result);
        return result;
      }
      switch (intent.action) {
        case 'playAs':
          result = await bridge.execSingle('play as ' + intent.character);
          if (!result) result = '🎮 Playing as ' + intent.character;
          break;
        case 'enterPlayMode':
          // If character is loaded, use the legacy 'play' path which hooks up character controller
          if (characterController && characterController.model) {
            result = await bridge.execSingle('play');
          } else {
            // Try to load a character first
            result = await bridge.execSingle('play');
          }
          if (!result) result = '🎮 Play mode';
          break;
        case 'exitPlayMode': exitPlayMode(); result = '✏️ Edit mode'; break;
        case 'showHelp': showHelp(); result = '📋 Help toggled'; break;
        case 'clearScene': bridge.clearScene(); result = '🗑️ Scene cleared'; break;
        case 'toggleCamera': 
          if (characterController) characterController.toggleCameraMode();
          result = '📷 Camera toggled'; 
          break;
        case 'openLibrary':
          if (intent.category === 'characters') {
            // Use character gallery with play-as logic — route to execSingle
            result = await bridge.execSingle('characters');
          } else if (intent.category) {
            // Use asset gallery — route to execSingle which handles loading
            result = await bridge.execSingle(intent.category);
          } else {
            // Category picker — route to execSingle for full handling
            const pickResult = await showCategoryPicker();
            if (pickResult) {
              const glb = pickResult.file;
              loadGLBModel(glb, glb, 0, 0, null, pickResult.path);
              sceneHistory.push('add ' + glb);
              result = '✅ Added ' + pickResult.name;
            } else {
              result = '📂 Library closed';
            }
          }
          break;
        case 'showGenerator': showGeneratorModal(); result = '🔮 3D Generator'; break;
        case 'buildWorld': result = await bridge.buildWorld(intent.template); break;
        case 'equipWeapon': 
          // Auto-load character if no model yet
          if (!characterController || !characterController.model) {
            result = await bridge.setCharacter('knight');
            // Wait for model to fully load, then equip
            const _waitEquip = () => {
              if (characterController && characterController.model) {
                bridge.equipWeapon(intent.weaponId, -1);
              } else {
                setTimeout(_waitEquip, 200);
              }
            };
            setTimeout(_waitEquip, 800);
            result = '⚔️ Loading character + equipping ' + intent.weaponId;
          } else {
            result = bridge.equipWeapon(intent.weaponId, -1);
          }
          break;
        case 'unequipWeapon':
          if (characterController) characterController.unequipWeapon();
          result = '🔄 Weapon unequipped';
          break;
        case 'setCharacter': result = await bridge.setCharacter(intent.id); break;
        case 'setWater': 
          if (intent.create) await execSingle((intent.preset === 'lake' ? 'add lake' : intent.preset === 'pond' ? 'add pond' : 'add ocean') + (intent.size ? ' ' + intent.size : ''));
          result = bridge.setWaterPreset(intent.preset);
          break;
        case 'setTerrain': result = await bridge.setTerrain(intent.type); break;
        case 'setWeather': result = await bridge.setWeather(intent.type); break;
        case 'setFog':
          if (intent.enabled) {
            scene.fog = new THREE.FogExp2(0x888899, 0.02);
            result = '🌫️ Fog on';
          } else {
            scene.fog = null;
            result = '🌫️ Fog off';
          }
          break;
        case 'setParticles':
          result = await bridge.execSingle('particles ' + intent.type);
          break;
        case 'toggleDayNight': window._toggleDayNight(); result = '🌗 Day/night cycle ' + (_dayNightCycle ? 'ON' : 'OFF'); break;
        case 'setTime': result = await bridge.setTime(intent.time); break;
        case 'addInterior': result = await bridge.addInterior(intent.type, intent.options || {}); break;
        case 'spawnNPC': result = await bridge.spawnNPCs(intent.type, intent.count, intent.hostile); break;
        case 'toggleInventory': result = await bridge.toggleInventory(); break;
        case 'save': result = await bridge.save(intent.name); break;
        case 'load': result = await bridge.load(); break;
        case 'addObject':
          // Fuzzy search the catalog
          const catalog = await _loadAssetCatalog();
          if (catalog) {
            const query = intent.query.toLowerCase();
            let bestMatch = null;
            let bestScore = 0;
            
            for (const [cat, items] of Object.entries(catalog)) {
              for (const item of items) {
                const name = item.name.toLowerCase();
                const file = item.file.toLowerCase();
                score = 0;
                
                if (name === query || file.replace('.glb','') === query) score = 100;
                else if (name.startsWith(query)) score = 80;
                else if (name.includes(query) || file.includes(query)) score = 60;
                else {
                  const qwords = query.split(/\s+/);
                  const matched = qwords.filter(w => name.includes(w) || file.includes(w)).length;
                  if (matched > 0) score = 20 + matched * 15;
                }
                
                if (score > bestScore) { bestScore = score; bestMatch = item; }
              }
            }
            
            if (bestMatch && bestScore >= 20) {
              // Random position so objects don't stack
              const _rx = (Math.random() - 0.5) * 60;
              const _rz = (Math.random() - 0.5) * 60;
              loadGLBModel(bestMatch.name, bestMatch.file, _rx, _rz);
              result = '✅ Added ' + bestMatch.name + (bestScore < 60 ? ' (best match for "' + intent.query + '")' : '');
              break;
            }
          }
          // Fall through to legacy if no catalog match
          result = await parseAndExecute(cmd);
          break;
        // --- Phase 3: New command handlers ---
        case 'multiplayer':
          result = await execSingle('multiplayer');
          break;
        case 'disconnect':
          if (window._mp) window._mp.disconnect();
          result = '🌐 Disconnected';
          break;
        case 'joinRoom':
          if (window._mp) window._mp.connect(undefined, intent.room);
          result = '🌐 Joining room: ' + intent.room;
          break;
        case 'chat':
          if (window._mp) window._mp.chat(intent.message);
          result = '💬 ' + intent.message;
          break;
        case 'setGraphics':
          result = setGraphicsQuality(intent.level);
          break;
        case 'setBloom':
          if (bloomPass) {
            bloomPass.enabled = intent.enabled;
            if (intent.strength !== undefined) setBloomSettings(intent.strength);
          }
          result = '✨ Bloom ' + (intent.enabled ? 'ON' : 'OFF') + (intent.strength ? ' (' + intent.strength + ')' : '');
          break;
        case 'setSSAO':
          if (ssaoPass) ssaoPass.enabled = intent.enabled;
          result = '🔲 SSAO ' + (intent.enabled ? 'ON' : 'OFF');
          break;
        case 'shooterMode':
          result = await execSingle('shooter mode');
          break;
        case 'drivingDemo':
          result = await execSingle('driving demo');
          break;
        case 'aaaSky':
          result = await execSingle('aaa sky');
          break;
        case 'setWetness':
          setSceneWetness(intent.value);
          result = '💧 Wetness: ' + intent.value;
          break;
        case 'resizeOcean':
          for (let i = 0; i < objects.length; i++) {
            if (objects[i] && objects[i].userData && objects[i].userData.name === 'ocean') {
              objects[i].geometry.dispose();
              objects[i].geometry = new THREE.PlaneGeometry(intent.size, intent.size, 128, 128);
              objects[i].geometry.rotateX(-Math.PI / 2);
            }
          }
          result = '🌊 Ocean resized to ' + intent.size;
          break;
        case 'playAnimation':
          if (characterController && characterController.playAnimation) {
            characterController.playAnimation(intent.name, true);
            result = '🎬 Playing: ' + intent.name;
          } else {
            result = '⚠ No character loaded';
          }
          break;
        case 'scatter':
          {
            const cat = await _loadAssetCatalog();
            if (cat) {
              const q = intent.query.toLowerCase();
              best = null, bestS = 0;
              for (const [c, items] of Object.entries(cat)) {
                for (const item of items) {
                  const n = item.name.toLowerCase();
                  let s = 0;
                  if (n === q) s = 100;
                  else if (n.includes(q)) s = 60;
                  else { const ws = q.split(/\s+/); const m = ws.filter(w => n.includes(w)).length; if (m > 0) s = 20 + m * 15; }
                  if (s > bestS) { bestS = s; best = item; }
                }
              }
              if (best) {
                for (let i = 0; i < intent.count; i++) {
                  const rx = (Math.random() - 0.5) * 80;
                  const rz = (Math.random() - 0.5) * 80;
                  loadGLBModel(best.name, best.file, rx, rz);
                }
                result = '🌿 Scattered ' + intent.count + 'x ' + best.name;
              } else {
                result = '⚠ No model found for "' + intent.query + '"';
              }
            }
          }
          break;
        case 'undo':
          if (sceneHistory && sceneHistory.length > 0) {
            const last = sceneHistory.pop();
            if (last) { scene.remove(last); const idx = objects.indexOf(last); if (idx >= 0) objects.splice(idx, 1); }
            result = '↩ Removed last object';
          } else {
            result = '⚠ Nothing to undo';
          }
          break;
        case 'delete':
          {
            const q = intent.query.toLowerCase();
            found = false;
            for (let i = objects.length - 1; i >= 0; i--) {
              const o = objects[i];
              if (o && o.userData && o.userData.name && o.userData.name.toLowerCase().includes(q)) {
                scene.remove(o);
                objects.splice(i, 1);
                found = true;
                result = '🗑️ Removed ' + o.userData.name;
                break;
              }
            }
            if (!found) result = '⚠ No object matching "' + intent.query + '"';
          }
          break;
        case 'screenshot':
          {
            renderer.render(scene, camera);
            const dataUrl = renderer.domElement.toDataURL('image/png');
            const a = document.createElement('a');
            a.href = dataUrl; a.download = 'crate-screenshot.png'; a.click();
            result = '📸 Screenshot saved';
          }
          break;
        case 'export':
          result = await execSingle('export');
          break;
        case 'share':
          result = await execSingle('share');
          break;
        case 'colorObject':
          {
            const q = intent.target.toLowerCase();
            const colorMap = {red:0xff0000,blue:0x0044ff,green:0x00ff44,yellow:0xffff00,white:0xffffff,black:0x111111,orange:0xff8800,purple:0x8800ff,pink:0xff44aa,cyan:0x00ffff,gold:0xffd700,silver:0xc0c0c0,brown:0x8b4513,gray:0x888888,grey:0x888888};
            let c = colorMap[intent.color] || parseInt(intent.color.replace('#',''), 16);
            found = false;
            for (const o of objects) {
              if (o && o.userData && o.userData.name && o.userData.name.toLowerCase().includes(q)) {
                o.traverse(ch => { if (ch.isMesh && ch.material) { ch.material = ch.material.clone(); ch.material.color.setHex(c); } });
                result = '🎨 Colored ' + o.userData.name + ' ' + intent.color;
                found = true; break;
              }
            }
            if (!found) result = '⚠ No object matching "' + intent.target + '"';
          }
          break;
        case 'scaleObject':
          {
            const q = intent.target.toLowerCase();
            found = false;
            for (const o of objects) {
              if (o && o.userData && o.userData.name && o.userData.name.toLowerCase().includes(q)) {
                o.scale.setScalar(intent.scale);
                result = '📐 Scaled ' + o.userData.name + ' to ' + intent.scale;
                found = true; break;
              }
            }
            if (!found) result = '⚠ No object matching "' + intent.target + '"';
          }
          break;
        case 'moveObject':
          {
            const q = intent.target.toLowerCase();
            found = false;
            for (const o of objects) {
              if (o && o.userData && o.userData.name && o.userData.name.toLowerCase().includes(q)) {
                o.position.set(intent.x, intent.y || o.position.y, intent.z !== undefined ? intent.z : o.position.z);
                result = '↔️ Moved ' + o.userData.name;
                found = true; break;
              }
            }
            if (!found) result = '⚠ No object matching "' + intent.target + '"';
          }
          break;
        case 'rotateObject':
          {
            const q = intent.target.toLowerCase();
            found = false;
            for (const o of objects) {
              if (o && o.userData && o.userData.name && o.userData.name.toLowerCase().includes(q)) {
                o.rotation.y += (intent.degrees * Math.PI / 180);
                result = '🔄 Rotated ' + o.userData.name + ' ' + intent.degrees + '°';
                found = true; break;
              }
            }
            if (!found) result = '⚠ No object matching "' + intent.target + '"';
          }
          break;
        case 'driveVehicle':
          result = await execSingle('drive ' + intent.target);
          break;
        case 'exitVehicle':
          result = await execSingle('exit vehicle');
          break;
        case 'setPostFX':
          togglePostProcessing(intent.enabled);
          result = '✨ Post-processing ' + (intent.enabled ? 'ON' : 'OFF');
          break;
        case 'setVignette':
          if (window._colorPass) window._colorPass.uniforms.vignetteStrength.value = intent.value;
          result = '🔲 Vignette: ' + intent.value;
          break;
        case 'setGrain':
          if (window._colorPass) window._colorPass.uniforms.filmGrain.value = intent.value;
          result = '📺 Film grain: ' + intent.value;
          break;
        case 'aiSettings':
          result = await execSingle('ai settings');
          break;
        case 'scriptManager':
          result = await execSingle('scripts');
          break;
        case 'scriptEditor':
          result = await execSingle('edit script');
          break;
        case 'stopAnimation':
          {
            const q = intent.target.toLowerCase();
            found = false;
            for (const o of objects) {
              if (o && o.userData && o.userData.name && o.userData.name.toLowerCase().includes(q)) {
                if (o.userData.mixer) { o.userData.mixer.stopAllAction(); }
                result = '⏹ Stopped animation on ' + o.userData.name;
                found = true; break;
              }
            }
            if (!found) result = '⚠ No object matching "' + intent.target + '"';
          }
          break;
        case 'quickArena':
          {
            // Build combat arena: flat terrain, some cover, enemies
            bridge.clearScene();
            await bridge.setTerrain('flat');
            await bridge.setTime('sunset');
            // Add arena objects
            const arenaCat = await _loadAssetCatalog();
            if (arenaCat) {
              // Scatter rocks for cover
              for (let i = 0; i < 8; i++) {
                const rx = (Math.random() - 0.5) * 30;
                const rz = (Math.random() - 0.5) * 30;
                loadGLBModel('Rock', arenaCat.rocks?.[Math.floor(Math.random() * (arenaCat.rocks?.length || 1))]?.file || 'kaykit_adventurers_bit_rock1.glb', rx, rz);
              }
            }
            // Spawn enemies
            if (npcController) {
              for (let i = 0; i < 6; i++) {
                await npcController.spawnNPC('soldier', (Math.random()-0.5)*20, (Math.random()-0.5)*20, 'aggro');
              }
            }
            // Equip and play
            if (characterController) {
              await characterController.loadCharacter('soldier');
              characterController.equipWeapon('sword', 0);
            }
            enterPlayMode();
            result = '⚔️ Combat Arena! 6 enemies. Fight!';
          }
          break;
        case 'quickSurvival':
          {
            bridge.clearScene();
            await bridge.setTerrain('flat');
            await bridge.setTime('night');
            if (characterController) {
              await characterController.loadCharacter('soldier');
              characterController.equipWeapon('sword', 0);
              characterController.equipWeapon('pistol', 1);
            }
            // Spawn waves
            if (npcController) {
              for (let i = 0; i < 10; i++) {
                const angle = (i / 10) * Math.PI * 2;
                const dist = 15 + Math.random() * 10;
                await npcController.spawnNPC('soldier', Math.cos(angle)*dist, Math.sin(angle)*dist, 'aggro');
              }
            }
            enterPlayMode();
            result = '💀 Survival Mode! 10 enemies surrounding you. Good luck!';
          }
          break;
        case 'quickExplore':
          {
            await bridge.buildWorld('tropical paradise');
            if (characterController) {
              await characterController.loadCharacter('soldier');
            }
            if (npcController) {
              for (let i = 0; i < 5; i++) {
                await npcController.spawnNPC('villager', (Math.random()-0.5)*30, (Math.random()-0.5)*30, 'wander');
              }
            }
            enterPlayMode();
            result = '🌴 Explore! Tropical paradise with friendly NPCs.';
          }
          break;
        case 'quickDemo':
          {
            bridge.clearScene();
            await bridge.buildWorld('medieval siege');
            if (characterController) {
              await characterController.loadCharacter('soldier');
              characterController.equipWeapon('sword', 0);
              characterController.equipWeapon('bow', 1);
            }
            if (npcController) {
              for (let i = 0; i < 3; i++) {
                await npcController.spawnNPC('villager', (Math.random()-0.5)*15, (Math.random()-0.5)*15, 'wander');
              }
              for (let i = 0; i < 4; i++) {
                await npcController.spawnNPC('soldier', 15+(Math.random()-0.5)*10, (Math.random()-0.5)*15, 'aggro');
              }
            }
            enterPlayMode();
            result = '🏰 Demo: Medieval Siege! Defend the village!';
          }
          break;
        case 'setSensitivity':
          if (characterController) { characterController.mouseSensitivity = intent.value * 0.001; result = '🎯 Sensitivity: ' + intent.value; }
          break;
        default:
          // Unknown action — fall back to legacy parser
          result = await parseAndExecute(cmd);
      }
    } catch(err) {
      console.error('[Interpreter]', err);
      result = await parseAndExecute(cmd);
    }
    
    // Show in output log
    const log = document.getElementById('output-log');
    if (log && result) {
      log.style.display = 'block';
      const cmdEl = document.createElement('div');
      cmdEl.className = 'entry cmd';
      cmdEl.textContent = '❯ ' + cmd;
      log.appendChild(cmdEl);
      const text = (result || '').toString();
      text.split('\n').forEach(line => {
        if (!line) return;
        const r = document.createElement('div');
        r.className = 'entry info';
        r.textContent = line;
        log.appendChild(r);
      });
      log.scrollTop = log.scrollHeight;
      setTimeout(() => { log.style.display = 'none'; }, 4000);
    }
    
    return result || '';
  };
  
  console.log('[Crate Engine] ✅ New interpreter active — Phase 2 ready');
  // Show quick-start help for new users
  setTimeout(() => {
    showToast('🎮 Try: "build a city" → "play" | Or: "help"', 5000);
  }, 2000);
}).catch(err => {
  console.warn('[Crate Engine] Interpreter not loaded, using legacy parser:', err.message);
});

// Legacy _runCommand (kept as fallback)
window._runCommand = async function(cmd) {
  const input = document.getElementById('prompt-input');
  const log = document.getElementById('output-log');
  if (!input || !log) return '';
  log.style.display = 'block';
  const cmdEl = document.createElement('div');
  cmdEl.className = 'entry cmd';
  cmdEl.textContent = '❯ ' + cmd;
  log.appendChild(cmdEl);
  response = '';
  try {
    response = await parseAndExecute(cmd);
    const text = (response || '').toString();
    text.split('\n').forEach(line => {
      if (!line) return;
      const r = document.createElement('div');
      r.className = 'entry ' + (line.startsWith('✓')?'ok':line.startsWith('⚠')?'err':'info');
      r.textContent = line;
      log.appendChild(r);
    });
  } catch(err) {
    const r = document.createElement('div');
    r.className = 'entry err';
    r.textContent = '⚠ Error: ' + err.message;
    log.appendChild(r);
  }
  log.scrollTop = log.scrollHeight;
  // Auto-hide log after 4s
  clearTimeout(window._logHideTimer);
  window._logHideTimer = setTimeout(() => { log.style.display = "none"; }, 4000);
  return response || '';
};

window._engineReady = true;
window.parseAndExecute = parseAndExecute;
window._showCategoryPicker = showCategoryPicker;
window._execCommand = parseAndExecute;
// Apply template preset if on a template page
if (window._templateMode) {
  applyTemplatePreset(window._templateMode).then(() => {
    if (window._hideLoader) window._hideLoader();
  });
} else {
  if (window._hideLoader) window._hideLoader();
}

// === COMMAND PALETTE DROPDOWN ===
(function initCommandPalette() {
  const menu = document.getElementById('cmd-dropdown-menu');
  if (!menu) return;
  const COMMAND_PALETTE = {

    'Add Objects': [
      { label: 'Car', cmd: 'add sedan', glb: 'kenney_cars/sedan' },
      { label: 'Truck', cmd: 'add truck', glb: 'truck' },
      { label: 'Police Car', cmd: 'add police', glb: 'kenney_cars/police' },
      { label: 'House', cmd: 'add house', glb: 'buildings_pack_2_house1' },
      { label: 'Building', cmd: 'add building', glb: 'buildings_pack_2_building1_large' },
      { label: 'Tree', cmd: 'add tree', glb: 'simple_nature_pack_tree1' },
      { label: 'Rock', cmd: 'add rock', glb: 'simple_nature_pack_rock1' },
      { label: 'Barrel', cmd: 'add barrel', glb: 'barrel_00' },
      { label: 'Fence', cmd: 'add fence', glb: 'fence' },
      { label: 'NPC', cmd: 'add npc' },
      { label: 'Horse', cmd: 'add horse', glb: 'animals_pack_horse' },
      { label: 'Campfire', cmd: 'add campfire', glb: 'campfire' },
      { label: 'Browse Library...', cmd: 'browse all' },
    ],
    'Environment': [
      { label: 'Rain', cmd: 'rain' },
      { label: 'Snow', cmd: 'snow' },
      { label: 'Storm', cmd: 'storm' },
      { label: 'Clear Weather', cmd: 'clear weather' },
      { label: 'Fog On', cmd: 'fog on' },
      { label: 'Fog Off', cmd: 'fog off' },
      { label: 'Time: Morning', cmd: 'time morning' },
      { label: 'Time: Noon', cmd: 'time noon' },
      { label: 'Time: Night', cmd: 'time night' },
      { label: 'Ocean', cmd: 'add ocean' },
      { label: 'Terrain: Mountains', cmd: 'terrain mountains' },
    ],
    'Play Mode': [
      { label: 'Play', cmd: 'play' },
      { label: 'Edit Mode', cmd: 'edit' },
      { label: 'Characters...', cmd: 'characters' },
      { label: 'Spawn NPCs', cmd: 'populate' },
      { label: 'Toggle Camera', cmd: 'toggle camera' },
    ],
    'Graphics': [
      { label: 'Low', cmd: 'graphics low' },
      { label: 'Medium', cmd: 'graphics medium' },
      { label: 'High', cmd: 'graphics high' },
      { label: 'Ultra', cmd: 'graphics ultra' },
    ],
    'Utility': [
      { label: 'Save', cmd: 'save' },
      { label: 'Load', cmd: 'load' },
      { label: 'Clear Scene', cmd: 'clear' },
      { label: 'Screenshot', cmd: 'screenshot' },
      { label: 'Undo', cmd: 'undo' },
      { label: 'Help', cmd: 'help' },
    ],
  };
  let html = '';
  for (const [category, items] of Object.entries(COMMAND_PALETTE)) {
    html += `<div style="padding:4px 12px;color:#888;font-size:0.55rem;text-transform:uppercase;letter-spacing:0.5px;margin-top:4px;">${category}</div>`;
    for (const item of items) {
      html += `<div class="cmd-item" data-cmd="${item.cmd}" style="padding:5px 16px;color:#ddd;cursor:pointer;transition:background 0.15s;" onmouseenter="this.style.background='#2a2a2a'" onmouseleave="this.style.background='none'">${item.label}</div>`;
    }
  }
  // Build a glb lookup map for direct-load items
  const _paletteGlbMap = {};
  for (const items of Object.values(COMMAND_PALETTE)) {
    for (const item of items) {
      if (item.glb) _paletteGlbMap[item.cmd] = { glb: item.glb, label: item.label };
    }
  }
  menu.innerHTML = html;
  menu.addEventListener('click', (e) => {
    const item = e.target.closest('.cmd-item');
    if (!item) return;
    const cmd = item.dataset.cmd;
    menu.style.display = 'none';
    // If this item has a known GLB path, load it directly (bypass command pipeline)
    const directLoad = _paletteGlbMap[cmd];
    if (directLoad) {
      const rx = (Math.random() - 0.5) * 20;
      const rz = (Math.random() - 0.5) * 20;
      console.log('[CmdPalette] Direct loading:', directLoad.glb, 'at', rx, rz);
      loadGLBModel(directLoad.label, directLoad.glb, rx, rz);
      if (typeof showToast === 'function') showToast('Adding ' + directLoad.label + '...');
      return;
    }
    if (window._parseAndExecute) window._parseAndExecute(cmd);
  });
  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#cmd-menu-btn') && !e.target.closest('#cmd-dropdown-menu')) {
      menu.style.display = 'none';
    }
  });
})();

// Force canvas resize to fill viewport
setTimeout(() => {
  const c = document.getElementById('crate-canvas');
  if (c) {
    const w = c.clientWidth;
    const h = c.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (typeof composer !== 'undefined' && composer) composer.setSize(w, h);
    console.log('[Engine] Canvas resized to', w, 'x', h);
  }
}, 100);
// demo autorun removed

window.addEventListener('resize', () => {
  camera.aspect = canvas.clientWidth / canvas.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(canvas.clientWidth, canvas.clientHeight);
  if (typeof composer !== 'undefined' && composer) composer.setSize(canvas.clientWidth, canvas.clientHeight);
});

// Stats
function animateCount(el, target, dur) {
  s=0;const step=target/(dur/16);const t=setInterval(()=>{s+=step;if(s>=target){el.textContent=target.toLocaleString();clearInterval(t);return;}el.textContent=Math.floor(s).toLocaleString();},16);
}











// Stats bar animation removed (elements no longer in HTML)


window.launchEngine = function() { const btn = document.getElementById("launch-btn"); if (btn) btn.textContent = "✅ Already Running"; };
input.focus();


// ═══════════════════════════════════════════
// SCENE SERIALIZATION & SHARING
// ═══════════════════════════════════════════
// sceneHistory declared at top of file


function deserializeScene(data) {
  // Clear current scene
  parseAndExecute('clear');
  
  let cmds;
  try {
    const parsed = JSON.parse(data);
    if (parsed.version === 2) {
      cmds = parsed.commands || [];
      // Restore weather/time after commands
      setTimeout(() => {
        if (parsed.weather) setWeather(parsed.weather);
        if (parsed.time) parseAndExecute('time ' + parsed.time);
      }, cmds.length * 200 + 500);
    } else {
      cmds = data.split('|').filter(Boolean);
    }
  } catch(e) {
    // Legacy format: pipe-separated commands
    cmds = data.split('|').filter(Boolean);
  }
  
  let i = 0;
  function next() {
    if (i >= cmds.length) return;
    parseAndExecute(cmds[i]);
    i++;
    setTimeout(next, 200);
  }
  next();
}

function serializeScene() {
  // Save both command history AND current object state
  const objectState = objects.map(obj => {
    if (!obj || !obj.userData) return null;
    const entry = {
      name: obj.userData.name || '',
      pos: [+obj.position.x.toFixed(2), +obj.position.y.toFixed(2), +obj.position.z.toFixed(2)],
      scale: +obj.scale.x.toFixed(4),
      rot: +obj.rotation.y.toFixed(3),
    };
    if (obj.userData.isGLB) entry.glb = true;
    if (obj.userData.isWater) entry.water = true;
    if (obj.userData.waterPreset) entry.waterPreset = obj.userData.waterPreset;
    if (obj.userData.isGerstnerWater) entry.gerstner = true;
    return entry;
  }).filter(Boolean);
  
  return JSON.stringify({
    version: 2,
    commands: sceneHistory.filter(c => c !== 'clear' && c !== 'reset'),
    weather: weatherSystem || null,
    time: null, // TODO: track time of day
  });
}

// Compress scene data for shorter URLs
function compressScene(str) {
  // Simple RLE-like compression + base64
  // Replace common commands with short codes
  var compressed = str
    .replace(/add /g, 'A:')
    .replace(/time /g, 'T:')
    .replace(/make it rain/g, 'R')
    .replace(/make it snow/g, 'S')
    .replace(/fog/g, 'F')
    .replace(/build a /g, 'B:')
    .replace(/snow ground/g, 'SG')
    .replace(/sand ground/g, 'DG');
  return btoa(compressed);
}

function decompressScene(encoded) {
  try {
    var str = atob(encoded);
    return str
      .replace(/A:/g, 'add ')
      .replace(/T:/g, 'time ')
      .replace(/\bR\b/g, 'make it rain')
      .replace(/\bS\b/g, 'make it snow')
      .replace(/\bF\b/g, 'fog')
      .replace(/B:/g, 'build a ')
      .replace(/\bSG\b/g, 'snow ground')
      .replace(/\bDG\b/g, 'sand ground');
  } catch(e) {
    return null;
  }
}

function shareScene() {
  var data = serializeScene();
  if (!data) {
    logOutput('warn', '⚠ Nothing to share — build something first!');
    return;
  }
  var encoded = compressScene(data);
  var url = window.location.origin + '/s#' + encoded;
  navigator.clipboard.writeText(url).then(function() {
    logOutput('ok', '📋 Share link copied!');
    showShareModal(url, sceneHistory.length);
  }).catch(function() {
    showShareModal(url, sceneHistory.length);
  });
  return url;
}


// === PUBLISH TO .COM ===
function publishScene() {
  var data = serializeScene();
  if (!data) {
    logOutput('warn', '⚠ Nothing to publish — build something first!');
    return;
  }

  var old = document.getElementById('publish-modal');
  if (old) old.remove();
  
  var modal = document.createElement('div');
  modal.id = 'publish-modal';
  Object.assign(modal.style, {
    position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
    background: 'rgba(0,0,0,0.85)', zIndex: '10006', display: 'flex',
    alignItems: 'center', justifyContent: 'center', fontFamily: "'JetBrains Mono', monospace"
  });
  
  // Generate a unique slug
  var slug = 'game-' + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
  var existing = JSON.parse(localStorage.getItem('crate_published_games') || '[]');
  
  modal.innerHTML = 
    '<div style="background:#111;border:1px solid #252525;border-radius:16px;padding:32px;max-width:520px;width:90%;text-align:center">' +
    '<div style="font-size:1.5rem;margin-bottom:8px">🚀 Publish to .com</div>' +
    '<p style="color:#888;font-size:0.8rem;margin-bottom:20px">Your game goes live at crateshipgames.com — playable by anyone, anywhere.</p>' +
    
    '<div style="text-align:left;margin-bottom:16px">' +
    '<label style="color:#888;font-size:0.7rem;text-transform:uppercase;letter-spacing:1px">Game Title</label>' +
    '<input id="pub-title" placeholder="My Awesome Game" value="" style="width:100%;padding:10px;background:#0a0a0f;border:1px solid #333;border-radius:8px;color:#fff;font-family:inherit;font-size:0.85rem;margin-top:4px;outline:none">' +
    '</div>' +
    
    '<div style="text-align:left;margin-bottom:16px">' +
    '<label style="color:#888;font-size:0.7rem;text-transform:uppercase;letter-spacing:1px">Description</label>' +
    '<textarea id="pub-desc" placeholder="A short description of your game..." style="width:100%;padding:10px;background:#0a0a0f;border:1px solid #333;border-radius:8px;color:#fff;font-family:inherit;font-size:0.85rem;margin-top:4px;outline:none;resize:vertical;min-height:60px"></textarea>' +
    '</div>' +
    
    '<div style="text-align:left;margin-bottom:16px">' +
    '<label style="color:#888;font-size:0.7rem;text-transform:uppercase;letter-spacing:1px">Your URL</label>' +
    '<div style="display:flex;align-items:center;gap:0;margin-top:4px">' +
    '<span style="padding:10px;background:#0a0a0f;border:1px solid #333;border-right:none;border-radius:8px 0 0 8px;color:#555;font-size:0.8rem;white-space:nowrap">crateshipgames.com/play/</span>' +
    '<input id="pub-slug" value="' + slug + '" style="flex:1;padding:10px;background:#0a0a0f;border:1px solid #333;border-radius:0 8px 8px 0;color:#4ade80;font-family:inherit;font-size:0.8rem;outline:none">' +
    '</div></div>' +
    
    '<div style="text-align:left;margin-bottom:20px">' +
    '<label style="color:#888;font-size:0.7rem;text-transform:uppercase;letter-spacing:1px">Tags</label>' +
    '<input id="pub-tags" placeholder="rpg, fantasy, multiplayer" style="width:100%;padding:10px;background:#0a0a0f;border:1px solid #333;border-radius:8px;color:#fff;font-family:inherit;font-size:0.85rem;margin-top:4px;outline:none">' +
    '</div>' +
    
    '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">' +
    '<button id="pub-go" style="padding:12px 28px;background:linear-gradient(135deg,#4ade80,#22c55e);color:#000;border:none;border-radius:10px;cursor:pointer;font-weight:700;font-size:0.9rem;font-family:inherit">🚀 Publish Live</button>' +
    '<button id="pub-close" style="padding:12px 28px;background:#222;color:#888;border:1px solid #333;border-radius:10px;cursor:pointer;font-family:inherit">Cancel</button>' +
    '</div>' +
    
    (existing.length > 0 ? '<div style="margin-top:20px;border-top:1px solid #222;padding-top:16px"><div style="color:#888;font-size:0.7rem;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Your Published Games (' + existing.length + ')</div>' + 
    existing.slice(-5).map(function(g) { return '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #1a1a24"><a href="/play/' + g.slug + '" style="color:#4ade80;font-size:0.8rem;text-decoration:none">' + g.title + '</a><span style="color:#555;font-size:0.7rem">' + new Date(g.publishedAt).toLocaleDateString() + '</span></div>'; }).join('') + '</div>' : '') +
    
    '</div>';
    
  document.body.appendChild(modal);
  
  document.getElementById('pub-close').onclick = function() { modal.remove(); };
  modal.onclick = function(e) { if (e.target === modal) modal.remove(); };
  
  document.getElementById('pub-go').onclick = async function() {
    // Check auth & plan
    if (auth.isLoggedIn && auth.isPremium) {
      // Use server-side publish
      var btn = document.getElementById('pub-go');
      btn.textContent = '⏳ Publishing...'; btn.style.opacity = '0.6';
      var title = document.getElementById('pub-title').value.trim() || 'Untitled Game';
      var desc = document.getElementById('pub-desc').value.trim();
      var finalSlug = document.getElementById('pub-slug').value.trim().replace(/[^a-z0-9-]/gi, '-').toLowerCase();
      var tags = document.getElementById('pub-tags').value.trim().split(',').map(function(t){return t.trim()}).filter(Boolean);
      var result = await auth.publishGame({ title: title, description: desc, slug: finalSlug, tags: tags, sceneData: compressScene(data), objects: objects.length, commands: sceneHistory.length });
      if (result.error) { logOutput('err', '⚠ ' + result.error); btn.textContent = '🚀 Publish Live'; btn.style.opacity = '1'; return; }
      logOutput('ok', '🚀 Published at ' + result.url);
      modal.innerHTML = '<div style="background:#111;border:1px solid #4ade80;border-radius:16px;padding:32px;max-width:480px;width:90%;text-align:center"><div style="font-size:2.5rem;margin-bottom:12px">🎉</div><div style="font-size:1.3rem;font-weight:700;color:#4ade80;margin-bottom:8px">Published!</div><p style="color:#888;font-size:0.8rem">' + result.url + '</p><button onclick="navigator.clipboard.writeText(\'' + result.url + '\');this.textContent=\'Copied!\'" style="margin-top:12px;padding:10px 24px;background:#4ade80;color:#000;border:none;border-radius:8px;cursor:pointer;font-weight:700">📋 Copy Link</button><button onclick="this.closest(\'[id=publish-modal]\').remove()" style="margin:8px;padding:10px 24px;background:#222;color:#888;border:1px solid #333;border-radius:8px;cursor:pointer">Close</button></div>';
      return;
    } else if (auth.isLoggedIn && !auth.isPremium) {
      // Show upgrade prompt
      logOutput('warn', '⚠ Publishing requires Premium plan ($14.99/mo)');
      var upgradeResult = await auth.subscribe('premium');
      if (upgradeResult.checkoutUrl) window.location = upgradeResult.checkoutUrl;
      return;
    } else if (!auth.isLoggedIn) {
      auth.showAuthModal(function(user) { document.getElementById('pub-go').click(); });
      return;
    }
  
    var title = document.getElementById('pub-title').value.trim() || 'Untitled Game';
    var desc = document.getElementById('pub-desc').value.trim();
    var finalSlug = document.getElementById('pub-slug').value.trim().replace(/[^a-z0-9-]/gi, '-').toLowerCase() || slug;
    var tags = document.getElementById('pub-tags').value.trim();
    
    var btn = document.getElementById('pub-go');
    btn.textContent = '⏳ Publishing...';
    btn.style.opacity = '0.6';
    
    // Save scene data with metadata
    var encoded = compressScene(data);
    var gameData = {
      title: title,
      description: desc,
      slug: finalSlug,
      tags: tags.split(',').map(function(t) { return t.trim(); }).filter(Boolean),
      sceneData: encoded,
      commands: sceneHistory.length,
      objects: objects.length,
      publishedAt: Date.now(),
      version: 1
    };
    
    // Store in localStorage (will use backend API later)
    existing.push(gameData);
    localStorage.setItem('crate_published_games', JSON.stringify(existing));
    
    // Create the playable page URL
    var playUrl = window.location.origin + '/play/' + finalSlug;
    
    // Also store as a shareable hash URL that works now
    var shareUrl = window.location.origin + '/?scene=' + finalSlug + '#' + encoded;
    
    setTimeout(function() {
      modal.innerHTML = 
        '<div style="background:#111;border:1px solid #4ade80;border-radius:16px;padding:32px;max-width:480px;width:90%;text-align:center">' +
        '<div style="font-size:2.5rem;margin-bottom:12px">🎉</div>' +
        '<div style="font-size:1.3rem;font-weight:700;color:#4ade80;margin-bottom:8px">Published!</div>' +
        '<p style="color:#888;font-size:0.8rem;margin-bottom:16px">"' + title + '" is now live</p>' +
        '<div style="background:#0a0a0f;border:1px solid #333;border-radius:8px;padding:12px;margin-bottom:16px">' +
        '<div style="color:#555;font-size:0.7rem;margin-bottom:4px">Share this link</div>' +
        '<input id="pub-final-url" readonly value="' + shareUrl + '" style="width:100%;padding:8px;background:transparent;border:none;color:#4ade80;font-family:inherit;font-size:0.75rem;text-align:center;outline:none" onclick="this.select()">' +
        '</div>' +
        '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">' +
        '<button onclick="navigator.clipboard.writeText(\'' + shareUrl + '\');this.textContent=\'✓ Copied!\';setTimeout(()=>this.textContent=\'📋 Copy Link\',2000)" style="padding:10px 20px;background:#4ade80;color:#000;border:none;border-radius:8px;cursor:pointer;font-weight:700;font-family:inherit">📋 Copy Link</button>' +
        '<button onclick="window.open(\'https://twitter.com/intent/tweet?text=I just published a game on Crate Engine! Play it here: ' + encodeURIComponent(shareUrl) + '\')" style="padding:10px 20px;background:#1da1f2;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;font-family:inherit">𝕏 Share</button>' +
        '<button onclick="this.closest(\'[id=publish-modal]\').remove()" style="padding:10px 20px;background:#222;color:#888;border:1px solid #333;border-radius:8px;cursor:pointer;font-family:inherit">Close</button>' +
        '</div></div>';
      
      logOutput('ok', '🚀 Published "' + title + '" — link copied! Share it with anyone.');
    }, 1200);
  };
}
window._publishScene = publishScene;

function showShareModal(url, cmdCount) {
  // Remove existing modal
  var old = document.getElementById('share-modal');
  if (old) old.remove();
  
  var modal = document.createElement('div');
  modal.id = 'share-modal';
  Object.assign(modal.style, {
    position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
    background: 'rgba(0,0,0,0.7)', zIndex: '10000', display: 'flex',
    alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)'
  });
  
  var card = document.createElement('div');
  Object.assign(card.style, {
    background: '#0d0d0d', border: '1px solid #252525', borderRadius: '16px',
    padding: '32px', maxWidth: '500px', width: '90%', textAlign: 'center',
    fontFamily: 'JetBrains Mono, monospace', color: '#e0e0e0'
  });
  
  card.innerHTML = '<div style="font-size:2rem;margin-bottom:12px">🔗</div>' +
    '<h3 style="color:#ff6b35;margin:0 0 8px">Scene Ready to Share!</h3>' +
    '<p style="color:#888;font-size:0.8rem;margin:0 0 16px">' + cmdCount + ' commands encoded in URL</p>' +
    '<input id="share-url" readonly value="' + url + '" style="width:100%;padding:10px;background:#111;border:1px solid #333;border-radius:8px;color:#4ade80;font-family:JetBrains Mono,monospace;font-size:0.75rem;margin-bottom:12px;text-align:center">' +
    '<div style="display:flex;gap:8px;justify-content:center">' +
      '<button id="share-copy-btn" style="padding:10px 20px;background:#ff6b35;color:#000;border:none;border-radius:8px;cursor:pointer;font-weight:700;font-family:JetBrains Mono,monospace">📋 Copy Link</button>' +
      '<button id="share-twitter-btn" style="padding:10px 20px;background:#1da1f2;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;font-family:JetBrains Mono,monospace">𝕏 Post</button>' +
      '<button id="share-close-btn" style="padding:10px 20px;background:#222;color:#888;border:1px solid #333;border-radius:8px;cursor:pointer;font-family:JetBrains Mono,monospace">Close</button>' +
    '</div>' +
    '<p style="color:#555;font-size:0.7rem;margin:12px 0 0">Anyone with this link can view & remix your scene</p>';
  
  modal.appendChild(card);
  document.body.appendChild(modal);
  
  document.getElementById('share-copy-btn').addEventListener('click', function() {
    navigator.clipboard.writeText(url);
    this.textContent = '✅ Copied!';
    setTimeout(function() { document.getElementById('share-copy-btn').textContent = '📋 Copy Link'; }, 2000);
  });
  
  document.getElementById('share-twitter-btn').addEventListener('click', function() {
    var text = 'Check out this 3D scene I built with Crate Engine! 🔥 No code, just natural language.';
    window.open('https://twitter.com/intent/tweet?text=' + encodeURIComponent(text) + '&url=' + encodeURIComponent(url), '_blank');
  });
  
  document.getElementById('share-close-btn').addEventListener('click', function() { modal.remove(); });
  modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
}

function loadSharedScene() {
  // Check hash first (new format: /s#encoded or #scene-name or #encoded)
  var hash = window.location.hash.replace('#', '');
  if (!hash) {
    // Fallback: check query params (old format)
    var params = new URLSearchParams(window.location.search);
    hash = params.get('scene') || '';
  }
  if (!hash) return;
  
  // Check if it's a preset scene name (e.g. "cyberpunk-city")
  var sceneName = hash.replace(/-/g, ' ').toLowerCase();
  if (typeof getSceneCommands === 'function') {
    var presetCmds = getSceneCommands(sceneName);
    // Check if it returned a real preset (not the default fallback)
    var isPreset = presetCmds && !(presetCmds.length === 3 && presetCmds[0] === 'add 5 trees');
    if (isPreset) {
      logOutput('info', '🎮 Loading preset: ' + sceneName);
      var delay = 300;
      presetCmds.forEach(function(cmd, i) {
        setTimeout(function() { parseAndExecute(cmd); }, delay + i * 250);
      });
      return;
    }
  }
  
  // Try decoding as a shared scene
  var decoded = decompressScene(hash);
  if (decoded) {
    var commands = decoded.split('|').filter(function(c) { return c.trim(); });
    if (commands.length > 0) {
      logOutput('info', '🔗 Loading shared scene (' + commands.length + ' commands)...');
      showRemixBanner(commands.length);
      commands.forEach(function(cmd, i) {
        setTimeout(function() { parseAndExecute(cmd); }, 300 + i * 150);
      });
      return;
    }
  }
}

function showRemixBanner(cmdCount) {
  var banner = document.createElement('div');
  banner.id = 'remix-banner';
  Object.assign(banner.style, {
    position: 'fixed', top: '0', left: '0', width: '100%', padding: '10px',
    background: 'linear-gradient(90deg, #ff6b35, #f59e0b)', color: '#000',
    textAlign: 'center', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.85rem',
    fontWeight: '700', zIndex: '9999', display: 'flex', alignItems: 'center',
    justifyContent: 'center', gap: '12px'
  });
  banner.innerHTML = '🔗 Viewing a shared scene (' + cmdCount + ' commands)' +
    '<button id="remix-btn" style="padding:6px 16px;background:#000;color:#ff6b35;border:none;border-radius:6px;cursor:pointer;font-weight:700;font-family:JetBrains Mono,monospace;font-size:0.8rem">🔀 Remix This</button>' +
    '<button onclick="this.parentElement.remove()" style="padding:6px 12px;background:rgba(0,0,0,0.2);color:#000;border:none;border-radius:6px;cursor:pointer;font-family:JetBrains Mono,monospace">✕</button>';
  document.body.appendChild(banner);
  
  document.getElementById('remix-btn').addEventListener('click', function() {
    // Clear the hash so they're working on their own copy
    history.replaceState(null, '', window.location.pathname);
    banner.innerHTML = '<span style="color:#000">✅ Scene cloned! It\'s yours now — edit away and share your version.</span>' +
      '<button onclick="this.parentElement.remove()" style="padding:6px 12px;background:rgba(0,0,0,0.2);color:#000;border:none;border-radius:6px;cursor:pointer;font-family:JetBrains Mono,monospace">✕</button>';
    setTimeout(function() { banner.remove(); }, 4000);
    // Focus the prompt input
    var input = document.getElementById('prompt-input');
    if (input) input.focus();
  });
}

// Load shared scene on startup
setTimeout(loadSharedScene, 1000);

// ═══════════════════════════════════════════
// SCREENSHOT SYSTEM
// ═══════════════════════════════════════════
function takeScreenshot() {
  renderer.render(scene, camera);
  const dataUrl = renderer.domElement.toDataURL('image/png');
  const link = document.createElement('a');
  link.download = 'crate-engine-screenshot.png';
  link.href = dataUrl;
  link.click();
  logOutput('ok', '📸 Screenshot saved!');
}

// ═══════════════════════════════════════════
// KEYBOARD SHORTCUTS
// ═══════════════════════════════════════════
document.addEventListener('keydown', (e) => {
  // Only when not typing in an input
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  
  if (e.key === 'F2') { e.preventDefault(); takeScreenshot(); }
  if (e.key === 'Delete' && selectedObj) {
    scene.remove(selectedObj);
    objects.splice(objects.indexOf(selectedObj), 1);
    logOutput('ok', 'Deleted ' + (selectedObj.userData.name || 'object'));
    selectedObj = null;
  }
  if (e.key === 'Escape') {
    if (selectedObj) { highlightSelected(null); selectedObj = null; }
  }
});


// Onboarding removed — blank canvas start



// ═══════════════════════════════════════════
// OBJECT INSPECTOR — click any object to edit
// ═══════════════════════════════════════════
const inspectorPanel = document.createElement('div');
inspectorPanel.id = 'inspector';
Object.assign(inspectorPanel.style, {
  position: 'fixed', top: '50px', right: '12px', zIndex: '240',
  width: '220px', borderRadius: '10px',
  background: 'rgba(10,10,10,0.92)', border: '1px solid #2a2a2a',
  boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
  display: 'none', flexDirection: 'column', overflow: 'hidden',
  fontFamily: "'Inter', -apple-system, sans-serif", fontSize: '0.75rem',
  backdropFilter: 'blur(8px)',
});
// Make inspector draggable so it never blocks the scene
let _inspDragging=false,_inspDx=0,_inspDy=0;
inspectorPanel.addEventListener('mousedown', e=>{
  if(e.target.tagName==='INPUT'||e.target.tagName==='BUTTON'||e.target.tagName==='SELECT') return;
  _inspDragging=true; _inspDx=e.clientX-inspectorPanel.getBoundingClientRect().left;
  _inspDy=e.clientY-inspectorPanel.getBoundingClientRect().top; e.preventDefault();
});
document.addEventListener('mousemove',e=>{ if(!_inspDragging)return; inspectorPanel.style.left=Math.max(0,e.clientX-_inspDx)+'px'; inspectorPanel.style.top=Math.max(0,e.clientY-_inspDy)+'px'; inspectorPanel.style.bottom='auto'; });
document.addEventListener('mouseup',()=>_inspDragging=false);
document.body.appendChild(inspectorPanel);

function updateInspector(obj) {
  if (!obj) { inspectorPanel.style.display = 'none'; return; }
  inspectorPanel.style.display = 'flex';
  const name = obj.userData.name || 'Object';
  const pos = obj.position;
  const scl = obj.scale.x;
  const rotY = (obj.rotation.y * 180 / Math.PI).toFixed(0);
  const isGLB = obj.userData.isGLB ? '📦 GLB Model' : '🔷 Primitive';
  const anims = obj.userData.animations ? obj.userData.animations.join(', ') : 'None';

  // Count triangles for optimization awareness
  let triCount = 0;
  obj.traverse(c => {
    if (c.isMesh && c.geometry) {
      triCount += c.geometry.index ? c.geometry.index.count / 3 : (c.geometry.attributes.position ? c.geometry.attributes.position.count / 3 : 0);
    }
  });
  const triLabel = triCount > 1000 ? (triCount / 1000).toFixed(1) + 'K' : Math.round(triCount);

  // Get material color for inline picker
  let hexColor = '#888888';
  obj.traverse(c => {
    if (c.isMesh && c.material && c.material.color && hexColor === '#888888') {
      hexColor = '#' + c.material.color.getHexString();
    }
  });

  const hasPhys = obj.userData.hasPhysics;
  const physType = obj.userData.physicsType || 'dynamic';
  const inputStyle = "background:#111;border:1px solid #252525;border-radius:4px;padding:4px 6px;color:#e0e0e0;font-size:0.75rem;width:100%;font-family:JetBrains Mono,monospace";
  const btnStyle = "flex:1;min-width:70px;padding:6px;background:#111;border:1px solid #252525;border-radius:6px;color:#aaa;cursor:pointer;font-size:0.7rem;transition:all 0.2s";

  inspectorPanel.innerHTML = `
    <div style="padding:12px;border-bottom:1px solid #1a1a1a;display:flex;align-items:center;gap:8px;background:rgba(255,107,53,0.05)">
      <span style="font-size:1rem">${obj.userData.isGLB ? '📦' : '🔷'}</span>
      <div style="flex:1">
        <div style="font-weight:700;color:#fff;font-size:0.85rem">${name}</div>
        <div style="color:#555;font-size:0.65rem">${isGLB} | ${triLabel} tris${hasPhys ? ' | <span style="color:#f7c948">⚡ Physics</span>' : ''}</div>
      </div>
      <button onclick="document.getElementById('inspector').style.display='none'" style="background:none;border:none;color:#555;cursor:pointer;font-size:1rem">✕</button>
    </div>
    <div style="padding:12px;display:flex;flex-direction:column;gap:8px;max-height:420px;overflow-y:auto">
      <div style="color:#888;font-size:0.7rem;text-transform:uppercase;letter-spacing:1px">Transform</div>
      <div style="display:grid;grid-template-columns:40px 1fr 1fr 1fr;gap:4px;align-items:center">
        <span style="color:#ef4444;font-weight:600">X</span>
        <input type="number" value="${pos.x.toFixed(1)}" step="0.5" id="insp-x" style="${inputStyle}">
        <span style="color:#4ade80;font-weight:600">Y</span>
        <input type="number" value="${pos.y.toFixed(1)}" step="0.5" id="insp-y" style="${inputStyle}">
      </div>
      <div style="display:grid;grid-template-columns:40px 1fr 1fr 1fr;gap:4px;align-items:center">
        <span style="color:#60a5fa;font-weight:600">Z</span>
        <input type="number" value="${pos.z.toFixed(1)}" step="0.5" id="insp-z" style="${inputStyle}">
        <span style="color:#f7c948;font-weight:600">S</span>
        <input type="number" value="${scl.toFixed(2)}" step="0.1" min="0.01" id="insp-s" style="${inputStyle}">
      </div>
      <div style="display:grid;grid-template-columns:40px 1fr;gap:4px;align-items:center">
        <span style="color:#c084fc;font-weight:600">R°</span>
        <input type="range" min="0" max="360" value="${rotY}" id="insp-r" style="width:100%;accent-color:#ff6b35">
      </div>

      <div style="color:#888;font-size:0.7rem;text-transform:uppercase;letter-spacing:1px;margin-top:4px">Material</div>
      <div style="display:flex;gap:8px;align-items:center">
        <input type="color" value="${hexColor}" id="insp-color" style="width:36px;height:24px;border:1px solid #333;border-radius:4px;cursor:pointer;background:none;padding:0">
        <span id="insp-color-hex" style="color:#666;font-size:0.65rem;font-family:JetBrains Mono,monospace">${hexColor}</span>
      </div>

      <div style="color:#888;font-size:0.7rem;text-transform:uppercase;letter-spacing:1px;margin-top:4px">Physics</div>
      <div style="display:flex;gap:4px;align-items:center">
        <button id="insp-physics-btn" onclick="window._togglePhysicsOnSelected()" style="${btnStyle};border-color:${hasPhys ? '#f7c948' : '#252525'};color:${hasPhys ? '#f7c948' : '#aaa'}">${hasPhys ? '🔴 Remove Physics' : '⚡ Add Physics'}</button>
        ${hasPhys ? '<button onclick="window._launchSelected()" style="' + btnStyle + '" onmouseenter="this.style.borderColor=\'#60a5fa\';this.style.color=\'#60a5fa\'" onmouseleave="this.style.borderColor=\'#252525\';this.style.color=\'#aaa\'">🚀 Launch</button>' : ''}
      </div>

      ${obj.userData.animations ? '<div style="color:#888;font-size:0.7rem;text-transform:uppercase;letter-spacing:1px;margin-top:4px">Animations</div><div style="color:#4ade80;font-size:0.7rem">' + anims + '</div>' : ''}

      <div style="display:flex;gap:4px;margin-top:4px;flex-wrap:wrap">
        <button onclick="window._equipWeapon()" style="${btnStyle}" onmouseenter="this.style.borderColor='#ef4444';this.style.color='#ef4444'" onmouseleave="this.style.borderColor='#252525';this.style.color='#aaa'">⚔️ Equip</button>
        <button onclick="window._animateSelected()" style="${btnStyle}" onmouseenter="this.style.borderColor='#ec4899';this.style.color='#ec4899'" onmouseleave="this.style.borderColor='#252525';this.style.color='#aaa'">🎬 Animate</button>
        <button onclick="window._colorSelected()" style="${btnStyle}" onmouseenter="this.style.borderColor='#4ade80';this.style.color='#4ade80'" onmouseleave="this.style.borderColor='#252525';this.style.color='#aaa'">🎨 Gallery</button>
      </div>
      <div style="display:flex;gap:4px;margin-top:2px">
        <button onclick="window._duplicateSelected()" style="${btnStyle}" onmouseenter="this.style.borderColor='#ff6b35';this.style.color='#ff6b35'" onmouseleave="this.style.borderColor='#252525';this.style.color='#aaa'">📋 Clone</button>
        <button onclick="window._deleteSelected()" style="flex:1;padding:6px;background:#111;border:1px solid #ef4444;border-radius:6px;color:#ef4444;cursor:pointer;font-size:0.72rem;transition:all 0.2s" onmouseenter="this.style.background='rgba(239,68,68,0.1)'" onmouseleave="this.style.background='#111'">🗑 Delete</button>
      </div>
    </div>
  `;

  // Wire up live editing
  const applyTransform = () => {
    const x = parseFloat(document.getElementById('insp-x')?.value || 0);
    const y = parseFloat(document.getElementById('insp-y')?.value || 0);
    const z = parseFloat(document.getElementById('insp-z')?.value || 0);
    const s = parseFloat(document.getElementById('insp-s')?.value || 1);
    const r = parseFloat(document.getElementById('insp-r')?.value || 0);
    obj.position.set(x, y, z);
    obj.scale.setScalar(Math.max(s, 0.01));
    obj.rotation.y = r * Math.PI / 180;
  };
  setTimeout(() => {
    ['insp-x','insp-y','insp-z','insp-s','insp-r'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', applyTransform);
    });
    // Live color picker
    const colorEl = document.getElementById('insp-color');
    if (colorEl) colorEl.addEventListener('input', () => {
      const hex = colorEl.value;
      const lbl = document.getElementById('insp-color-hex');
      if (lbl) lbl.textContent = hex;
      if (selectedObj) {
        selectedObj.traverse(c => {
          if (c.isMesh && c.material && c.material.color) {
            c.material.color.set(hex);
            c.material.needsUpdate = true;
          }
        });
      }
    });
  }, 50);
}

// === PHYSICS INSPECTOR FUNCTIONS ===
window._togglePhysicsOnSelected = async function() {
  if (!selectedObj) return;
  if (selectedObj.userData.hasPhysics) {
    physics.removeRigidbody(selectedObj);
    logOutput('ok', 'Physics removed from ' + (selectedObj.userData.name || 'object'));
  } else {
    const ok = await physics.init();
    if (!ok) { logOutput('err', 'Rapier physics failed to load'); return; }
    window._physicsEnabled = true;
    physics.addRigidbody(selectedObj, 'dynamic');
    logOutput('ok', 'Physics added to ' + (selectedObj.userData.name || 'object') + ' — it will fall and collide!');
  }
  updateInspector(selectedObj);
};

window._launchSelected = function() {
  if (!selectedObj || !selectedObj.userData.hasPhysics) return;
  physics.applyImpulse(selectedObj, 0, 15, 0);
  logOutput('ok', 'Launched ' + (selectedObj.userData.name || 'object') + ' upward!');
};

// Expose physics module globally for advanced users
window._physics = physics;

window._autoFrame = autoFrameScene;
window._deleteSelected = function() {
  if (selectedObj) {
    scene.remove(selectedObj);
    objects.splice(objects.indexOf(selectedObj), 1);
    logOutput('ok', 'Deleted ' + (selectedObj.userData.name || 'object'));
    inspectorPanel.style.display = 'none';
    selectedObj = null;
  }
};

window._duplicateSelected = function() {
  if (selectedObj) {
    const clone = selectedObj.clone();
    clone.position.x += 2;
    clone.userData = { ...selectedObj.userData, name: (selectedObj.userData.name || 'obj') + '_copy' };
    scene.add(clone);
    objects.push(clone);
    window._lastPlacedObj = clone;
    logOutput('ok', 'Cloned ' + (selectedObj.userData.name || 'object'));
  }
};



// === ENHANCED INSPECTOR FUNCTIONS ===
window._equipWeapon = function() {
  if (!selectedObj) return;
  // Open weapons gallery, attach chosen weapon to this character
  showGallery('weapons', { hint: 'Choose a weapon to equip on ' + (selectedObj.userData.name || 'character') }).then(result => {
    if (!result || !selectedObj) return;
    const glb = GLB_MODELS[result.file] || result.file;
    gltfLoader.load('/models/' + glb + '.glb', (gltf) => {
      const weapon = gltf.scene;
      // Scale weapon to reasonable size relative to character
      const charBox = new THREE.Box3().setFromObject(selectedObj);
      const charH = charBox.getSize(new THREE.Vector3()).y;
      const wBox = new THREE.Box3().setFromObject(weapon);
      const wH = wBox.getSize(new THREE.Vector3());
      const maxW = Math.max(wH.x, wH.y, wH.z);
      weapon.scale.setScalar((charH * 0.5) / Math.max(maxW, 0.001));
      
      // Try to attach to right hand bone
      let attached = false;
      // Find best hand bone — try many naming conventions
      let bestBone = null;
      const handPatterns = ['righthand','right_hand','hand_r','handright','hand.r','r_hand','rhand','mixamorig:righthand','righthandindex1','right hand','arm_right','forearm_r','lower_arm_r'];
      selectedObj.traverse(node => {
        if (bestBone) return;
        if (node.isBone || node.type === 'Bone' || node.isObject3D) {
          const n = node.name.toLowerCase();
          for (const p of handPatterns) {
            if (n.includes(p)) { bestBone = node; return; }
          }
        }
      });
      // Second pass: any bone with "right" and "arm" or "hand"
      if (!bestBone) {
        selectedObj.traverse(node => {
          if (bestBone) return;
          if (node.isBone || node.type === 'Bone') {
            const n = node.name.toLowerCase();
            if ((n.includes('right') && (n.includes('hand') || n.includes('wrist'))) || n.includes('r_wrist')) {
              bestBone = node;
            }
          }
        });
      }
      // Third pass: forearm as fallback (many models end at forearm, no hand bone)
      if (!bestBone) {
        selectedObj.traverse(node => {
          if (bestBone) return;
          if (node.isBone || node.type === 'Bone') {
            const n = node.name.toLowerCase();
            if (n.includes('rightforearm') || n.includes('right_forearm') || n.includes('forearm_r') || n.includes('r_forearm') ||
                (n.includes('right') && n.includes('forearm')) || (n.includes('right') && n.includes('arm') && !n.includes('upper'))) {
              bestBone = node;
            }
          }
        });
      }
      // Fourth pass: ANY bone with arm/hand  
      if (!bestBone) {
        selectedObj.traverse(node => {
          if (bestBone) return;
          if (node.isBone || node.type === 'Bone') {
            const n = node.name.toLowerCase();
            if (n.includes('forearm') || n.includes('hand')) {
              bestBone = node;
            }
          }
        });
      }
      
      if (bestBone) {
        bestBone.add(weapon);
        weapon.position.set(0, 0.05, 0.1);
        // Rotate based on weapon type — guns point forward, swords point up
        const isGun = result.name && (result.name.includes('pistol') || result.name.includes('gun') || result.name.includes('rifle') || result.name.includes('sniper') || result.name.includes('smg') || result.name.includes('shotgun') || result.name.includes('blaster'));
        if (isGun) {
          weapon.rotation.set(0, Math.PI/2, 0);
        } else {
          weapon.rotation.set(-Math.PI/2, 0, 0);
        }
        attached = true;
      } else {
        // No bone found — try ANY child that could be a hand/arm
        let anyBone = null;
        selectedObj.traverse(node => {
          if (anyBone) return;
          if (node.isBone || node.type === 'Bone') {
            const n = node.name.toLowerCase();
            if (n.includes('hand') || n.includes('wrist') || n.includes('palm') || n.includes('finger')) {
              anyBone = node;
            }
          }
        });
        if (anyBone) {
          anyBone.add(weapon);
          weapon.position.set(0, 0, 0.1);
          weapon.rotation.set(0, Math.PI/2, 0);
          attached = true;
        } else {
          // Absolute fallback — position at right side of character
          const handY = charH * 0.55;
          const handX = charH * 0.3;
          weapon.position.set(handX, handY, charH * 0.1);
          weapon.rotation.set(0, 0, -Math.PI/4);
          selectedObj.add(weapon);
        }
      }
      
      weapon.userData.name = 'equipped_' + result.name;
      weapon.userData.isEquipped = true;
      // Log bone info for debugging
      let boneCount = 0;
      selectedObj.traverse(n => { if (n.isBone) boneCount++; });
      if (boneCount === 0) console.log('[CrateEngine] ⚠️ No bones found on character — weapon positioned manually');
      logOutput('ok', '⚔️ Equipped ' + result.name + (attached ? ' (attached to hand bone)' : ' (positioned at side, ' + boneCount + ' bones found)'));
    });
  });
};

window._animateSelected = function() {
  if (!selectedObj) return;
  const name = selectedObj.userData.name || 'object';
  
  // If object has embedded animations, show those first
  if (selectedObj.userData.clips && selectedObj.userData.clips.length > 0) {
    // Build a combined menu: embedded clips + procedural anims
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.92);z-index:10005;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:monospace;overflow-y:auto;padding:20px;';
    overlay.innerHTML = '<div style="font-size:24px;color:#ec4899;margin-bottom:6px;">🎬 ANIMATIONS for ' + name + '</div><div style="font-size:13px;color:#22c55e;margin-bottom:20px;">This model has ' + selectedObj.userData.clips.length + ' embedded animation(s)</div>';
    
    // Embedded clips section
    const embeddedGrid = document.createElement('div');
    embeddedGrid.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;justify-content:center;max-width:700px;margin-bottom:24px;';
    selectedObj.userData.clips.forEach(clip => {
      const btn = document.createElement('button');
      btn.textContent = '▶️ ' + clip.name;
      btn.style.cssText = 'padding:10px 16px;background:rgba(34,197,94,0.1);border:1px solid #22c55e;border-radius:8px;color:#22c55e;cursor:pointer;font-family:monospace;font-size:13px;transition:all 0.2s;';
      btn.onmouseenter = () => { btn.style.background = 'rgba(34,197,94,0.2)'; };
      btn.onmouseleave = () => { btn.style.background = 'rgba(34,197,94,0.1)'; };
      btn.onclick = () => {
        if (selectedObj.userData.mixer) {
          selectedObj.userData.mixer.stopAllAction();
          const action = selectedObj.userData.mixer.clipAction(clip);
          action.reset().play();
        }
        overlay.remove();
        logOutput('ok', '▶️ Playing "' + clip.name + '" on ' + name);
      };
      embeddedGrid.appendChild(btn);
    });
    overlay.appendChild(embeddedGrid);
    
    // Divider
    overlay.appendChild(Object.assign(document.createElement('div'), { textContent: '— or apply procedural animation —', style: 'color:#555;font-size:12px;margin-bottom:16px;' }));
    
    // Procedural anims
    const procGrid = document.createElement('div');
    procGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,110px);gap:8px;justify-content:center;max-width:700px;';
    const anims = ['spin','bounce','float','pulse','wobble','orbit','swing','breathe','shake','walk','idle','dance','attack','die','jump'];
    const icons = ['🔄','⬆️','☁️','💫','↔️','🌀','🔔','🫁','📳','🚶','🧍','💃','⚔️','💀','🦘'];
    anims.forEach((a, i) => {
      const btn = document.createElement('button');
      btn.textContent = icons[i] + ' ' + a;
      btn.style.cssText = 'padding:8px;background:rgba(236,72,153,0.05);border:1px solid rgba(236,72,153,0.2);border-radius:6px;color:#ec4899;cursor:pointer;font-family:monospace;font-size:12px;transition:all 0.2s;';
      btn.onclick = () => { overlay.remove(); applyProceduralAnimation(selectedObj, a); logOutput('ok', icons[i] + ' Applied "' + a + '" to ' + name); };
      procGrid.appendChild(btn);
    });
    overlay.appendChild(procGrid);
    
    const closeBtn = document.createElement('div');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'position:fixed;top:15px;right:20px;font-size:28px;color:#fff;cursor:pointer;z-index:2147483647;background:rgba(0,0,0,0.5);border-radius:50%;width:40px;height:40px;display:flex;align-items:center;justify-content:center;';
    closeBtn.onclick = () => overlay.remove();
    overlay.appendChild(closeBtn);
    document.body.appendChild(overlay);
    return;
  }
  
  // No embedded anims — show animation gallery
  showAnimationGallery(name).then(result => {
    if (result && selectedObj) {
      applyProceduralAnimation(selectedObj, result.animId);
      logOutput('ok', '🎬 Applied "' + result.animName + '" to ' + name);
    }
  });
};

window._colorSelected = function() {
  if (!selectedObj) return;
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:10005;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:monospace;';
  overlay.innerHTML = '<div style="font-size:24px;color:#4ade80;margin-bottom:20px;">🎨 COLOR PICKER</div>';
  
  const colors = [
    { name: 'Red', hex: '#ef4444' }, { name: 'Orange', hex: '#f97316' },
    { name: 'Yellow', hex: '#eab308' }, { name: 'Green', hex: '#22c55e' },
    { name: 'Blue', hex: '#3b82f6' }, { name: 'Purple', hex: '#8b5cf6' },
    { name: 'Pink', hex: '#ec4899' }, { name: 'Cyan', hex: '#06b6d4' },
    { name: 'White', hex: '#ffffff' }, { name: 'Gray', hex: '#6b7280' },
    { name: 'Brown', hex: '#92400e' }, { name: 'Black', hex: '#1f2937' },
    { name: 'Gold', hex: '#fbbf24' }, { name: 'Silver', hex: '#d1d5db' },
    { name: 'Dark Red', hex: '#991b1b' }, { name: 'Dark Blue', hex: '#1e3a5f' },
    { name: 'Forest', hex: '#14532d' }, { name: 'Lavender', hex: '#c4b5fd' },
  ];
  
  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(6,70px);gap:10px;justify-content:center;';
  colors.forEach(c => {
    const swatch = document.createElement('div');
    swatch.style.cssText = 'width:70px;height:50px;border-radius:8px;cursor:pointer;transition:transform 0.15s;display:flex;align-items:end;justify-content:center;padding-bottom:4px;font-size:10px;color:' + (c.hex === '#1f2937' || c.hex === '#14532d' || c.hex === '#991b1b' || c.hex === '#1e3a5f' ? '#888' : '#000') + ';background:' + c.hex + ';border:2px solid rgba(255,255,255,0.1);';
    swatch.textContent = c.name;
    swatch.onmouseenter = () => { swatch.style.transform = 'scale(1.1)'; swatch.style.borderColor = '#fff'; };
    swatch.onmouseleave = () => { swatch.style.transform = 'scale(1)'; swatch.style.borderColor = 'rgba(255,255,255,0.1)'; };
    swatch.onclick = () => {
      const color = new THREE.Color(c.hex);
      selectedObj.traverse(child => {
        if (child.isMesh && child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach(m => { m.color.copy(color); m.needsUpdate = true; });
        }
      });
      overlay.remove();
      logOutput('ok', '🎨 Colored ' + (selectedObj.userData.name || 'object') + ' ' + c.name);
    };
    grid.appendChild(swatch);
  });
  overlay.appendChild(grid);
  
  // Custom color input
  const custom = document.createElement('div');
  custom.style.cssText = 'margin-top:16px;display:flex;gap:8px;align-items:center;';
  custom.innerHTML = '<span style="color:#888;font-size:12px;">Custom:</span>';
  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.value = '#ff6b35';
  colorInput.style.cssText = 'width:50px;height:35px;border:none;cursor:pointer;background:transparent;';
  colorInput.onchange = () => {
    const color = new THREE.Color(colorInput.value);
    selectedObj.traverse(child => {
      if (child.isMesh && child.material) {
        (Array.isArray(child.material) ? child.material : [child.material]).forEach(m => { m.color.copy(color); m.needsUpdate = true; });
      }
    });
    overlay.remove();
    logOutput('ok', '🎨 Applied custom color to ' + (selectedObj.userData.name || 'object'));
  };
  custom.appendChild(colorInput);
  overlay.appendChild(custom);
  
  const closeBtn = document.createElement('div');
  closeBtn.textContent = '✕';
  closeBtn.style.cssText = 'position:fixed;top:15px;right:20px;font-size:28px;color:#fff;cursor:pointer;z-index:2147483647;background:rgba(0,0,0,0.5);border-radius:50%;width:40px;height:40px;display:flex;align-items:center;justify-content:center;';
  closeBtn.onclick = () => overlay.remove();
  overlay.appendChild(closeBtn);
  document.body.appendChild(overlay);
};

// === CONTEXT-AWARE VOICE — "it" / "that" / "this" refers to selected or last placed object ===
window._lastPlacedObj = null;

// Auto-frame camera to fit scene after building
function autoFrameScene() {
  if (objects.length === 0) return;
  const box = new THREE.Box3();
  objects.forEach(obj => {
    try { box.expandByObject(obj); } catch(e) {}
  });
  if (box.isEmpty()) return;
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const dist = maxDim * 1.5;
  camera.position.set(center.x + dist * 0.7, center.y + dist * 0.5, center.z + dist * 0.7);
  controls.target.copy(center);
  if (!playMode) controls.update();
}

// Model Browser — searchable panel of all 1,339 models
function createModelBrowser() {
  const panel = document.createElement('div');
  panel.id = 'model-browser';
  Object.assign(panel.style, {
    position: 'fixed', top: '60px', left: '20px', zIndex: '250',
    width: '280px', maxHeight: '500px', borderRadius: '12px',
    background: '#0a0a0a', border: '1px solid #1f1f1f',
    boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
    display: 'none', flexDirection: 'column', overflow: 'hidden',
    fontFamily: "'Inter', -apple-system, system-ui, sans-serif",
  });

  const header = document.createElement('div');
  Object.assign(header.style, { padding: '12px', borderBottom: '1px solid #1a1a1a', display: 'flex', gap: '8px', alignItems: 'center' });
  header.innerHTML = '<span style="font-size:1rem">📦</span><span style="font-weight:700;font-size:0.85rem;color:#fff;flex:1">Model Browser</span><span style="color:#888;font-size:0.7rem" id="browser-count">1,339 models</span>';
  panel.appendChild(header);

  const search = document.createElement('input');
  search.placeholder = 'Search models...';
  Object.assign(search.style, {
    margin: '8px 12px', padding: '8px 12px', background: '#111', border: '1px solid #252525',
    borderRadius: '8px', color: '#e0e0e0', fontSize: '0.8rem', outline: 'none', fontFamily: 'Inter, sans-serif',
  });
  search.onfocus = () => search.style.borderColor = '#ff6b35';
  search.onblur = () => search.style.borderColor = '#252525';
  panel.appendChild(search);

  const list = document.createElement('div');
  Object.assign(list.style, { flex: '1', overflowY: 'auto', padding: '4px 12px 12px', maxHeight: '380px' });
  panel.appendChild(list);

  // Get unique model names
  const modelNames = Object.values(GLB_MODELS).filter((v, i, a) => a.indexOf(v) === i).sort();
  
  function renderList(filter) {
    list.innerHTML = '';
    const filtered = filter ? modelNames.filter(n => n.toLowerCase().includes(filter.toLowerCase())) : modelNames.slice(0, 50);
    const countEl = document.getElementById('browser-count');
    if (countEl) countEl.textContent = filter ? filtered.length + ' found' : '4,122 models';
    
    filtered.slice(0, 60).forEach(name => {
      const item = document.createElement('div');
      Object.assign(item.style, {
        padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem',
        color: '#aaa', transition: 'all 0.15s', fontFamily: "'JetBrains Mono', monospace",
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      });
      // Clean display name
      const display = name.replace(/_/g, ' ').replace(/pack /g, '').replace(/modular /g, '');
      item.innerHTML = '<span>' + display + '</span><span style="color:#333;font-size:0.65rem">.glb</span>';
      item.onmouseenter = () => { item.style.background = '#151515'; item.style.color = '#ff6b35'; };
      item.onmouseleave = () => { item.style.background = 'transparent'; item.style.color = '#aaa'; };
      item.onclick = () => { parseAndExecute('add ' + name.split('_pack_').pop()); };
      list.appendChild(item);
    });
    if (filtered.length > 60) {
      const more = document.createElement('div');
      more.style.cssText = 'color:#555;font-size:0.7rem;padding:8px;text-align:center';
      more.textContent = '+ ' + (filtered.length - 60) + ' more — type to filter';
      list.appendChild(more);
    }
  }
  
  search.oninput = () => renderList(search.value);
  renderList('');
  document.body.appendChild(panel);
  return panel;
}
const modelBrowser = createModelBrowser();

// Toggle model browser with Ctrl+B or button
const browserBtn = document.createElement('button');
browserBtn.innerHTML = '📦';
browserBtn.title = 'Model Browser (Ctrl+B)';
Object.assign(browserBtn.style, {
  position: 'fixed', bottom: '20px', left: '20px', zIndex: '300',
  width: '44px', height: '44px', borderRadius: '50%',
  background: '#111', border: '1px solid #252525',
  fontSize: '20px', cursor: 'pointer', transition: 'all 0.2s',
});
browserBtn.onmouseenter = () => { browserBtn.style.borderColor = '#ff6b35'; browserBtn.style.transform = 'scale(1.1)'; };
browserBtn.onmouseleave = () => { browserBtn.style.borderColor = '#252525'; browserBtn.style.transform = 'scale(1)'; };
browserBtn.onclick = async () => {
  // Open the full category picker (4,122 models, 26 categories)
  const result = await showCategoryPicker();
  if (result && result.file) {
    loadGLBModel(result.file, GLB_MODELS[result.file] || result.file, 0, 0, null, result.path);
    sceneHistory.push('add ' + result.file);
    showToast('✅ Added ' + (result.name||result.file));
  } else if (result && typeof result === 'string') {
    if (characterController) {
      if (!characterController.characterModels[result]) characterController.characterModels[result] = { file: result, animPrefix: '', procedural: true };
      await characterController.loadCharacter(result);
    }
  }
};
document.body.appendChild(browserBtn);
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'b') { e.preventDefault(); browserBtn.click(); }
});

// AI Agent integration
import { CrateAgent } from './ai-agent.mjs?v=5';
import { matchIntent, initVoice, startListening, stopListening, isListening, getStats } from './voice-commands.mjs';
const agent = new CrateAgent((cmd) => {
  parseAndExecute(cmd);
});
// Keep agent synced with scene objects
setInterval(() => {
  const objs = [];
  scene.traverse(c => { if (c.isMesh || c.isGroup) objs.push(c); });
  agent.updateObjects(objs);
}, 2000);

// === ENGINE 2.0 BRIDGE ===
// Expose parseAndExecute for command bus, then initialize the bridge.
window._parseAndExecute = parseAndExecute;

// === AI AGENT INTEGRATION ===
// "agent build X" or "ai build X" triggers the learning agent loop
window._agentReady = false;
import('./runtime/city-agent.mjs?v=23').then(agent => {
  window._agent = agent;
  window._agentReady = true;
  window._agentMemory = agent.loadMemory;
  window._agentStats = agent.getStats;
  window._agentShowMemory = agent.showMemory;
  console.log('[Agent] City agent v4 loaded. Memory:', agent.loadMemory().length, 'lessons');
  console.log('[Agent] Commands: agent build | agent memory | agent stats | agent clear memory');
}).catch(err => console.warn('[Agent] Agent not loaded:', err.message));

import('./runtime/engine-bridge.mjs').catch(() => null) /* optional */; Promise.resolve().then(bridge => {
  bridge.initBridge();
  console.log('[Engine] Command bus bridge loaded.');
}).catch(err => console.warn('[Engine] Bridge load deferred:', err.message));


window.addEventListener('keydown', e => {
  if (e.key === 'v' && playMode && characterController) {
    characterController.toggleCameraMode();
  }
  if ((e.key === 'Tab' || e.key === 'i' || e.key === 'I') && playMode && characterController) {
    e.preventDefault();
    if (characterController.toggleInventoryPanel) characterController.toggleInventoryPanel();
  }
  if (e.key === 'f' && playMode) {
    e.preventDefault();
    e.stopImmediatePropagation();
    
    // Already in vehicle? Exit.
    if (activeVehicle) {
      exitVehicle();
      if (characterController && characterController.inVehicle) characterController.exitVehicle();
      return;
    }
    
    if (!characterController) return;
    
    // In building? Exit building.
    if (characterController.inBuilding) {
      characterController._exitBuilding();
      return;
    }
    
    const pos = characterController.position;
    
    // Check buildings first (range 10)
    const nearBuilding = objects.find(o => {
      if (!o.userData.name || !o.userData.isGLB) return false;
      const n = o.userData.name.toLowerCase();
      const isBuilding = n.includes('building') || n.includes('house') || n.includes('story') || n.includes('tower');
      return isBuilding && pos.distanceTo(o.position) < 10;
    });
    if (nearBuilding) {
      characterController._enterBuilding(nearBuilding);
      return;
    }
    
    // Check vehicles (range 6)
    const near = getNearestVehicle(pos, 6);
    if (near) {
      enterVehicle(near);
      characterController.inVehicle = near.obj;
    }
  }
});


// === AI CUSTOM CODE SANDBOX (Rosebud-style) ===
// Users describe game behavior → AI generates JS → runs in sandboxed scope
// Only affects the user's saved game, never touches engine code

// _userScripts declared at top of file
window._userScriptScope = {}; // Shared state between user scripts

function createUserScriptSandbox() {
  // Safe APIs the user script can access
  return {
    scene, camera, objects,
    THREE: THREE,
    addObj, 
    showToast: (msg) => { const t = document.createElement('div'); t.style.cssText='position:fixed;top:20%;left:50%;transform:translateX(-50%);color:#4ade80;font-family:monospace;font-size:18px;z-index:10001;pointer-events:none;background:rgba(0,0,0,0.8);padding:10px 20px;border-radius:8px;'; t.textContent=msg; document.body.appendChild(t); setTimeout(()=>{t.style.opacity='0';t.style.transition='opacity 0.5s'},2000); setTimeout(()=>t.remove(),2500); },
    getPlayer: () => characterController,
    getNPCs: () => npcController ? npcController.npcs : [],
    getObjects: () => objects,
    getObjectByName: (name) => objects.find(o => o.userData.name && o.userData.name.toLowerCase().includes(name.toLowerCase())),
    playMode: () => playMode,
    onUpdate: null, // Set by user script — called every frame with (dt)
    onKeyPress: null, // Set by user script — called on keydown with (key)
    onCollision: null, // Set by user script — called when player hits object
    state: window._userScriptScope, // Persistent state between scripts
    dt: 0,
    time: 0,
    keys: {},
    console: { log: (...args) => console.log('[UserScript]', ...args) },
    Math, JSON, Array, Object, String, Number, Boolean, Date,
    setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 10000)), // Cap at 10s
    setInterval: (fn, ms) => setInterval(fn, Math.max(ms, 100)), // Min 100ms
    clearTimeout, clearInterval,
  };
}

function runUserScript(scriptObj) {
  try {
    const sandbox = createUserScriptSandbox();
    const wrappedCode = '"use strict";\n' + scriptObj.code;
    const fn = new Function(...Object.keys(sandbox), wrappedCode);
    fn(...Object.values(sandbox));
    // Store update/key callbacks
    scriptObj._onUpdate = sandbox.onUpdate;
    scriptObj._onKeyPress = sandbox.onKeyPress;
    scriptObj._onCollision = sandbox.onCollision;
    scriptObj._running = true;
    console.log('[AI Sandbox] ✅ Script "' + scriptObj.name + '" running');
    return true;
  } catch (err) {
    console.error('[AI Sandbox] ❌ Script error:', err.message);
    showToast('❌ Script error: ' + err.message);
    scriptObj._running = false;
    return false;
  }
}

// Update user scripts each frame
function updateUserScripts(dt) {
  if (!window._userScripts || !Array.isArray(window._userScripts)) return;
  const time = performance.now() * 0.001;
  for (const s of window._userScripts) {
    if (!s.enabled || !s._running) continue;
    try {
      if (s._onUpdate) s._onUpdate(dt, time);
    } catch (err) {
      console.error('[AI Sandbox] Script "' + s.name + '" update error:', err.message);
      s._running = false;
    }
  }
}

// Key events for user scripts
window.addEventListener('keydown', e => {
  if (!window._userScripts) return;
  for (const s of window._userScripts) {
    if (!s.enabled || !s._running || !s._onKeyPress) continue;
    try { s._onKeyPress(e.key.toLowerCase()); } catch(err) { /* silent */ }
  }
});

// Add user script command: "script", "custom code", "game logic"
// Also: AI generates code from natural language description
async function generateUserScript(description) {
  // Check if user has API key configured
  const settings = JSON.parse(localStorage.getItem('crate-ai-settings') || '{}');
  const provider = settings.provider || 'openai';
  const apiKey = settings.apiKey;
  
  if (!apiKey) {
    showToast('⚠ Set your AI API key in Settings (⚙) to use custom code generation');
    return null;
  }
  
  const systemPrompt = `You are a game scripting AI for Crate Engine (Three.js).
Generate ONLY executable JavaScript code. No explanations, no markdown.
Available APIs:
- scene, camera, objects (Three.js scene)
- THREE (Three.js library)
- getPlayer() → character controller with .position, .model
- getNPCs() → array of NPCs with .model, .behavior, .speed
- getObjects() → all scene objects
- getObjectByName(name) → find object
- showToast(msg) → show message to player
- state → persistent object to store variables
- onUpdate = function(dt, time) {} → called every frame
- onKeyPress = function(key) {} → called on key press
- Math, setTimeout, setInterval available

Example: Make coins spin
onUpdate = function(dt) {
  getObjects().filter(o => o.userData.name && o.userData.name.includes('coin')).forEach(o => {
    o.rotation.y += dt * 2;
  });
};`;

  const userMsg = description;
  
  let endpoint, headers, body;
  if (provider === 'openai' || provider === 'groq' || provider === 'deepseek') {
    const urls = { openai: 'https://api.openai.com/v1/chat/completions', groq: 'https://api.groq.com/openai/v1/chat/completions', deepseek: 'https://api.deepseek.com/v1/chat/completions' };
    const models = { openai: 'gpt-4o-mini', groq: 'llama-3.1-8b-instant', deepseek: 'deepseek-chat' };
    endpoint = urls[provider];
    headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey };
    body = JSON.stringify({ model: models[provider], messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMsg }], max_tokens: 1000, temperature: 0.3 });
  } else if (provider === 'claude') {
    endpoint = 'https://api.anthropic.com/v1/messages';
    headers = { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' };
    body = JSON.stringify({ model: 'claude-3-5-haiku-20241022', system: systemPrompt, messages: [{ role: 'user', content: userMsg }], max_tokens: 1000 });
  } else if (provider === 'gemini') {
    endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey;
    headers = { 'Content-Type': 'application/json' };
    body = JSON.stringify({ contents: [{ parts: [{ text: systemPrompt + '\n\nUser request: ' + userMsg }] }] });
  }
  
  try {
    showToast('🤖 Generating custom game logic...');
    const resp = await fetch(endpoint, { method: 'POST', headers, body });
    const data = await resp.json();
    
    let generatedCode = '';
    if (provider === 'claude') {
      generatedCode = data.content?.[0]?.text || '';
    } else if (provider === 'gemini') {
      generatedCode = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } else {
      generatedCode = data.choices?.[0]?.message?.content || '';
    }
    
    // Strip markdown code blocks if present
    generatedCode = generatedCode.replace(/^```(?:javascript|js)?\n?/gm, '').replace(/```$/gm, '').trim();
    
    return generatedCode;
  } catch (err) {
    console.error('[AI Sandbox] Generation failed:', err);
    showToast('❌ AI generation failed: ' + err.message);
    return null;
  }
}

// Script editor modal
function showScriptEditor(existingScript) {
  const existing = existingScript || {};
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:100000;display:flex;align-items:center;justify-content:center;';
  
  overlay.innerHTML = `
    <div style="background:#111;border:2px solid #7c5cff;border-radius:16px;width:700px;max-width:95vw;max-height:90vh;overflow-y:auto;padding:24px;font-family:-apple-system,sans-serif;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <h2 style="color:#7c5cff;margin:0;font-size:1.2rem;">🧠 AI Game Logic Editor</h2>
        <button id="script-close" style="background:none;border:none;color:#666;font-size:24px;cursor:pointer;">✕</button>
      </div>
      
      <div style="margin-bottom:12px;">
        <label style="color:#888;font-size:0.8rem;">Script Name</label>
        <input id="script-name" value="\${existing.name || ''}" placeholder="e.g. Coin Collector" style="width:100%;background:#1a1a2e;border:1px solid #333;border-radius:8px;padding:8px 12px;color:#fff;font-size:0.9rem;margin-top:4px;">
      </div>
      
      <div style="margin-bottom:12px;">
        <label style="color:#888;font-size:0.8rem;">Describe what you want (AI will generate code)</label>
        <textarea id="script-prompt" placeholder="e.g. When the player touches a coin, add 10 points and make the coin disappear with a sparkle effect" style="width:100%;height:60px;background:#1a1a2e;border:1px solid #333;border-radius:8px;padding:8px 12px;color:#fff;font-size:0.85rem;margin-top:4px;resize:vertical;font-family:inherit;"></textarea>
        <button id="script-generate" style="margin-top:6px;background:linear-gradient(135deg,#7c5cff,#4a9eff);border:none;color:#fff;padding:6px 16px;border-radius:8px;cursor:pointer;font-size:0.8rem;">🤖 Generate Code</button>
      </div>
      
      <div style="margin-bottom:12px;">
        <label style="color:#888;font-size:0.8rem;">Code (JavaScript)</label>
        <textarea id="script-code" style="width:100%;height:200px;background:#0a0a1a;border:1px solid #333;border-radius:8px;padding:12px;color:#4ade80;font-family:'JetBrains Mono',monospace;font-size:0.8rem;margin-top:4px;resize:vertical;tab-size:2;">\${existing.code || '// Your custom game logic here\n// Available: getPlayer(), getNPCs(), getObjects(), showToast()\n// Set onUpdate = function(dt) {} for per-frame logic\n// Set onKeyPress = function(key) {} for input\n'}</textarea>
      </div>
      
      <div style="display:flex;gap:8px;">
        <button id="script-run" style="flex:1;padding:10px;background:#16a34a;border:none;color:#fff;border-radius:8px;cursor:pointer;font-weight:600;">▶ Run Script</button>
        <button id="script-save" style="flex:1;padding:10px;background:#7c5cff;border:none;color:#fff;border-radius:8px;cursor:pointer;font-weight:600;">💾 Save Script</button>
        \${existing.id ? '<button id="script-delete" style="padding:10px 16px;background:#ef4444;border:none;color:#fff;border-radius:8px;cursor:pointer;font-weight:600;">🗑</button>' : ''}
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  overlay.querySelector('#script-close').onclick = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  
  overlay.querySelector('#script-generate').onclick = async () => {
    const prompt = overlay.querySelector('#script-prompt').value;
    if (!prompt) return;
    const generated = await generateUserScript(prompt);
    if (generated) {
      overlay.querySelector('#script-code').value = generated;
    }
  };
  
  overlay.querySelector('#script-run').onclick = () => {
    const scriptObj = {
      id: existing.id || 'script_' + Date.now(),
      name: overlay.querySelector('#script-name').value || 'Untitled Script',
      description: overlay.querySelector('#script-prompt').value,
      code: overlay.querySelector('#script-code').value,
      enabled: true,
    };
    // Remove old version if exists
    window._userScripts = window._userScripts.filter(s => s.id !== scriptObj.id);
    window._userScripts.push(scriptObj);
    runUserScript(scriptObj);
    showToast('▶ Script "' + scriptObj.name + '" running!');
  };
  
  overlay.querySelector('#script-save').onclick = () => {
    const scriptObj = {
      id: existing.id || 'script_' + Date.now(),
      name: overlay.querySelector('#script-name').value || 'Untitled Script',
      description: overlay.querySelector('#script-prompt').value,
      code: overlay.querySelector('#script-code').value,
      enabled: true,
    };
    window._userScripts = window._userScripts.filter(s => s.id !== scriptObj.id);
    window._userScripts.push(scriptObj);
    // Save to localStorage
    const saved = window._userScripts.map(s => ({ id: s.id, name: s.name, description: s.description, code: s.code, enabled: s.enabled }));
    localStorage.setItem('crate-user-scripts', JSON.stringify(saved));
    showToast('💾 Script "' + scriptObj.name + '" saved!');
    overlay.remove();
  };
  
  const delBtn = overlay.querySelector('#script-delete');
  if (delBtn) {
    delBtn.onclick = () => {
      window._userScripts = window._userScripts.filter(s => s.id !== existing.id);
      localStorage.setItem('crate-user-scripts', JSON.stringify(window._userScripts.map(s => ({ id: s.id, name: s.name, description: s.description, code: s.code, enabled: s.enabled }))));
      showToast('🗑 Script deleted');
      overlay.remove();
    };
  }
}

// Script list/manager modal
function showScriptManager() {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:100000;display:flex;align-items:center;justify-content:center;';
  
  const scripts = window._userScripts;
  const listHTML = scripts.length ? scripts.map(s => 
    '<div style="display:flex;align-items:center;gap:8px;padding:8px;background:#1a1a2e;border-radius:8px;margin-bottom:6px;cursor:pointer;" data-id="' + s.id + '">' +
    '<span style="color:' + (s.enabled && s._running ? '#4ade80' : '#666') + ';font-size:12px;">●</span>' +
    '<span style="color:#fff;flex:1;font-size:0.85rem;">' + s.name + '</span>' +
    '<button class="script-toggle" data-id="' + s.id + '" style="background:none;border:1px solid #333;color:#888;padding:2px 8px;border-radius:4px;cursor:pointer;font-size:0.7rem;">' + (s.enabled ? 'ON' : 'OFF') + '</button>' +
    '<button class="script-edit" data-id="' + s.id + '" style="background:none;border:1px solid #7c5cff;color:#7c5cff;padding:2px 8px;border-radius:4px;cursor:pointer;font-size:0.7rem;">Edit</button>' +
    '</div>'
  ).join('') : '<p style="color:#666;text-align:center;">No custom scripts yet</p>';
  
  overlay.innerHTML = `
    <div style="background:#111;border:2px solid #7c5cff;border-radius:16px;width:500px;max-width:95vw;max-height:80vh;overflow-y:auto;padding:24px;font-family:-apple-system,sans-serif;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <h2 style="color:#7c5cff;margin:0;font-size:1.1rem;">🧠 Custom Game Scripts</h2>
        <button id="scripts-close" style="background:none;border:none;color:#666;font-size:24px;cursor:pointer;">✕</button>
      </div>
      <div id="scripts-list">\${listHTML}</div>
      <button id="scripts-new" style="width:100%;margin-top:12px;padding:10px;background:linear-gradient(135deg,#7c5cff,#4a9eff);border:none;color:#fff;border-radius:8px;cursor:pointer;font-weight:600;">+ New Script</button>
    </div>
  `;
  
  document.body.appendChild(overlay);
  overlay.querySelector('#scripts-close').onclick = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  overlay.querySelector('#scripts-new').onclick = () => { overlay.remove(); showScriptEditor(); };
  
  overlay.querySelectorAll('.script-edit').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const script = window._userScripts.find(s => s.id === id);
      if (script) { overlay.remove(); showScriptEditor(script); }
    };
  });
  
  overlay.querySelectorAll('.script-toggle').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const script = window._userScripts.find(s => s.id === id);
      if (script) {
        script.enabled = !script.enabled;
        if (script.enabled) runUserScript(script);
        else script._running = false;
        overlay.remove();
        showScriptManager(); // Refresh
      }
    };
  });
}

// Load saved scripts on boot
(function loadUserScripts() {
  try {
    const saved = JSON.parse(localStorage.getItem('crate-user-scripts') || '[]');
    for (const s of saved) {
      window._userScripts.push(s);
      if (s.enabled) runUserScript(s);
    }
    if (saved.length) console.log('[AI Sandbox] Loaded ' + saved.length + ' user scripts');
  } catch(e) {}
})();

// === END AI CUSTOM CODE SANDBOX ===

// === DEBUG/TEST EXPORTS ===
// Init sound on first user interaction
document.addEventListener('click', function() { if (window._sound && window._sound.init) window._sound.init(); }, { once: true });
document.addEventListener('keydown', function() { if (window._sound && window._sound.init) window._sound.init(); }, { once: true });
window._engine = {
  get camera() { return camera; },
  get scene() { return scene; },
  get objects() { return objects; },
  get playMode() { return playMode; },
  get playKeys() { return playKeys; },
  get controls() { return controls; },
  get gameScore() { return gameScore; },
  get character() { return characterController; },
  get npcs() { return npcController; },
  get townBuilder() { return townBuilder; },
  enterPlayMode, exitPlayMode,
  respawn: () => { if (characterController) characterController.respawn(); },
  exec: execSingle,
  get quests() { return questSystem; },
  get crafting() { return craftingSystem; },
  get levels() { return levelSystem; },
  get dialogue() { return dialogueSystem; },
};

// === CODE EDITOR — opens the custom scripting panel ===
window._openCodeEditor = () => {
  showCodeEditor({
    scene, camera, objects,
    characterController, npcController, playMode,
  });
};

// ═══════════════════════════════════════════════════════════════
// MODE SYSTEM — Edit / Play / View with toolbar toggle
// ═══════════════════════════════════════════════════════════════
let _currentMode = 'edit'; // 'edit' | 'play' | 'view'
let _viewMode = false;

function _updateModeButtons(mode) {
  ['edit','play','view'].forEach(m => {
    const btn = document.getElementById('mode-' + m);
    if (!btn) return;
    if (m === mode) {
      btn.style.background = m === 'edit' ? '#ff6b35' : m === 'play' ? '#16a34a' : '#4a9eff';
      btn.style.color = '#fff'; btn.style.fontWeight = '600';
    } else {
      btn.style.background = 'transparent'; btn.style.color = '#666'; btn.style.fontWeight = '400';
    }
  });
}

window._setMode = function(mode) {
  if (mode === _currentMode) return;
  const prev = _currentMode;
  _currentMode = mode;

  // Exit previous mode
  if (prev === 'play') { exitPlayMode(); document.exitPointerLock(); }
  if (prev === 'view') { _viewMode = false; controls.enabled = true; document.exitPointerLock(); }

  // Enter new mode
  if (mode === 'edit') {
    _viewMode = false;
    controls.enabled = true;
    logOutput('ok', 'Edit Mode — click objects to inspect, type commands below');
  } else if (mode === 'play') {
    enterPlayMode();
  } else if (mode === 'view') {
    _viewMode = true;
    controls.enabled = true;
    logOutput('ok', 'View Mode — WASD + Q/E to fly, Shift for speed');
  }

  _updateModeButtons(mode);
  window._currentMode = mode;
};

// Sync mode when enterPlayMode/exitPlayMode are called from elsewhere
const _origEnterPlay = enterPlayMode;
const _origExitPlay = exitPlayMode;
enterPlayMode = function() { _currentMode = 'play'; _updateModeButtons('play'); _origEnterPlay(); };
exitPlayMode = function() { _currentMode = 'edit'; _updateModeButtons('edit'); _origExitPlay(); };

// ═══════════════════════════════════════════════════════════════
// IMPORT / EXPORT UNIFIED MENU
// ═══════════════════════════════════════════════════════════════
window._showImportExport = function(tab) {
  const existing = document.getElementById('ie-modal');
  if (existing) existing.remove();

  const isExport = tab === 'export';
  const overlay = document.createElement('div');
  overlay.id = 'ie-modal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:100001;display:flex;align-items:center;justify-content:center;font-family:-apple-system,sans-serif';
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

  overlay.innerHTML = `
    <div style="background:#111;border:1px solid #333;border-radius:12px;width:460px;max-width:95vw;padding:24px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h2 style="color:#fff;margin:0;font-size:1.1rem">${isExport ? '📤 Export Scene' : '📥 Import Assets'}</h2>
        <button onclick="this.closest('#ie-modal').remove()" style="background:none;border:none;color:#666;font-size:20px;cursor:pointer">✕</button>
      </div>
      ${isExport ? `
        <div style="display:flex;flex-direction:column;gap:8px">
          <button onclick="if(window._runCommand)window._runCommand('share');this.closest('#ie-modal').remove()" style="padding:12px;background:#1a1a2e;border:1px solid #333;border-radius:8px;color:#fff;cursor:pointer;text-align:left;font-size:0.85rem">
            <strong>🔗 Share URL</strong><br><span style="color:#666;font-size:0.75rem">Compressed scene in a link — anyone can open and remix</span>
          </button>
          <button onclick="if(window._exportCrateFile)window._exportCrateFile();this.closest('#ie-modal').remove()" style="padding:12px;background:#1a1a2e;border:1px solid #333;border-radius:8px;color:#fff;cursor:pointer;text-align:left;font-size:0.85rem">
            <strong>📦 Download .crate File</strong><br><span style="color:#666;font-size:0.75rem">JSON scene file — share with other Crate Engine users</span>
          </button>
          <button onclick="if(typeof exportAsHTML==='function')exportAsHTML();this.closest('#ie-modal').remove()" style="padding:12px;background:#1a1a2e;border:1px solid #333;border-radius:8px;color:#fff;cursor:pointer;text-align:left;font-size:0.85rem">
            <strong>🌐 Standalone HTML</strong><br><span style="color:#666;font-size:0.75rem">Self-contained HTML file with Three.js — runs anywhere</span>
          </button>
          <button onclick="if(typeof exportForUnity==='function')exportForUnity();this.closest('#ie-modal').remove()" style="padding:12px;background:#1a1a2e;border:1px solid #333;border-radius:8px;color:#fff;cursor:pointer;text-align:left;font-size:0.85rem">
            <strong>🎮 GLTF for Unity</strong><br><span style="color:#666;font-size:0.75rem">Export scene as GLTF — import directly into Unity</span>
          </button>
          <button onclick="if(typeof exportForUnreal==='function')exportForUnreal();this.closest('#ie-modal').remove()" style="padding:12px;background:#1a1a2e;border:1px solid #333;border-radius:8px;color:#fff;cursor:pointer;text-align:left;font-size:0.85rem">
            <strong>🎮 GLTF for Unreal</strong><br><span style="color:#666;font-size:0.75rem">Export scene as GLTF — import directly into Unreal Engine</span>
          </button>
          <button onclick="if(typeof takeScreenshot==='function')takeScreenshot();this.closest('#ie-modal').remove()" style="padding:12px;background:#1a1a2e;border:1px solid #333;border-radius:8px;color:#fff;cursor:pointer;text-align:left;font-size:0.85rem">
            <strong>📸 Screenshot</strong><br><span style="color:#666;font-size:0.75rem">PNG capture of the current viewport</span>
          </button>
        </div>
      ` : `
        <div style="display:flex;flex-direction:column;gap:8px">
          <button id="ie-import-glb" style="padding:12px;background:#1a1a2e;border:1px solid #333;border-radius:8px;color:#fff;cursor:pointer;text-align:left;font-size:0.85rem">
            <strong>📦 Import GLB/GLTF Model</strong><br><span style="color:#666;font-size:0.75rem">Load a 3D model file into the scene</span>
          </button>
          <button id="ie-import-crate" style="padding:12px;background:#1a1a2e;border:1px solid #333;border-radius:8px;color:#fff;cursor:pointer;text-align:left;font-size:0.85rem">
            <strong>📋 Import .crate Scene</strong><br><span style="color:#666;font-size:0.75rem">Load a scene file saved from Crate Engine</span>
          </button>
          <div style="border:2px dashed #333;border-radius:8px;padding:24px;text-align:center;color:#555;font-size:0.8rem" id="ie-dropzone">
            Or drag & drop files here<br><span style="font-size:0.7rem">.glb, .gltf, .crate</span>
          </div>
        </div>
      `}
    </div>
  `;

  document.body.appendChild(overlay);

  if (!isExport) {
    // Import GLB
    overlay.querySelector('#ie-import-glb').onclick = () => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = '.glb,.gltf';
      inp.onchange = () => { if (inp.files[0]) _importGLBFile(inp.files[0]); overlay.remove(); };
      inp.click();
    };
    // Import .crate
    overlay.querySelector('#ie-import-crate').onclick = () => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = '.crate,.json';
      inp.onchange = () => { if (inp.files[0]) _importCrateFile(inp.files[0]); overlay.remove(); };
      inp.click();
    };
    // Drag and drop
    const dz = overlay.querySelector('#ie-dropzone');
    dz.ondragover = (e) => { e.preventDefault(); dz.style.borderColor = '#ff6b35'; dz.style.color = '#ff6b35'; };
    dz.ondragleave = () => { dz.style.borderColor = '#333'; dz.style.color = '#555'; };
    dz.ondrop = (e) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (!file) return;
      if (file.name.endsWith('.crate') || file.name.endsWith('.json')) _importCrateFile(file);
      else if (file.name.endsWith('.glb') || file.name.endsWith('.gltf')) _importGLBFile(file);
      overlay.remove();
    };
  }
};

function _importGLBFile(file) {
  const url = URL.createObjectURL(file);
  const name = file.name.replace(/\.\w+$/, '');
  if (typeof _loadGLBFromUrl === 'function') {
    _loadGLBFromUrl(name, url, 0, 0, null, file.name, () => URL.revokeObjectURL(url));
    logOutput('ok', 'Imported model: ' + file.name);
  }
}

function _importCrateFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (data.commands && Array.isArray(data.commands)) {
        logOutput('info', 'Loading .crate scene (' + data.commands.length + ' commands)...');
        if (window._parseAndExecute) {
          window._parseAndExecute('clear');
          data.commands.forEach((cmd, i) => {
            setTimeout(() => window._parseAndExecute(cmd), i * 50);
          });
        }
        logOutput('ok', 'Scene loaded from ' + file.name);
      }
    } catch (e) { logOutput('err', 'Invalid .crate file: ' + e.message); }
  };
  reader.readAsText(file);
}

window._exportCrateFile = function() {
  const data = {
    format: 'crate-engine-scene',
    version: 1,
    name: 'My Scene',
    date: new Date().toISOString(),
    commands: (window._sceneHistory || sceneHistory || []).slice(),
    objectCount: objects.length,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'scene_' + Date.now() + '.crate';
  a.click();
  URL.revokeObjectURL(url);
  logOutput('ok', 'Scene exported as .crate file');
};

// ═══════════════════════════════════════════════════════════════
// SAVE / LOAD — Named slots with timestamps
// ═══════════════════════════════════════════════════════════════
window._showSaveLoad = function() {
  const existing = document.getElementById('sl-modal');
  if (existing) existing.remove();

  const saves = JSON.parse(localStorage.getItem('crate-saves') || '[]');

  const overlay = document.createElement('div');
  overlay.id = 'sl-modal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:100001;display:flex;align-items:center;justify-content:center;font-family:-apple-system,sans-serif';
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

  function renderSaves() {
    const currentSaves = JSON.parse(localStorage.getItem('crate-saves') || '[]');
    const listEl = overlay.querySelector('#sl-list');
    if (!listEl) return;
    if (!currentSaves.length) {
      listEl.innerHTML = '<div style="color:#555;text-align:center;padding:20px">No saved scenes yet</div>';
      return;
    }
    listEl.innerHTML = currentSaves.map((s, i) => `
      <div style="display:flex;align-items:center;gap:8px;padding:10px;background:#1a1a2e;border-radius:8px;margin-bottom:6px">
        <div style="flex:1">
          <div style="color:#fff;font-size:0.85rem;font-weight:600">${s.name || 'Untitled'}</div>
          <div style="color:#555;font-size:0.7rem">${new Date(s.date).toLocaleString()} | ${s.objectCount || '?'} objects</div>
        </div>
        <button onclick="window._loadSaveSlot(${i});document.getElementById('sl-modal').remove()" style="padding:4px 12px;background:#16a34a;border:none;color:#fff;border-radius:6px;cursor:pointer;font-size:0.75rem">Load</button>
        <button onclick="window._deleteSaveSlot(${i})" style="padding:4px 8px;background:none;border:1px solid #ef4444;color:#ef4444;border-radius:6px;cursor:pointer;font-size:0.75rem">✕</button>
      </div>
    `).join('');
  }

  overlay.innerHTML = `
    <div style="background:#111;border:1px solid #333;border-radius:12px;width:460px;max-width:95vw;padding:24px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h2 style="color:#fff;margin:0;font-size:1.1rem">💾 Save / Load</h2>
        <button onclick="this.closest('#sl-modal').remove()" style="background:none;border:none;color:#666;font-size:20px;cursor:pointer">✕</button>
      </div>
      <div style="display:flex;gap:6px;margin-bottom:12px">
        <input id="sl-name" placeholder="Save name..." value="Scene ${saves.length + 1}" style="flex:1;background:#1a1a2e;border:1px solid #333;border-radius:6px;padding:8px;color:#fff;font-size:0.85rem">
        <button id="sl-save-btn" style="padding:8px 16px;background:#ff6b35;border:none;color:#fff;border-radius:6px;cursor:pointer;font-weight:600;font-size:0.85rem">Save</button>
      </div>
      <div id="sl-list" style="max-height:300px;overflow-y:auto"></div>
    </div>
  `;

  document.body.appendChild(overlay);
  renderSaves();

  overlay.querySelector('#sl-save-btn').onclick = () => {
    const name = overlay.querySelector('#sl-name').value || 'Untitled';
    const allSaves = JSON.parse(localStorage.getItem('crate-saves') || '[]');
    allSaves.push({
      name,
      date: new Date().toISOString(),
      objectCount: objects.length,
      commands: (window._sceneHistory || sceneHistory || []).slice(),
    });
    localStorage.setItem('crate-saves', JSON.stringify(allSaves));
    logOutput('ok', 'Saved "' + name + '"');
    renderSaves();
    overlay.querySelector('#sl-name').value = 'Scene ' + (allSaves.length + 1);
  };
};

window._loadSaveSlot = function(idx) {
  const saves = JSON.parse(localStorage.getItem('crate-saves') || '[]');
  const save = saves[idx];
  if (!save || !save.commands) return;
  if (window._parseAndExecute) {
    window._parseAndExecute('clear');
    save.commands.forEach((cmd, i) => {
      setTimeout(() => window._parseAndExecute(cmd), i * 50);
    });
  }
  logOutput('ok', 'Loaded "' + save.name + '" (' + save.commands.length + ' commands)');
};

window._deleteSaveSlot = function(idx) {
  const saves = JSON.parse(localStorage.getItem('crate-saves') || '[]');
  const name = saves[idx]?.name || 'save';
  saves.splice(idx, 1);
  localStorage.setItem('crate-saves', JSON.stringify(saves));
  logOutput('ok', 'Deleted "' + name + '"');
  // Re-render
  if (window._showSaveLoad) { document.getElementById('sl-modal')?.remove(); window._showSaveLoad(); }
};

// === SCENE CARD CLICK HANDLERS ===
document.querySelectorAll('.scene-card').forEach(function(card) {
  card.addEventListener('click', function() {
    var sceneName = card.getAttribute('data-scene');
    if (!sceneName) return;
    
    // Scroll to viewport
    var viewport = document.querySelector('.viewport-section') || document.querySelector('canvas');
    if (viewport) viewport.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // Clear current scene first
    var input = document.getElementById('prompt-input');
    if (input) {
      // Execute clear then build
      input.value = 'clear';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      
      setTimeout(function() {
        // Build scene command sequences based on data-scene
        var commands = getSceneCommands(sceneName);
        var delay = 0;
        commands.forEach(function(cmd) {
          setTimeout(function() {
            input.value = cmd;
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
          }, delay);
          delay += 300;
        });
      }, 200);
    }
    
    // Visual feedback on card
    card.style.borderColor = '#ff6b35';
    card.style.boxShadow = '0 0 20px rgba(255,107,53,0.3)';
    setTimeout(function() {
      card.style.borderColor = '';
      card.style.boxShadow = '';
    }, 2000);
  });
});

function getSceneCommands(scene) {
  var scenes = {
    'medieval village': ['add castle', 'add 5 trees', 'add 3 houses', 'add 2 rocks', 'add flowers', 'time sunset', 'add 2 knights'],
    'haunted graveyard': ['add 5 rocks', 'add 3 dead trees', 'time midnight', 'fog', 'make it rain'],
    'pirate island': ['add 5 palm trees', 'add 3 rocks', 'add water', 'time afternoon', 'add sand ground'],
    'cyberpunk city': ['add 8 buildings', 'add road', 'time night', 'fog', 'make it rain'],
    'zombie apocalypse': ['add 5 buildings', 'add 3 rocks', 'time night', 'fog', 'add 3 warriors'],
    'japanese garden': ['add 5 trees', 'add 3 flowers', 'add rocks', 'add water', 'time morning', 'fog'],
    'castle siege': ['add castle', 'add 4 knights', 'add 3 rocks', 'add wall', 'time dusk'],
    'space base': ['add 5 buildings', 'add 2 spheres', 'time midnight', 'add 3 cubes'],
    'farm': ['add 3 houses', 'add 5 trees', 'add flowers', 'add grass', 'time morning'],
    'zombie wasteland': ['add 3 rocks', 'add 2 buildings', 'time dusk', 'fog', 'make it rain'],
    'frozen tundra': ['add 5 pine trees', 'add 3 rocks', 'snow ground', 'snow', 'time morning'],
    'dungeon crawler': ['add castle', 'add 3 rocks', 'add 2 swords', 'time midnight'],
    'dinosaur valley': ['add forest', 'add 5 rocks', 'add water', 'time afternoon'],
    'underwater ruins': ['add 5 rocks', 'add water', 'add 3 cubes', 'fog', 'time dusk'],
    'war zone': ['add 3 buildings', 'add 3 rocks', 'add 2 warriors', 'time night', 'fog', 'make it rain'],
    'enchanted forest': ['add forest', 'add flowers', 'add 3 mushrooms', 'fog', 'time dusk'],
    'dark forest': ['add forest', 'add 3 rocks', 'time midnight', 'fog'],
    'jungle temple': ['add castle', 'add forest', 'add 3 rocks', 'fog', 'time morning'],
    'modern city': ['add 10 buildings', 'add 3 roads', 'time noon'],
    'neon alley': ['add 5 buildings', 'add road', 'time midnight', 'fog'],
    'arena': ['add wall', 'add 3 warriors', 'add 2 swords', 'time afternoon'],
    'platformer world': ['add 8 cubes', 'add 3 spheres', 'add flowers', 'time morning'],
    'desert wasteland': ['add 5 rocks', 'add sand ground', 'time noon', 'add 2 cubes'],
    'ice fortress': ['add castle', 'add wall', 'snow ground', 'snow', 'time morning'],
    'shipwreck cove': ['add 3 rocks', 'add water', 'add 5 palm trees', 'time sunset']
  };
  return scenes[scene] || ['add 5 trees', 'add castle', 'add rocks'];
}

// === SHARE + SAVE BUTTONS ===
(function() {
  // Scene actions - injected into build toolbar as icon buttons
  window._sceneActions = {
    play: function() {
      if (window.parseAndExecute) parseAndExecute('play');
    },
    worlds: function() {
      const existing=document.getElementById('_worldPicker'); if(existing){existing.remove();return;}
      const d=document.createElement('div'); d.id='_worldPicker';
      d.style.cssText='position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#111;border:1px solid #333;border-radius:12px;padding:28px;z-index:9999;font-family:monospace;min-width:340px;box-shadow:0 8px 40px #000;';
      d.innerHTML=`<div style="color:#fff;font-size:18px;font-weight:bold;margin-bottom:20px;text-align:center;">🌍 Choose World</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
  // [REMOVED] buildSpaceCombatGame button
  // [REMOVED] buildCityWorld2 button
  // [REMOVED] buildHorrorWorld button
  <button onclick="document.getElementById('_worldPicker').remove();" style="background:#0d0d0d;border:1px solid #222;color:#555;padding:22px 12px;border-radius:8px;cursor:pointer;font-family:monospace;font-size:13px;line-height:1.8;width:100%;">✖<br><b>CANCEL</b></button>
</div>`;
      document.body.appendChild(d);
    },
    library: function() {
      if (window._showCategoryPicker) {
        window._showCategoryPicker().then(function(result) {
          if (result && result.file) {
            loadGLBModel(result.file, GLB_MODELS[result.file] || result.file, 0, 0, null, result.path);
            sceneHistory.push('add ' + result.file);
            showToast('\u2705 Added ' + (result.name||result.file));
          }
        });
      }
    },
    save: function() {
      var data = serializeScene();
      if (!data) { logOutput('warn', 'Nothing to save'); return; }
      var saves = JSON.parse(localStorage.getItem('crate_saves') || '[]');
      var name = 'Scene ' + (saves.length + 1) + ' (' + new Date().toLocaleDateString() + ')';
      saves.push({ name: name, data: data, date: Date.now() });
      localStorage.setItem('crate_saves', JSON.stringify(saves));
      logOutput('ok', 'Scene saved as "' + name + '"');
      if (window.showToast) showToast('Saved!');
    },
    load: function() {
      var saves = JSON.parse(localStorage.getItem('crate_saves') || '[]');
      if (!saves.length) { logOutput('warn', 'No saved scenes'); return; }
      showLoadModal(saves);
    },
    share: function() { shareScene(); },
    export_html: function() { if (isProUser()) { exportAsHTML(); } else { showUpgradeModal('pro'); } },
    marketplace: function() { openCreatorMarketplace(); },
    settings: function() { showSettings(); },
    unity: function() { if (isProUser()) { exportForUnity(); } else { showUpgradeModal('pro'); } },
    unreal: function() { if (isProUser()) { exportForUnreal(); } else { showUpgradeModal('pro'); } },
  };
})();

function showLoadModal(saves) {
  var old = document.getElementById('load-modal');
  if (old) old.remove();
  
  var modal = document.createElement('div');
  modal.id = 'load-modal';
  Object.assign(modal.style, {
    position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
    background: 'rgba(0,0,0,0.7)', zIndex: '10000', display: 'flex',
    alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)'
  });
  
  var card = document.createElement('div');
  Object.assign(card.style, {
    background: '#0d0d0d', border: '1px solid #252525', borderRadius: '16px',
    padding: '24px', maxWidth: '400px', width: '90%',
    fontFamily: 'JetBrains Mono, monospace', color: '#e0e0e0', maxHeight: '60vh', overflow: 'auto'
  });
  
  var html = '<h3 style="color:#60a5fa;margin:0 0 16px;text-align:center">📂 Saved Scenes</h3>';
  saves.forEach(function(save, i) {
    var cmds = save.data.split('|').length;
    html += '<div class="save-item" data-idx="' + i + '" style="padding:12px;background:#111;border:1px solid #252525;border-radius:8px;margin-bottom:8px;cursor:pointer;transition:all 0.2s">' +
      '<div style="font-weight:700;color:#fff;font-size:0.85rem">' + save.name + '</div>' +
      '<div style="color:#555;font-size:0.7rem">' + cmds + ' commands</div>' +
    '</div>';
  });
  html += '<div style="display:flex;gap:8px;margin-top:12px">' +
    '<button id="load-close" style="flex:1;padding:8px;background:#222;color:#888;border:1px solid #333;border-radius:8px;cursor:pointer;font-family:JetBrains Mono,monospace">Close</button>' +
    '<button id="load-clear" style="padding:8px 12px;background:#222;color:#ef4444;border:1px solid #ef4444;border-radius:8px;cursor:pointer;font-family:JetBrains Mono,monospace;font-size:0.75rem">🗑 Clear All</button>' +
  '</div>';
  
  card.innerHTML = html;
  modal.appendChild(card);
  document.body.appendChild(modal);
  
  // Click handlers
  card.querySelectorAll('.save-item').forEach(function(item) {
    item.addEventListener('mouseenter', function() { item.style.borderColor = '#60a5fa'; });
    item.addEventListener('mouseleave', function() { item.style.borderColor = '#252525'; });
    item.addEventListener('click', function() {
      var idx = parseInt(item.getAttribute('data-idx'));
      var save = saves[idx];
      // Clear and load
      parseAndExecute('clear');
      var commands = save.data.split('|');
      logOutput('info', '📂 Loading "' + save.name + '" (' + commands.length + ' commands)...');
      commands.forEach(function(cmd, i) {
        setTimeout(function() { parseAndExecute(cmd); }, 200 + i * 150);
      });
      modal.remove();
    });
  });
  
  document.getElementById('load-close').addEventListener('click', function() { modal.remove(); });
  document.getElementById('load-clear').addEventListener('click', function() {
    localStorage.removeItem('crate_saves');
    modal.remove();
    logOutput('ok', '🗑 All saves cleared');
  });
  modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
}

// === EXPORT AS STANDALONE HTML ===

// === CREATOR MARKETPLACE ===
function openCreatorMarketplace() {
  if (document.getElementById('marketplace-modal')) document.getElementById('marketplace-modal').remove();
  
  const listings = JSON.parse(localStorage.getItem('crate-marketplace-listings') || '[]');
  
  let listingsHTML = '';
  if (listings.length === 0) {
    listingsHTML = '<div style="text-align:center;padding:40px;color:#888">No listings yet. Upload a model to get started!</div>';
  } else {
    listingsHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;padding:12px">';
    for (const item of listings) {
      const date = new Date(item.created).toLocaleDateString();
      listingsHTML += '<div style="background:#1a1a2e;border:1px solid #333;border-radius:12px;padding:16px;text-align:center;cursor:pointer" onclick="loadMarketplaceItem(\''+item.id+'\',\''+item.name.replace(/'/g,"")+'\')">'+
        '<div style="font-size:32px;margin-bottom:8px">📦</div>'+
        '<div style="color:#fff;font-weight:600;font-size:13px">'+item.name+'</div>'+
        '<div style="color:#888;font-size:11px;margin-top:4px">by '+item.creator+'</div>'+
        '<div style="color:#4ade80;font-size:11px;margin-top:4px">'+(item.price > 0 ? '$'+item.price : 'Free')+'</div>'+
        '<div style="color:#555;font-size:10px;margin-top:4px">'+date+'</div>'+
        '</div>';
    }
    listingsHTML += '</div>';
  }
  
  const m = document.createElement('div');
  m.id = 'marketplace-modal';
  m.innerHTML = `
    <div style="position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:100001;display:flex;align-items:center;justify-content:center;font-family:-apple-system,sans-serif" onclick="if(event.target===this)this.remove()">
      <div style="background:#111;border:1px solid #333;border-radius:16px;width:90%;max-width:800px;max-height:85vh;overflow-y:auto;color:#fff">
        <div style="padding:24px 24px 0;display:flex;justify-content:space-between;align-items:center">
          <div>
            <h2 style="margin:0;font-size:22px">🏪 Creator Marketplace</h2>
            <p style="margin:4px 0 0;color:#888;font-size:13px">Upload, sell, and share 3D models</p>
          </div>
          <button onclick="this.closest('#marketplace-modal').remove()" style="background:none;border:none;color:#888;font-size:24px;cursor:pointer">✕</button>
        </div>
        
        <div style="padding:16px 24px;display:flex;gap:10px;flex-wrap:wrap">
          <button onclick="marketplaceUploadModel()" style="padding:10px 20px;border:none;border-radius:8px;background:#4ade80;color:#000;font-weight:600;cursor:pointer;font-size:14px">📤 Upload GLB Model</button>
          <button onclick="marketplaceUploadAndSell()" style="padding:10px 20px;border:none;border-radius:8px;background:#f59e0b;color:#000;font-weight:600;cursor:pointer;font-size:14px">💰 Upload & Sell</button>
          <button onclick="window.open('https://crateshipgames.com/marketplace','_blank')" style="padding:10px 20px;border:none;border-radius:8px;background:#3b82f6;color:#fff;font-weight:600;cursor:pointer;font-size:14px">🌐 Browse Online</button>
        </div>
        
        <div style="padding:0 24px 24px">
          <h3 style="margin:16px 0 8px;font-size:16px;color:#aaa">📋 Your Listings (${listings.length})</h3>
          ${listingsHTML}
        </div>
      </div>
    </div>`;
  document.body.appendChild(m);
}

function marketplaceUploadModel() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.glb,.gltf';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const name = prompt('Name your model:', file.name.replace(/\.(glb|gltf)$/i, '').replace(/[_-]/g, ' ')) || 'Uploaded Model';
    const category = prompt('Category (characters, weapons, buildings, vehicles, furniture, nature, scifi, food):', 'buildings') || 'buildings';
    
    const buf = await file.arrayBuffer();
    const blob = new Blob([buf]);
    const modelId = 'user_upload_' + Date.now();
    
    await _modelDB.save(modelId, name, category.toLowerCase(), blob);
    _assetCatalog = null;
    
    showToast('📚 "' + name + '" saved to your library in "' + category + '"!');
    // Refresh marketplace modal
    openCreatorMarketplace();
  };
  input.click();
}

function marketplaceUploadAndSell() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.glb,.gltf';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const name = prompt('Name your model:', file.name.replace(/\.(glb|gltf)$/i, '').replace(/[_-]/g, ' ')) || 'Uploaded Model';
    const priceStr = prompt('Price (0 for free):', '0');
    const price = parseFloat(priceStr) || 0;
    
    const buf = await file.arrayBuffer();
    const blob = new Blob([buf]);
    const listingId = 'listing_' + Date.now();
    
    await _modelDB.save(listingId, name, 'premium', blob);
    _assetCatalog = null;
    
    const listings = JSON.parse(localStorage.getItem('crate-marketplace-listings') || '[]');
    listings.push({
      id: listingId,
      name: name,
      creator: localStorage.getItem('crate-username') || 'Anonymous',
      price: price,
      format: 'glb',
      created: new Date().toISOString(),
      downloads: 0,
      fileSize: file.size,
    });
    localStorage.setItem('crate-marketplace-listings', JSON.stringify(listings));
    
    showToast('💰 "' + name + '" listed on marketplace for ' + (price > 0 ? '$' + price : 'FREE') + '!');
    openCreatorMarketplace();
  };
  input.click();
}

function loadMarketplaceItem(id, name) {
  _modelDB.get(id).then(record => {
    if (!record || !record.blob) { showToast('❌ Model data not found'); return; }
    const url = URL.createObjectURL(record.blob);
    loadGLBModel(url, name, null, true);
    document.getElementById('marketplace-modal')?.remove();
    showToast('✓ Loading: ' + name);
  });
}
// === END CREATOR MARKETPLACE ===


// === EXPORT TO UNITY / UNREAL (GLTF/GLB) ===
async function exportForUnity() { await _exportGLTF('unity'); }
async function exportForUnreal() { await _exportGLTF('unreal'); }

async function _exportGLTF(target) {
  logOutput('info', '📦 Preparing ' + target.charAt(0).toUpperCase() + target.slice(1) + ' export...');
  
  try {
    const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
    const exporter = new GLTFExporter();
    
    // Create export scene with all visible objects
    const exportScene = new THREE.Scene();
    
    // Clone terrain
    if (window._terrainMesh) {
      exportScene.add(window._terrainMesh.clone());
    }
    
    // Clone all scene objects
    const objs = window._sceneObjects || [];
    for (const obj of objs) {
      if (obj && obj.visible) {
        try { exportScene.add(obj.clone()); } catch(e) {}
      }
    }
    
    // Add lights info as empty nodes (Unity/Unreal will need manual light setup)
    const lightMarker = new THREE.Object3D();
    lightMarker.name = 'Sun_DirectionalLight';
    lightMarker.position.set(30, 40, 20);
    exportScene.add(lightMarker);
    
    const options = {
      binary: true, // GLB format
      maxTextureSize: 2048,
      includeCustomExtensions: true
    };
    
    exporter.parse(exportScene, function(result) {
      const blob = new Blob([result], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      if (target === 'unity') {
        a.download = 'crate-scene-unity.glb';
      } else {
        a.download = 'crate-scene-unreal.glb';
      }
      
      a.click();
      URL.revokeObjectURL(url);
      
      // Also export a README
      const readme = target === 'unity' 
        ? '# Crate Engine → Unity Import Guide\n\n' +
          '1. Drag `crate-scene-unity.glb` into your Unity Assets folder\n' +
          '2. Unity auto-imports GLB/GLTF files (2020.3+)\n' +
          '3. Drag the imported prefab into your scene\n' +
          '4. Add lights (Sun_DirectionalLight node marks sun position)\n' +
          '5. Materials may need Standard→URP/HDRP conversion\n' +
          '6. Scale: 1 unit = 1 meter (matches Unity default)\n\n' +
          '## Tips\n' +
          '- Enable "Read/Write" on mesh import settings for runtime modification\n' +
          '- Set "Animation Type" to Humanoid for characters\n' +
          '- Textures import alongside the GLB automatically\n'
        : '# Crate Engine → Unreal Import Guide\n\n' +
          '1. File → Import into Level (or drag to Content Browser)\n' +
          '2. Select `crate-scene-unreal.glb`\n' +
          '3. Choose "Scene" import for full hierarchy\n' +
          '4. Unreal imports GLTF/GLB natively (UE5)\n' +
          '5. Add directional light at Sun_DirectionalLight position\n' +
          '6. Scale: 1 unit = 1 meter = 100 Unreal units (auto-scaled)\n\n' +
          '## Tips\n' +
          '- Use Datasmith for better material conversion\n' +
          '- Check "Combine Meshes" for performance\n' +
          '- Nanite works with imported static meshes\n';
      
      const readmeBlob = new Blob([readme], { type: 'text/markdown' });
      const readmeUrl = URL.createObjectURL(readmeBlob);
      const readmeA = document.createElement('a');
      readmeA.href = readmeUrl;
      readmeA.download = target === 'unity' ? 'UNITY-IMPORT-GUIDE.md' : 'UNREAL-IMPORT-GUIDE.md';
      setTimeout(() => { readmeA.click(); URL.revokeObjectURL(readmeUrl); }, 500);
      
      logOutput('ok', '📦 Exported for ' + target.charAt(0).toUpperCase() + target.slice(1) + '! GLB + import guide downloaded.');
    }, function(error) {
      logOutput('error', '❌ Export failed: ' + error.message);
    }, options);
    
  } catch(e) {
    logOutput('error', '❌ Export failed: ' + e.message);
  }
}

function exportAsHTML() {
  var data = serializeScene();
  if (!data) { logOutput('warn', '⚠ Nothing to export — build something first!'); return; }
  
  var commands = data.split('|');
  var cmdStr = JSON.stringify(commands);
  
  var html = '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
    '<title>Crate Engine Scene</title>\n' +
    '<style>body{margin:0;overflow:hidden;background:#000}canvas{display:block}</style>\n' +
    '<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"}}<\/script>\n' +
    '</head>\n<body>\n<canvas id="viewport"></canvas>\n' +
    '<div style="position:fixed;bottom:10px;left:10px;color:#555;font-family:monospace;font-size:11px">Built with <a href="https://crateshipgames.com" style="color:#ff6b35">Crate Engine</a></div>\n' +
    '<script type="module">\n' +
    'import * as THREE from "three";\nimport {OrbitControls} from "three/addons/controls/OrbitControls.js";\n' +
    'const canvas=document.getElementById("viewport");\n' +
    'const renderer=new THREE.WebGLRenderer({canvas,antialias:true});\n' +
    'renderer.setSize(window.innerWidth,window.innerHeight);\n' +
    'renderer.shadowMap.enabled=true;\n' +
    'const scene=new THREE.Scene();\n' +
    'scene.background=new THREE.Color(0x1a1a2e);\n' +
    'const camera=new THREE.PerspectiveCamera(60,window.innerWidth/window.innerHeight,0.1,500);\n' +
    'camera.position.set(15,12,15);\n' +
    'const controls=new OrbitControls(camera,canvas);\n' +
    'controls.enableDamping=true;\n' +
    'scene.add(new THREE.AmbientLight(0x404050,2));\n' +
    'const sun=new THREE.DirectionalLight(0xfff5e0,3);\n' +
    'sun.position.set(30,40,20);sun.castShadow=true;\n' +
    'scene.add(sun);\n' +
    '// Ground\nconst ground=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.MeshStandardMaterial({color:0x2d5a27,roughness:0.9}));\n' +
    'ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);\n' +
    '// Simple object creators\n' +
    'function makeMat(c){return new THREE.MeshStandardMaterial({color:c,roughness:0.7,metalness:0.1})}\n' +
    'function addCube(x,z){const m=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),makeMat(Math.random()*0xffffff));m.position.set(x||Math.random()*10-5,0.5,z||Math.random()*10-5);m.castShadow=true;scene.add(m);}\n' +
    'function addSphere(x,z){const m=new THREE.Mesh(new THREE.SphereGeometry(0.5,16,16),makeMat(Math.random()*0xffffff));m.position.set(x||Math.random()*10-5,0.5,z||Math.random()*10-5);m.castShadow=true;scene.add(m);}\n' +
    'function addTree(x,z){const g=new THREE.Group();const trunk=new THREE.Mesh(new THREE.CylinderGeometry(0.15,0.2,1.5),makeMat(0x8B4513));trunk.position.y=0.75;const leaves=new THREE.Mesh(new THREE.SphereGeometry(0.8,8,8),makeMat(0x228B22));leaves.position.y=2;g.add(trunk,leaves);g.position.set(x||(Math.random()-0.5)*20,0,z||(Math.random()-0.5)*20);g.castShadow=true;scene.add(g);}\n' +
    'function addRock(x,z){const m=new THREE.Mesh(new THREE.DodecahedronGeometry(0.5+Math.random()*0.5),makeMat(0x888888));m.position.set(x||(Math.random()-0.5)*15,0.3,z||(Math.random()-0.5)*15);m.castShadow=true;scene.add(m);}\n' +
    '// Parse commands\nconst cmds=' + cmdStr + ';\n' +
    'cmds.forEach(function(c){\n' +
    '  const l=c.toLowerCase();\n' +
    '  const n=parseInt((l.match(/(\\d+)/)||[0,1])[1]);\n' +
    '  if(l.includes("cube"))for(let i=0;i<n;i++)addCube();\n' +
    '  if(l.includes("sphere"))for(let i=0;i<n;i++)addSphere();\n' +
    '  if(l.includes("tree"))for(let i=0;i<n;i++)addTree();\n' +
    '  if(l.includes("rock"))for(let i=0;i<n;i++)addRock();\n' +
    '  if(l.includes("rain")){const rg=new THREE.BufferGeometry();const pos=new Float32Array(3000);for(let i=0;i<3000;i++){pos[i*3]=(Math.random()-0.5)*50;pos[i*3+1]=Math.random()*20;pos[i*3+2]=(Math.random()-0.5)*50;}rg.setAttribute("position",new THREE.BufferAttribute(pos,3));scene.add(new THREE.Points(rg,new THREE.PointsMaterial({color:0x8888ff,size:0.05})));}\n' +
    '  if(l.includes("night")){scene.background=new THREE.Color(0x050515);sun.intensity=0.08;}\n' +
    '  if(l.includes("sunset")){scene.background=new THREE.Color(0xff8844);sun.intensity=0.6;}\n' +
    '  if(l.includes("fog"))scene.fog=new THREE.FogExp2(0x888899,0.02);\n' +
    '});\n' +
    'function animate(){requestAnimationFrame(animate);controls.update();renderer.render(scene,camera);}\n' +
    'animate();\n' +
    'window.addEventListener("resize",()=>{camera.aspect=window.innerWidth/window.innerHeight;camera.updateProjectionMatrix();renderer.setSize(window.innerWidth,window.innerHeight);});\n' +
    '<\/script>\n</body>\n</html>';
  
  var blob = new Blob([html], {type: 'text/html'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'crate-scene.html';
  a.click();
  URL.revokeObjectURL(url);
  logOutput('ok', '📦 Exported! Open crate-scene.html in any browser.');
}


// === PRO SUBSCRIPTION SYSTEM ===
var STRIPE_LINKS = { pro: 'https://buy.stripe.com/3cI9AV4Sv6TY15Q1aMffy00', premium: 'https://buy.stripe.com/6oUfZjfx96TY29U4mYffy01' };

function isProUser() {
  return true; // All features free during beta — no paywalls
}

function setProStatus(val) {
  localStorage.setItem('crate_pro', val ? 'true' : 'false');
}

// Check for Stripe success redirect
(function checkProRedirect() {
  var params = new URLSearchParams(window.location.search);
  if (params.get('pro') === 'true' || params.get('success') === 'true') {
    setProStatus(true);
    // Clean URL
    var clean = window.location.origin + window.location.pathname + window.location.hash;
    window.history.replaceState({}, '', clean);
    setTimeout(function() {
      logOutput('ok', '🎉 Welcome to Crate Engine Pro! All features unlocked.');
      showProWelcome();
    }, 1500);
  }
})();

function showProWelcome() {
  var banner = document.createElement('div');
  Object.assign(banner.style, {
    position: 'fixed', top: '60px', left: '50%', transform: 'translateX(-50%)',
    background: 'linear-gradient(135deg, #ff6b35, #f7c948)', color: '#000',
    padding: '12px 24px', borderRadius: '12px', fontFamily: 'JetBrains Mono, monospace',
    fontWeight: '700', fontSize: '0.9rem', zIndex: '10001', textAlign: 'center',
    boxShadow: '0 4px 20px rgba(255,107,53,0.4)'
  });
  banner.innerHTML = '⚡ Pro Unlocked! Export, premium models, and more are now yours.';
  document.body.appendChild(banner);
  setTimeout(function() { banner.style.transition = 'opacity 0.5s'; banner.style.opacity = '0'; setTimeout(function() { banner.remove(); }, 500); }, 5000);
}

function showUpgradeModal(tier) {
  tier = tier || 'pro';
  var old = document.getElementById('upgrade-modal');
  if (old) old.remove();

  var modal = document.createElement('div');
  modal.id = 'upgrade-modal';
  Object.assign(modal.style, {
    position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
    background: 'rgba(0,0,0,0.8)', zIndex: '10000', display: 'flex',
    alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)'
  });

  var card = document.createElement('div');
  Object.assign(card.style, {
    background: '#0d0d0d', border: '2px solid ' + (tier === 'premium' ? '#f7c948' : '#ff6b35'), borderRadius: '20px',
    padding: '32px', maxWidth: '420px', width: '90%', textAlign: 'center',
    fontFamily: 'JetBrains Mono, monospace', color: '#e0e0e0',
    boxShadow: '0 0 40px rgba(255,107,53,0.2)'
  });

  card.innerHTML =
    '<div style="font-size:2.5rem;margin-bottom:8px">⚡</div>' +
    '<h2 style="color:' + (tier === 'premium' ? '#f7c948' : '#ff6b35') + ';margin:0 0 8px;font-size:1.3rem">' + (tier === 'premium' ? 'Go Premium' : 'Go Pro') + '</h2>' +
    '<p style="color:#888;font-size:0.85rem;margin-bottom:20px">Unlock the full power of Crate Engine</p>' +
    '<div style="background:#111;border-radius:12px;padding:16px;margin-bottom:20px;text-align:left;font-size:0.8rem;color:#ccc;line-height:2">' +
      '✅ Export games (no watermark)<br>' +
      '✅ 500+ premium 3D models<br>' +
      '✅ Unlimited AI prompts<br>' +
      '✅ Publish to crateshipgames.com<br>' +
      '✅ Priority support<br>' +
      '✅ Early access to new features' +
    '</div>' +
    '<div style="font-size:2rem;font-weight:900;color:#fff;margin-bottom:4px">' + (tier === 'premium' ? '$14.99' : '$4.99') + '<span style="font-size:0.9rem;color:#888">/month</span></div>' +
    '<p style="color:#555;font-size:0.7rem;margin-bottom:16px">Cancel anytime · No contracts</p>' +
    '<div style="display:flex;gap:8px;flex-direction:column">' +
      '<button id="upgrade-stripe-btn" style="padding:14px;background:linear-gradient(135deg,#ff6b35,#f7c948);color:#000;border:none;border-radius:10px;font-weight:700;font-size:1rem;cursor:pointer;font-family:JetBrains Mono,monospace;transition:transform 0.2s">' + (tier === 'premium' ? '💎 Subscribe Premium' : '⚡ Subscribe Pro') + '</button>' +
      '<button id="upgrade-close-btn" style="padding:10px;background:transparent;color:#555;border:1px solid #252525;border-radius:10px;cursor:pointer;font-family:JetBrains Mono,monospace;font-size:0.8rem">Maybe Later</button>' +
    '</div>';

  modal.appendChild(card);
  document.body.appendChild(modal);

  document.getElementById('upgrade-stripe-btn').addEventListener('click', function() {
    var link = STRIPE_LINKS[tier] || STRIPE_LINKS.pro; if (link) {
      window.open(link, '_blank');
    } else {
      // Fallback - coming soon
      this.textContent = '🚀 Coming Soon!';
      this.style.background = '#333';
      this.style.color = '#888';
      setTimeout(function() { modal.remove(); }, 2000);
    }
  });

  document.getElementById('upgrade-close-btn').addEventListener('click', function() { modal.remove(); });
  modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
}

// Expose for pricing section button
window._showUpgradeModal = showUpgradeModal;

// Add Pro badge to nav if pro user
(function addProBadge() {
  if (!isProUser()) return;
  setTimeout(function() {
    var logo = document.querySelector('nav .logo');
    if (logo) {
      logo.innerHTML += ' <span style="background:#ff6b35;color:#000;font-size:0.5rem;padding:2px 6px;border-radius:4px;vertical-align:middle;font-weight:700">PRO</span>';
    }
  }, 500);
})();
function showHelp() {
window.showHelp = showHelp;
  var old = document.getElementById('help-modal');
  if (old) { old.remove(); return; }
  
  var modal = document.createElement('div');
  modal.id = 'help-modal';
  Object.assign(modal.style, {
    position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
    background: 'rgba(0,0,0,0.9)', zIndex: '10000', display: 'flex',
    alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)',
    overflow: 'auto'
  });
  
  var card = document.createElement('div');
  Object.assign(card.style, {
    background: '#0d0d0d', border: '1px solid #252525', borderRadius: '16px',
    padding: '24px', maxWidth: '900px', width: '95%', maxHeight: '85vh', overflow: 'auto',
    fontFamily: 'JetBrains Mono, monospace', color: '#e0e0e0'
  });
  
  // Header
  var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">' +
    '<h2 style="color:#ff6b35;margin:0">⌨️ All Commands</h2>' +
    '<button onclick="this.closest(\'#help-modal\').remove()" style="background:none;border:none;color:#555;font-size:1.5rem;cursor:pointer">✕</button></div>';
  
  // Build grid from COMMANDS_SHOWCASE
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">';
  
  const colors = ['#4ade80','#60a5fa','#f59e0b','#c084fc','#ef4444','#22d3ee','#fb923c','#a78bfa','#f472b6','#34d399','#fbbf24','#818cf8','#fb7185','#2dd4bf'];
  ci = 0;
  
  for (const [category, commands] of Object.entries(window._COMMANDS_SHOWCASE || {})) {
    const color = colors[ci % colors.length];
    ci++;
    html += '<div style="background:#111;border-radius:8px;padding:12px;border:1px solid #1a1a1a">';
    html += '<h4 style="color:' + color + ';margin:0 0 8px">' + category + '</h4>';
    html += '<div style="color:#888;font-size:0.72rem;line-height:2">';
    commands.forEach(function(cmd) {
      html += '<span onclick="document.getElementById(\'help-modal\').remove();if(window._runCommand)window._runCommand(\'' + cmd.replace(/'/g, "\\'") + '\')" style="display:inline-block;background:#1a1a1a;padding:2px 8px;border-radius:4px;margin:2px;cursor:pointer;transition:background 0.2s;border:1px solid #252525" onmouseover="this.style.background=\'#252525\'" onmouseout="this.style.background=\'#1a1a1a\'">' + cmd + '</span>';
    });
    html += '</div></div>';
  }
  
  html += '</div>';
  
  // Pro tip
  html += '<div style="margin-top:16px;padding:12px;background:#111;border-radius:8px;border:1px solid #252525;text-align:center">' +
    '<span style="color:#ff6b35;font-weight:700">💡 Click any command to run it!</span> ' +
    '<span style="color:#888;font-size:0.8rem">Or combine with "and" — <code style="color:#4ade80">build tropical paradise and equip sword and play</code></span></div>';
  
  // Play mode controls
  html += '<div style="margin-top:8px;padding:12px;background:#111;border-radius:8px;border:1px solid #252525">' +
    '<h4 style="color:#ff6b35;margin:0 0 8px">🎮 Play Mode Controls</h4>' +
    '<div style="color:#888;font-size:0.72rem;display:grid;grid-template-columns:1fr 1fr;gap:4px">' +
    '<span>WASD — Move</span><span>Space — Jump</span>' +
    '<span>Shift — Run</span><span>Ctrl — Sprint</span>' +
    '<span>C — Dodge Roll</span><span>E / Click — Attack</span>' +
    '<span>Q — Heavy Attack</span><span>V — Toggle FPS/TPS</span>' +
    '<span>T — Swap Shoulder</span><span>F — Interact</span>' +
    '<span>1/2/3 — Weapon Slots</span><span>ESC — Exit Play</span>' +
    '</div></div>';
  
  card.innerHTML = html;
  modal.appendChild(card);
  document.body.appendChild(modal);
  modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
}

// Add help button to toolbar
(function() {
  var helpBtn = document.createElement('button');
  helpBtn.textContent = '❓';
  helpBtn.title = 'Command Reference';
  Object.assign(helpBtn.style, {
    position: 'fixed', bottom: '20px', left: '20px', width: '40px', height: '40px',
    background: '#222', color: '#888', border: '1px solid #333', borderRadius: '50%',
    cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace', fontSize: '1rem',
    zIndex: '1000', transition: 'all 0.2s', display: 'flex', alignItems: 'center',
    justifyContent: 'center'
  });
  helpBtn.addEventListener('mouseenter', function() { helpBtn.style.borderColor = '#ff6b35'; helpBtn.style.color = '#ff6b35'; });
  helpBtn.addEventListener('mouseleave', function() { helpBtn.style.borderColor = '#333'; helpBtn.style.color = '#888'; });
  helpBtn.addEventListener('click', showHelp);
  document.body.appendChild(helpBtn);
})();

// === WELCOME TOAST FOR FIRST-TIME VISITORS ===
(function() {
  if (localStorage.getItem('crate_visited')) return;
  localStorage.setItem('crate_visited', '1');
  
  var toast = document.createElement('div');
  Object.assign(toast.style, {
    position: 'fixed', bottom: '80px', left: '50%', transform: 'translateX(-50%)',
    background: '#111', border: '1px solid #ff6b35', borderRadius: '12px',
    padding: '16px 24px', zIndex: '9999', fontFamily: 'JetBrains Mono, monospace',
    color: '#e0e0e0', fontSize: '0.85rem', textAlign: 'center', maxWidth: '400px',
    boxShadow: '0 4px 20px rgba(255,107,53,0.2)', animation: 'fadeInUp 0.5s ease'
  });
  toast.innerHTML = '👋 <strong style="color:#ff6b35">Welcome to Crate Engine!</strong><br>' +
    '<span style="color:#888;font-size:0.75rem">Type a command like <code style="color:#4ade80">add castle</code> or click a scene below.<br>Press <code style="color:#4ade80">❓</code> for all commands.</span>';
  
  var style = document.createElement('style');
  style.textContent = '@keyframes fadeInUp{from{opacity:0;transform:translateX(-50%) translateY(20px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}';
  document.head.appendChild(style);
  
  document.body.appendChild(toast);
  setTimeout(function() { toast.style.transition = 'opacity 0.5s'; toast.style.opacity = '0'; setTimeout(function() { toast.remove(); }, 500); }, 6000);
})();

// === KEYBOARD SHORTCUT: ? for help, / to focus prompt ===
document.addEventListener('keydown', function(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.key === '?' || (e.key === 'h' && !e.ctrlKey && !e.metaKey)) {
    e.preventDefault();
    showHelp();
  }
  if (e.key === '/') {
    e.preventDefault();
    var input = document.getElementById('prompt-input');
    if (input) input.focus();
  }
});


// === DRAG & DROP MODEL IMPORT ===
(function() {
  const dropZone = document.querySelector('.viewport-wrapper') || document.querySelector('canvas');
  if (!dropZone) return;
  
  const dropOverlay = document.createElement('div');
  dropOverlay.id = 'drop-overlay';
  dropOverlay.style.cssText = 'display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(124,92,255,0.15);border:4px dashed #7c5cff;z-index:99999;pointer-events:none;align-items:center;justify-content:center;';
  dropOverlay.innerHTML = '<div style="background:rgba(0,0,0,0.9);padding:30px 50px;border-radius:16px;border:2px solid #7c5cff;text-align:center;"><div style="font-size:48px;margin-bottom:12px;">📦</div><div style="color:#7c5cff;font-size:20px;font-weight:700;">Drop GLB Model Here</div><div style="color:#888;font-size:14px;margin-top:8px;">.glb, .gltf supported</div></div>';
  document.body.appendChild(dropOverlay);
  
  
// === MOBILE TOUCH CONTROLS ===
(function() {
  // Only show on touch devices
  if (!('ontouchstart' in window) && !navigator.maxTouchPoints) return;
  
  const container = document.createElement('div');
  container.id = 'mobile-controls';
  container.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:9999;pointer-events:none;display:none;';
  
  // Virtual joystick (left side)
  const joystickArea = document.createElement('div');
  joystickArea.style.cssText = 'position:absolute;bottom:30px;left:30px;width:140px;height:140px;pointer-events:auto;';
  
  const joystickBg = document.createElement('div');
  joystickBg.style.cssText = 'width:140px;height:140px;border-radius:50%;background:rgba(255,255,255,0.1);border:2px solid rgba(255,255,255,0.2);position:relative;';
  
  const joystickKnob = document.createElement('div');
  joystickKnob.style.cssText = 'width:50px;height:50px;border-radius:50%;background:rgba(255,255,255,0.35);position:absolute;top:45px;left:45px;transition:none;';
  joystickBg.appendChild(joystickKnob);
  joystickArea.appendChild(joystickBg);
  container.appendChild(joystickArea);
  
  // Action buttons (right side)
  const btnStyle = 'width:56px;height:56px;border-radius:50%;border:2px solid rgba(255,255,255,0.3);font-size:22px;color:rgba(255,255,255,0.8);background:rgba(255,255,255,0.1);pointer-events:auto;-webkit-tap-highlight-color:transparent;';
  
  const btnArea = document.createElement('div');
  btnArea.style.cssText = 'position:absolute;bottom:30px;right:20px;pointer-events:none;';
  
  // Jump button
  const jumpBtn = document.createElement('button');
  jumpBtn.style.cssText = btnStyle + 'position:absolute;bottom:70px;right:0px;';
  jumpBtn.textContent = '⬆';
  jumpBtn.setAttribute('data-action', 'jump');
  btnArea.appendChild(jumpBtn);
  
  // Attack button
  const atkBtn = document.createElement('button');
  atkBtn.style.cssText = btnStyle + 'position:absolute;bottom:0px;right:70px;';
  atkBtn.textContent = '⚔️';
  atkBtn.setAttribute('data-action', 'attack');
  btnArea.appendChild(atkBtn);
  
  // Interact button
  const intBtn = document.createElement('button');
  intBtn.style.cssText = btnStyle + 'position:absolute;bottom:0px;right:0px;';
  intBtn.textContent = 'F';
  intBtn.setAttribute('data-action', 'interact');
  btnArea.appendChild(intBtn);
  
  // Sprint button
  const sprintBtn = document.createElement('button');
  sprintBtn.style.cssText = btnStyle + 'position:absolute;bottom:70px;right:70px;font-size:16px;';
  sprintBtn.textContent = '🏃';
  sprintBtn.setAttribute('data-action', 'sprint');
  btnArea.appendChild(sprintBtn);
  
  container.appendChild(btnArea);
  
  // Camera look (right half of screen, not on buttons)
  let _lookTouchId = null;
  let _lookStartX = 0;
  let _lookStartY = 0;
  
  // Joystick state
  let _joyTouchId = null;
  let _joyCenter = { x: 0, y: 0 };
  let _joySprinting = false;
  
  // Wire joystick
  joystickArea.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    _joyTouchId = t.identifier;
    const rect = joystickBg.getBoundingClientRect();
    _joyCenter = { x: rect.left + 70, y: rect.top + 70 };
  }, { passive: false });
  
  document.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === _joyTouchId) {
        const dx = t.clientX - _joyCenter.x;
        const dy = t.clientY - _joyCenter.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const maxDist = 45;
        const clampDist = Math.min(dist, maxDist);
        const angle = Math.atan2(dy, dx);
        
        joystickKnob.style.left = (45 + Math.cos(angle) * clampDist) + 'px';
        joystickKnob.style.top = (45 + Math.sin(angle) * clampDist) + 'px';
        
        // Map to WASD keys
        const norm = clampDist / maxDist;
        const cc = window.characterController;
        if (cc) {
          cc.keys['w'] = dy < -15;
          cc.keys['s'] = dy > 15;
          cc.keys['a'] = dx < -15;
          cc.keys['d'] = dx > 15;
        }
      }
      
      // Camera look
      if (t.identifier === _lookTouchId) {
        const cc = window.characterController;
        if (cc && typeof cc.cameraYaw !== 'undefined') {
          cc.cameraYaw -= (t.clientX - _lookStartX) * 0.004;
          cc.cameraPitch = Math.max(-1.2, Math.min(1.2, cc.cameraPitch + (t.clientY - _lookStartY) * 0.003));
          _lookStartX = t.clientX;
          _lookStartY = t.clientY;
        }
      }
    }
  }, { passive: false });
  
  document.addEventListener('touchend', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === _joyTouchId) {
        _joyTouchId = null;
        joystickKnob.style.left = '45px';
        joystickKnob.style.top = '45px';
        const cc = window.characterController;
        if (cc) { cc.keys['w'] = false; cc.keys['s'] = false; cc.keys['a'] = false; cc.keys['d'] = false; }
      }
      if (t.identifier === _lookTouchId) {
        _lookTouchId = null;
      }
    }
  });
  
  // Camera look touch (right half of screen)
  document.addEventListener('touchstart', (e) => {
    for (const t of e.changedTouches) {
      if (t.clientX > window.innerWidth * 0.4 && !e.target.closest('button') && !e.target.closest('#mobile-controls button')) {
        if (_lookTouchId === null) {
          _lookTouchId = t.identifier;
          _lookStartX = t.clientX;
          _lookStartY = t.clientY;
        }
      }
    }
  }, { passive: true });
  
  // Action buttons
  btnArea.addEventListener('touchstart', (e) => {
    const action = e.target.getAttribute('data-action');
    const cc = window.characterController;
    if (!cc) return;
    e.preventDefault();
    if (action === 'jump') cc.keys[' '] = true;
    if (action === 'attack') cc.keys['e'] = true;
    if (action === 'interact') cc.keys['f'] = true;
    if (action === 'sprint') { _joySprinting = !_joySprinting; cc.keys['shift'] = _joySprinting; sprintBtn.style.background = _joySprinting ? 'rgba(74,222,128,0.4)' : 'rgba(255,255,255,0.1)'; }
  }, { passive: false });
  
  btnArea.addEventListener('touchend', (e) => {
    const action = e.target.getAttribute('data-action');
    const cc = window.characterController;
    if (!cc) return;
    if (action === 'jump') cc.keys[' '] = false;
    if (action === 'attack') cc.keys['e'] = false;
    if (action === 'interact') cc.keys['f'] = false;
    // Sprint is toggle, not hold
  });
  
  document.body.appendChild(container);
  
  // Show/hide with play mode
  window._mobileControls = {
    show() { container.style.display = 'block'; },
    hide() { container.style.display = 'none'; },
  };
})();
// === END MOBILE TOUCH CONTROLS ===


// === TERRAIN PAINTING SYSTEM ===
(function() {
  let _paintActive = false;
  let _paintColor = new THREE.Color(0x2d5a27); // default green
  let _paintRadius = 5;
  let _paintStrength = 0.7;
  let _paintUI = null;
  
  const PAINT_PRESETS = {
    grass:      { color: 0x2d5a27, label: '🌿 Grass' },
    dirt:       { color: 0x8B6914, label: '🟤 Dirt' },
    sand:       { color: 0xC2B280, label: '🏖️ Sand' },
    snow:       { color: 0xE8E8F0, label: '❄️ Snow' },
    rock:       { color: 0x666666, label: '🪨 Rock' },
    mud:        { color: 0x5C4033, label: '💩 Mud' },
    lava:       { color: 0xFF4400, label: '🌋 Lava' },
    water:      { color: 0x2266AA, label: '💧 Water' },
    darkgrass:  { color: 0x1a3a15, label: '🌲 Dark Grass' },
    path:       { color: 0x9B8B6E, label: '🛤️ Path' },
  };
  
  window._terrainPaint = {
    toggle() {
      _paintActive = !_paintActive;
      if (_paintActive) this._showUI(); else this._hideUI();
      return _paintActive ? '🎨 Terrain painting ON — click terrain to paint' : '🎨 Terrain painting OFF';
    },
    
    setColor(preset) {
      const p = PAINT_PRESETS[preset];
      if (p) { _paintColor.set(p.color); return '🎨 Paint: ' + p.label; }
      // Try hex
      try { _paintColor.set(preset); return '🎨 Paint color set'; } catch(e) {}
      return '❌ Unknown paint preset. Try: ' + Object.keys(PAINT_PRESETS).join(', ');
    },
    
    setRadius(r) { _paintRadius = Math.max(1, Math.min(30, r)); return '🎨 Brush radius: ' + _paintRadius; },
    
    paint(x, z) {
      const terrain = window._terrainMesh;
      if (!terrain) return;
      const geo = terrain.geometry;
      const colors = geo.attributes.color;
      const positions = geo.attributes.position;
      if (!colors || !positions) return;
      
      const worldMatrix = terrain.matrixWorld;
      const invMatrix = new THREE.Matrix4().copy(worldMatrix).invert();
      const localPoint = new THREE.Vector3(x, 0, z).applyMatrix4(invMatrix);
      
      let changed = false;
      for (let i = 0; i < positions.count; i++) {
        const vx = positions.getX(i);
        const vy = positions.getY(i);
        const vz = positions.getZ(i);
        // Terrain is rotated -PI/2, so Y in geometry = Z in world, Z in geometry = -Y in world (height)
        const dx = vx - localPoint.x;
        const dz = vy - localPoint.z; // Note: geometry Y maps to world Z after rotation
        const dist = Math.sqrt(dx * dx + dz * dz);
        
        if (dist < _paintRadius) {
          const falloff = 1 - (dist / _paintRadius);
          const strength = falloff * falloff * _paintStrength;
          const r = THREE.MathUtils.lerp(colors.getX(i), _paintColor.r, strength);
          const g = THREE.MathUtils.lerp(colors.getY(i), _paintColor.g, strength);
          const b = THREE.MathUtils.lerp(colors.getZ(i), _paintColor.b, strength);
          colors.setXYZ(i, r, g, b);
          changed = true;
        }
      }
      
      if (changed) {
        colors.needsUpdate = true;
      }
    },
    
    _showUI() {
      if (_paintUI) return;
      _paintUI = document.createElement('div');
      _paintUI.id = 'terrain-paint-ui';
      _paintUI.style.cssText = 'position:fixed;top:50%;left:16px;transform:translateY(-50%);background:rgba(0,0,0,0.9);border:1px solid #8b5cf6;border-radius:12px;padding:12px;z-index:10000;font-family:-apple-system,sans-serif;width:140px;';
      
      html = '<div style="color:#8b5cf6;font-weight:700;font-size:12px;margin-bottom:8px">🎨 PAINT BRUSH</div>';
      for (const [key, preset] of Object.entries(PAINT_PRESETS)) {
        const hex = '#' + new THREE.Color(preset.color).getHexString();
        html += '<button onclick="window._terrainPaint.setColor(\''+key+'\');document.querySelectorAll(\'.paint-swatch\').forEach(s=>s.style.outline=\'none\');this.style.outline=\'2px solid #fff\'" class="paint-swatch" style="display:inline-block;width:28px;height:28px;margin:2px;border:none;border-radius:6px;background:'+hex+';cursor:pointer" title="'+preset.label+'"></button>';
      }
      html += '<div style="margin-top:8px"><label style="color:#aaa;font-size:10px">Radius</label><input type="range" min="1" max="20" value="'+_paintRadius+'" oninput="window._terrainPaint.setRadius(+this.value)" style="width:100%"></div>';
      html += '<button onclick="window._terrainPaint.toggle()" style="width:100%;margin-top:8px;padding:6px;background:#ef4444;border:none;border-radius:6px;color:#fff;cursor:pointer;font-size:11px">✕ Close</button>';
      _paintUI.innerHTML = html;
      document.body.appendChild(_paintUI);
    },
    
    _hideUI() {
      if (_paintUI) { _paintUI.remove(); _paintUI = null; }
    },
    
    isActive() { return _paintActive; }
  };
  
  // Paint on click when active
  document.addEventListener('mousedown', (e) => {
    if (!_paintActive || e.button !== 0) return;
    if (e.target.closest('#terrain-paint-ui')) return;
    const terrain = window._terrainMesh;
    if (!terrain) return;
    
    const rect = canvas.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(mouse, camera);
    const hits = ray.intersectObject(terrain);
    if (hits.length > 0) {
      window._terrainPaint.paint(hits[0].point.x, hits[0].point.z);
    }
  });
  
  document.addEventListener('mousemove', (e) => {
    if (!_paintActive || !(e.buttons & 1)) return;
    if (e.target.closest('#terrain-paint-ui')) return;
    const terrain = window._terrainMesh;
    if (!terrain) return;
    
    const rect = canvas.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(mouse, camera);
    const hits = ray.intersectObject(terrain);
    if (hits.length > 0) {
      window._terrainPaint.paint(hits[0].point.x, hits[0].point.z);
    }
  });
})();
// === END TERRAIN PAINTING ===

let dragCounter = 0;
  document.addEventListener('dragenter', (e) => { e.preventDefault(); dragCounter++; dropOverlay.style.display = 'flex'; });
  document.addEventListener('dragleave', (e) => { e.preventDefault(); dragCounter--; if (dragCounter <= 0) { dropOverlay.style.display = 'none'; dragCounter = 0; } });
  document.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    dropOverlay.style.display = 'none';
    dragCounter = 0;
    
    const files = [...e.dataTransfer.files].filter(f => f.name.endsWith('.glb') || f.name.endsWith('.gltf'));
    if (!files.length) { alert('Please drop .glb or .gltf files'); return; }
    
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const blob = new Blob([evt.target.result]);
        const url = URL.createObjectURL(blob);
        const name = file.name.replace(/\.(glb|gltf)$/i, '').replace(/[_-]/g, ' ');
        
        // Use the engine's GLB loader
        const loader = new THREE.GLTFLoader ? new THREE.GLTFLoader() : window._gltfLoader;
        if (!loader && window.gltfLoader) { window.gltfLoader.load(url, handleLoaded); return; }
        
        // Direct Three.js loading
        const { GLTFLoader } = window;
        const gl = new (window._GLTFLoaderClass || gltfLoader.constructor)();
        gl.setDRACOLoader(dracoLoader);
        gl.load(url, (gltf) => {
          const model = gltf.scene;
          const box = new THREE.Box3().setFromObject(model);
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());
          model.position.sub(center);
          
          const maxDim = Math.max(size.x, size.y, size.z);
          if (maxDim > 20) model.scale.setScalar(10 / maxDim);
          else if (maxDim < 0.5) model.scale.setScalar(2 / maxDim);
          
          // Place in front of camera
          const camDir = new THREE.Vector3();
          camera.getWorldDirection(camDir);
          model.position.set(
            camera.position.x + camDir.x * 10,
            0,
            camera.position.z + camDir.z * 10
          );
          
          model.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
          model.userData.name = name;
          model.userData.isGLB = true;
          model.userData.isImported = true;
          
          scene.add(model);
          objects.push(model);
          if (window._sceneObjects) window._sceneObjects.push(model);
          sceneHistory.push('add ' + name);
          
          // Save to IndexedDB for persistence
          const importId = 'user_import_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
          const importBlob = new Blob([evt.target.result]);
          _modelDB.save(importId, name, 'my-models', importBlob).then(() => {
            _assetCatalog = null; // Force catalog refresh
            console.log('[Import] Saved to library:', name);
          });
          
          logOutput('ok', '✓ Imported & saved to library: ' + name + ' (' + (file.size/1024/1024).toFixed(1) + 'MB)');
          
          URL.revokeObjectURL(url);
        }, undefined, (err) => {
          console.error('Import error:', err);
          alert('Failed to load model: ' + file.name);
          URL.revokeObjectURL(url);
        });
      };
      reader.readAsArrayBuffer(file);
    });
  });
  console.log('[Engine] Drag & drop GLB import ready');
})();
// === END DRAG & DROP ===


// === TUTORIAL / ONBOARDING SYSTEM ===
(function() {
  const TUTORIAL_KEY = 'crate_tutorial_done';
  // Tour is now manual — triggered from toolbar button
  return; // Don't auto-show
  
  const steps = [
    { title: '👋 Welcome to Crate Engine!', text: 'Build 3D worlds with voice or text commands. Let\'s take a quick tour!', target: null },
    { title: '💬 Command Prompt', text: 'Type any command here: "add tree", "build a village", "make it rain"', target: '#prompt-input' },
    { title: '🎤 Voice Commands', text: 'Click the mic to use voice! Say "add a castle" or "make it night"', target: '#voice-btn' },
    { title: '🎮 Play Mode', text: 'Type "play" to enter the world! WASD to move, Space to jump, E to attack.', target: null },
    { title: '🏠 Enter Buildings', text: 'Walk up to buildings and press F to go inside. Walk into doors to auto-enter!', target: null },
    { title: '🧗 Climb Things', text: 'Walk up to ladders or vines and press W to climb. Space to jump off!', target: null },
    { title: '🗣️ Talk to NPCs', text: 'Press F near any NPC for contextual dialogue — merchants, guards, wizards!', target: null },
    { title: '📦 Import Models', text: 'Drag & drop any .glb file onto the viewport to import your own 3D models!', target: null },
    { title: '🚀 You\'re Ready!', text: 'Try: "build a medieval village" then type "play" to explore it!\n\n77,000+ voice & text commands at your fingertips.', target: '#prompt-input' },
  ];
  
  let currentStep = 0;
  
  const overlay = document.createElement('div');
  overlay.id = 'tutorial-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:100000;display:flex;align-items:center;justify-content:center;';
  
  const card = document.createElement('div');
  card.style.cssText = 'background:#12121a;border:2px solid #7c5cff;border-radius:20px;padding:32px 40px;max-width:480px;width:90vw;text-align:center;position:relative;';
  
  const title = document.createElement('h2');
  title.style.cssText = 'color:#7c5cff;font-size:22px;margin-bottom:12px;font-family:-apple-system,sans-serif;';
  
  const text = document.createElement('p');
  text.style.cssText = 'color:#ccc;font-size:15px;line-height:1.6;margin-bottom:24px;font-family:-apple-system,sans-serif;white-space:pre-line;';
  
  const progress = document.createElement('div');
  progress.style.cssText = 'display:flex;gap:6px;justify-content:center;margin-bottom:20px;';
  
  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:12px;justify-content:center;';
  
  const skipBtn = document.createElement('button');
  skipBtn.textContent = 'Skip Tour';
  skipBtn.style.cssText = 'background:none;border:1px solid #555;color:#888;padding:10px 24px;border-radius:10px;cursor:pointer;font-size:14px;';
  skipBtn.onclick = () => { localStorage.setItem(TUTORIAL_KEY, '1'); overlay.remove(); if (window._onTutorialDone) window._onTutorialDone(); };
  
  const nextBtn = document.createElement('button');
  nextBtn.style.cssText = 'background:linear-gradient(135deg,#7c5cff,#5c3cdf);color:#fff;border:none;padding:10px 32px;border-radius:10px;cursor:pointer;font-size:14px;font-weight:700;';
  
  card.appendChild(title);
  card.appendChild(text);
  card.appendChild(progress);
  btnRow.appendChild(skipBtn);
  btnRow.appendChild(nextBtn);
  card.appendChild(btnRow);
  overlay.appendChild(card);
  
  function showStep() {
    const step = steps[currentStep];
    title.textContent = step.title;
    text.textContent = step.text;
    nextBtn.textContent = currentStep === steps.length - 1 ? "Let's Build! 🚀" : 'Next →';
    
    // Update progress dots
    progress.innerHTML = '';
    steps.forEach((_, i) => {
      const dot = document.createElement('div');
      dot.style.cssText = 'width:8px;height:8px;border-radius:50%;' + (i === currentStep ? 'background:#7c5cff;' : i < currentStep ? 'background:#5c3cdf;' : 'background:#333;');
      progress.appendChild(dot);
    });
    
    // Highlight target element
    document.querySelectorAll('.tutorial-highlight').forEach(el => el.classList.remove('tutorial-highlight'));
    if (step.target) {
      const el = document.querySelector(step.target);
      if (el) {
        el.classList.add('tutorial-highlight');
        el.style.position = el.style.position || 'relative';
        el.style.zIndex = '100001';
        el.style.boxShadow = '0 0 0 4px #7c5cff, 0 0 20px rgba(124,92,255,0.5)';
        el.style.borderRadius = '8px';
      }
    }
  }
  
  nextBtn.onclick = () => {
    currentStep++;
    if (currentStep >= steps.length) {
      localStorage.setItem(TUTORIAL_KEY, '1');
      overlay.remove();
      if (window._onTutorialDone) window._onTutorialDone();
      document.querySelectorAll('.tutorial-highlight').forEach(el => {
        el.style.boxShadow = '';
        el.style.zIndex = '';
      });
    } else {
      showStep();
    }
  };
  
  // Show after 1 second
  setTimeout(() => {
    document.body.appendChild(overlay);
    showStep();
  }, 1500);
  
  console.log('[Engine] Tutorial system ready');
})();
// === END TUTORIAL ===


// Model catalog system moved to top of file (see loadModelCatalog)


function showSuggestionPanel(query, results) {
  let panel = document.getElementById('ai-suggest-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'ai-suggest-panel';
    panel.style.cssText = 'position:fixed;bottom:60px;left:50%;transform:translateX(-50%);width:700px;max-width:95vw;max-height:340px;overflow-y:auto;background:rgba(8,8,16,0.97);border:2px solid #7c5cff;border-radius:16px;padding:16px;z-index:99999;font-family:-apple-system,sans-serif;backdrop-filter:blur(12px);display:none;';
    document.body.appendChild(panel);
  }
  
  if (!results.length) { panel.style.display = 'none'; return; }
  
  html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">';
  html += '<div style="color:#7c5cff;font-size:14px;font-weight:700;">🤖 AI Agent — Found ' + results.length + ' models for "' + query + '"</div>';
  html += '<button onclick="document.getElementById(\'ai-suggest-panel\').style.display=\'none\'" style="background:none;border:none;color:#888;font-size:18px;cursor:pointer;">✕</button>';
  html += '</div>';
  
  // Group by category
  const grouped = {};
  for (const m of results) {
    const cat = m.cat || 'Other';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(m);
  }
  
  for (const [cat, items] of Object.entries(grouped)) {
    const catIcon = items[0].icon || '📦';
    html += '<div style="color:#888;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin:12px 0 6px;font-weight:600;">' + catIcon + ' ' + cat + '</div>';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;margin-bottom:8px;">';
    
    for (const m of items) {
      const displayName = m.name.length > 22 ? m.name.slice(0, 20) + '...' : m.name;
      const icon = m.icon || '📦';
      html += '<div onclick="window._loadSuggestedModel(\'' + m.file + '\')" style="background:#1a1a2e;border:1px solid #2a2a3a;border-radius:10px;padding:10px 8px;cursor:pointer;transition:all 0.2s;text-align:center;" onmouseover="this.style.borderColor=\'#7c5cff\';this.style.transform=\'translateY(-2px)\';this.style.boxShadow=\'0 4px 12px rgba(124,92,255,0.2)\'" onmouseout="this.style.borderColor=\'#2a2a3a\';this.style.transform=\'none\';this.style.boxShadow=\'none\'">';
      html += '<div style="font-size:22px;margin-bottom:4px;">' + icon + '</div>';
      html += '<div style="color:#e0e0e0;font-size:11px;font-weight:600;line-height:1.3;">' + displayName + '</div>';
      html += '<div style="color:#7c5cff;font-size:9px;margin-top:4px;font-weight:600;">＋ Add to Scene</div>';
      html += '</div>';
    }
    html += '</div>';
  }
  panel.innerHTML = html;
  panel.style.display = 'block';
}

// Load a suggested model into the scene
window._loadSuggestedModel = function(modelFile) {
  const cmd = 'add ' + modelFile;
  const input = document.getElementById('prompt-input');
  if (input) {
    input.value = cmd;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  }
  // Also try loading via GLB loader directly
  loadGLBModel(modelFile + '_suggest', modelFile, null, null, null);
  
  document.getElementById('ai-suggest-panel').style.display = 'none';
  
  // Log success
  const log = document.getElementById('engine-log');
  if (log) {
    const r = document.createElement('div');
    r.className = 'entry ok';
    r.textContent = '✓ Added ' + modelFile.replace(/_/g, ' ');
    log.appendChild(r);
    log.scrollTop = log.scrollHeight;
  // Auto-hide log after 4s
  clearTimeout(window._logHideTimer);
  window._logHideTimer = setTimeout(() => { log.style.display = "none"; }, 4000);
  }
};

// Hook into parseAndExecute to detect suggestion-worthy queries
const _origParseAndExecute = parseAndExecute;
parseAndExecute = async function(rawCmd) {
  const lower = rawCmd.toLowerCase().trim();
  

  // === DIRECT GALLERY ROUTING — nouns always open gallery, no NL interpretation ===
  const _directGalleryMap = {
    // Characters/NPCs
    'npc': 'characters', 'npcs': 'characters', 'character': 'characters', 'characters': 'characters',
    'player': 'characters', 'players': 'characters', 'person': 'characters', 'people': 'characters',
    'human': 'characters', 'humans': 'characters', 'civilian': 'characters', 'civilians': 'characters',
    // Vehicles
    'car': 'vehicles', 'cars': 'vehicles', 'truck': 'vehicles', 'trucks': 'vehicles',
    'vehicle': 'vehicles', 'vehicles': 'vehicles', 'bus': 'vehicles', 'taxi': 'vehicles',
    'ambulance': 'vehicles', 'police car': 'vehicles', 'van': 'vehicles', 'jeep': 'vehicles',
    // Weapons
    'weapon': 'weapons', 'weapons': 'weapons', 'sword': 'weapons', 'gun': 'weapons',
    'rifle': 'weapons', 'axe': 'weapons', 'bow': 'weapons', 'staff': 'weapons',
    // Buildings/Structures
    'building': 'buildings', 'buildings': 'buildings', 'house': 'buildings', 'houses': 'buildings',
    'structure': 'buildings', 'structures': 'buildings',
    // Nature
    'tree': 'trees & plants', 'trees': 'trees & plants', 'plant': 'trees & plants',
    'plants': 'trees & plants', 'bush': 'trees & plants',
    // Props
    'prop': 'props', 'props': 'props', 'rock': 'rocks & minerals', 'rocks': 'rocks & minerals',
    'stone': 'rocks & minerals', 'furniture': 'furniture', 'chair': 'furniture', 'table': 'furniture',
    // Lights
    'light': 'props', 'lights': 'props', 'street light': 'props', 'lamp': 'props',
    'lantern': 'props', 'torch': 'props',
    // Animals
    'animal': 'animals', 'animals': 'animals', 'monster': 'animals', 'creature': 'animals',
    // Library shortcut
    'library': null, 'models': null, 'assets': null, 'browse': null,
    // Fab
    'fab': null, 'fab assets': null,
  };
  const _directCat = _directGalleryMap[lower];
  if (_directCat !== undefined) {
    if (_directCat === null) {
      // Open full category picker
      showCategoryPicker().then(result => {
        if (result && result.file) {
          loadGLBModel(result.file, GLB_MODELS[result.file] || result.file, 0, 0, null, result.path);
          sceneHistory.push('add ' + result.file);
          showToast('✅ Added ' + (result.name||result.file));
        }
      });
    } else {
      execSingle(_directCat);
    }
    return;
  }

  
  // === PERFORMANCE PRESETS ===
  if (lower === 'graphics high' || lower === 'quality high' || lower === 'graphics ultra') {
    if (bloomPass) bloomPass.enabled = true;
    if (ssaoPass) ssaoPass.enabled = true;
    ppEnabled = true;
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    addMsg('🎨 Graphics: HIGH — bloom + SSAO + shadows enabled');
    return;
  }
  if (lower === 'graphics medium' || lower === 'quality medium') {
    if (bloomPass) bloomPass.enabled = true;
    if (ssaoPass) ssaoPass.enabled = false;
    ppEnabled = true;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = true;
    addMsg('🎨 Graphics: MEDIUM — bloom on, SSAO off');
    return;
  }
  if (lower === 'graphics low' || lower === 'quality low' || lower === 'performance mode' || lower === 'fast mode') {
    if (bloomPass) bloomPass.enabled = false;
    if (ssaoPass) ssaoPass.enabled = false;
    ppEnabled = false;
    renderer.setPixelRatio(1);
    renderer.shadowMap.enabled = false;
    addMsg('⚡ Graphics: LOW — all effects off, max performance');
    return;
  }

  

  // === FOREST WORLD COMMAND ===
  // Pack showcase commands
  if (lower === 'enter mine' || lower === 'go to mine' || lower === 'mine entrance') {
    if (window._quarryCaveInfo) {
      const { entryX, entryZ, entryAngle } = window._quarryCaveInfo;
      const inward = entryAngle + Math.PI;
      window._cam.position.set(
        entryX + Math.cos(inward) * 8,
        6,
        entryZ + Math.sin(inward) * 8
      );
      window._cam.lookAt(entryX + Math.cos(inward) * 30, 4, entryZ + Math.sin(inward) * 30);
      if (window._ctrl) { window._ctrl.target.copy(window._cam.position).addScaledVector(new THREE.Vector3(Math.cos(inward), -0.3, Math.sin(inward)), 20); window._ctrl.update(); }
      showToast('⛏ You are at the mine entrance — go explore!');
    } else { showToast('⚠ Build quarry world first: type "quarry world"'); }
    return;
  }
  if (lower === 'old mine world' || lower === 'show old mine' || lower === 'mine world') {
    buildPackShowcase('old_mine', 'Old Mine', 47); return;
  }
    if (/^(space combat|space fighter|space game combat|fight.*space|spaceship.*fight|make.*space.*fight)$/.test(lower)) {
      if (window.buildSpaceCombatGame) { true; return; }
    }
    if (/^(horror|horror game|horror world|build horror|graveyard)$/.test(lower)) {
      if (window.buildHorrorWorld) { true; return; }
    }
    if (/^(space|space game|space world|space station|build space|build space game)$/.test(lower)) {
      if (window.buildSpaceWorld) { true; return; }
    }
    if (/^(space combat|space fighter|space shooting|fight in space|fly.*space|spaceship.*fight)$/.test(lower)) {
      if (window.buildSpaceCombatGame) { true; return; }
    }
    if (lower === 'city 3' || lower === 'city world 3' || lower === 'build city 3' || lower === 'full city') {
    if (typeof buildCityWorld3 === 'function') buildCityWorld3();
    else if (window.buildCityWorld3) window.buildCityWorld3();
    return '🏙️ Building City 3 — 10x10 grid, all car types, 30 NPCs, fab buildings...';
  }
  if (lower === 'city 2' || lower === 'new city 2' || lower === 'city world 2' || lower === 'build city 2' || lower === 'second city') {
    // [removed] buildCityWorld2 return;
  }
  if (lower === 'city world' || lower === 'build city' || lower === 'new city') {
    buildCityWorld3(); return;
  }
  if (lower === 'quarry world' || lower === 'african quarry' || lower === 'build quarry' || lower === 'slate quarry') {
    // [removed] buildQuarryWorld return;
  }
  if (lower === 'quarry grid' || lower === 'show quarry') {
    buildPackShowcase('quarry', 'African Slate Quarry', 47); return;
  }
  if (lower === 'building world' || lower === 'unfinished building' || lower === 'show building') {
    buildPackShowcase('building', 'Unfinished Building', 38); return;
  }

  // Street props — place individual pieces: "add bus stop", "add street light", etc.
  const streetPieceTriggers = ['ad poster','power box','public phone box','bus stop',
    'street light','pole metal','bike parking','construction cone','water cannister',
    'road sign','road bumper','power pole','cement block','air conditioner',
    'vending machine','trash bin','stop sign','barbwire fence','road stopper',
    'traffic light','fire hydrant','newspaper stand','road block','wooden pallet',
    'recycling bin','bike rack','construction asset'];
  const matchedPiece = streetPieceTriggers.find(p => lower.includes(p));
  if (matchedPiece || (lower.startsWith('add ') && window._groupedAssets['street_props']?.pieces.some(p => lower.includes(p.toLowerCase())))) {
    const pieceName = matchedPiece || window._groupedAssets['street_props'].pieces.find(p => lower.includes(p.toLowerCase()));
    if (pieceName) {
      const px2 = window._cam ? window._cam.position.x + (Math.random()-0.5)*20 : 0;
      const pz2 = window._cam ? window._cam.position.z + (Math.random()-0.5)*20 : 0;
      loadGroupedAsset('street_props', pieceName, px2, pz2);
      return;
    }
  }
  // List street props pieces
  if (lower === 'street props' || lower === 'list street props' || lower === 'street pieces') {
    const pieces = listGroupPieces('street_props');
    showToast('Street props: ' + pieces.slice(0,8).join(', ') + '... (' + pieces.length + ' total)');
    return;
  }

  if (lower === 'forest world' || lower === 'build forest' || lower === 'forest lake' || 
      lower === 'make forest' || lower === 'create forest' || lower === 'forest') {
    // [removed] buildForestLakeWorld
    return;
  }

    // === CLEAR WORLD / NEW WORLD ===
  if (lower === 'clear world' || lower === 'new world' || lower === 'reset world' || lower === 'clear scene') {
    // Remove all user-placed objects, keep terrain + lights
    const toRemove = [];
    scene.traverse(obj => {
      if (obj.userData && (obj.userData.userPlaced || obj.userData.npc || obj.userData.isGLB)) {
        toRemove.push(obj);
      }
    });
    // Remove top-level objects that aren't essential
    scene.children.slice().forEach(obj => {
      const name = (obj.name || '').toLowerCase();
      const type = obj.type || '';
      if (type === 'Mesh' || type === 'Group' || type === 'Object3D') {
        const isEssential = name.includes('terrain') || name.includes('ground') || 
                            name.includes('sky') || name.includes('light') ||
                            name.includes('particle') || name.includes('water') ||
                            obj.isLight;
        if (!isEssential && obj !== playerObj) {
          scene.remove(obj);
        }
      }
    });
    if (window.npcController) window.npcController.npcs.length = 0;
    addMsg('🌍 World cleared — blank slate ready');
    return;
  }


  // Spawn photorealistic woman as prop NPC
  if (lower.includes('photorealistic woman') || lower.includes('realistic woman') || lower === 'fab woman' || lower === 'spawn photorealistic') {
    loadGLBModel('photorealistic_woman', 'fab/female_civilian.glb', 0, 0, null, 'fab/female_civilian.glb');
    if (typeof addMsg === 'function') addMsg('✅ Spawned photorealistic woman');
    return;
  }

    // === FAB COMMANDS — intercept before NL processing ===
  if (lower === 'fab' || lower === 'fab assets' || lower === 'show fab' || lower === 'browse fab') {
    showFabGallery(); return;
  }
  if (lower.startsWith('add fab ') || lower.startsWith('spawn fab ')) {
    const fabName = lower.replace(/^(add|spawn) fab /, '').trim().replace(/ /g, '_');
    const fabAliases = window._fabAliases || {};
    const modelPath = fabAliases[fabName] || GLB_MODELS[fabName];
    if (modelPath) {
      const fullPath = modelPath.startsWith('http') || modelPath.startsWith('/models/') ? modelPath : '/models/' + modelPath;
      loadGLBModel(fabName, fabName, 0, 0, null, fullPath); showToast('✅ Spawned: ' + fabName);
    } else if (window._decomposedPieces && window._decomposedPieces[fabName]) {
      placeDecomposedPiece(fabName, 0, 0); showToast('✅ Placed piece: ' + fabName);
    } else { showToast('❌ Not found: ' + fabName); }
    return;
  }
  // Place individual street prop piece: "add street_props/bench" or "place cone" etc.
  if (lower.startsWith('add street') || lower.startsWith('place street') || lower.includes('street_props/')) {
    const pieceName = lower.replace(/^(add|place|spawn)\s+/, '').trim().replace(/\s+/g,'_');
    const fullAlias = pieceName.startsWith('street_props/') ? pieceName : 'street_props/' + pieceName;
    if (window._decomposedPieces && window._decomposedPieces[fullAlias]) {
      placeDecomposedPiece(fullAlias, 0, 0);
      showToast('✅ Placed: ' + fullAlias);
    } else {
      // Show available pieces
      const available = Object.keys(window._decomposedPieces || {}).filter(k => k.startsWith('street_props/'));
      if (available.length) {
        showToast('Street props pieces: ' + available.map(k=>k.split('/')[1]).join(', '));
      } else {
        showToast('Street props still loading — try again in a few seconds');
      }
    }
    return;
  }
  
  // Detect "need", "want", "show me", "find", "browse", "search", "library" queries
  // Skip AI agent for gallery categories — let the gallery system handle these
    const galleryKeywords = /^(?:show |browse |open |pick |choose |select )?(characters?|weapons?|swords?|axes?|guns?|buildings?|houses?|vehicles?|cars?|animals?|trees?|plants?|rocks?|stones?|furniture|tables?|chairs?|food|items?|potions?|dungeon|sci-?fi|space|nature|survival|animations?|library|asset library|browse all|all assets|all models|model library|browse$)/i;
    if (galleryKeywords.test(lower)) {
      return _origParseAndExecute(rawCmd);
    }
    const isBrowse = /^(i need|i want|show me|find|search|browse|library|catalog|get me|give me|what|which|any|list)\b/.test(lower);
  const isQuestion = lower.includes('?') || lower.startsWith('what') || lower.startsWith('which') || lower.startsWith('do you have') || lower.startsWith('do we have');
  
  // Also detect when a basic "add X" might benefit from suggestions
  const isAdd = /^add\s+/.test(lower);
  
  if (isBrowse || isQuestion) {
    // Extract the search terms
    let search = lower.replace(/^(i need|i want|show me|find|search|browse|library|catalog|get me|give me|what|which|any|list|do you have|do we have)\s*(a |an |the |some |any )?/i, '').replace(/[?!.,]/g, '').trim();
    
    if (search.length >= 2) {
      const results = searchModels(search);
      if (results.length > 0) {
        showSuggestionPanel(search, results);
        return '🤖 Found ' + results.length + ' models matching "' + search + '" — pick one from the panel below!';
      }
    }
  }
  
  // For "add X" commands, also show suggestions if exact match fails
  if (isAdd) {
    const objName = lower.replace(/^add\s+(a |an |the )?/, '').trim();
    // Run the original first
    const result = await _origParseAndExecute(rawCmd);
    
    // If it returned an error or "unknown", show suggestions
    if (result && (result.includes('⚠') || result.includes('unknown') || result.includes('not found'))) {
      const results = searchModels(objName);
      if (results.length > 0) {
        showSuggestionPanel(objName, results);
        return result + '\n🤖 But I found ' + results.length + ' similar models — check the panel below!';
      }
    }
    return result;
  }
  
  return _origParseAndExecute(rawCmd);
};
// === END AI AGENT SUGGESTION SYSTEM ===



// ═══ COMBAT SYSTEM (v67) ═══

// Weapon data
const WEAPON_DATA = {
  pistol: { type: 'ranged', damage: 10, fireRate: 0.3, magSize: 12, reloadTime: 1.5, spread: 0.02, recoil: 0.03, auto: false },
  rifle: { type: 'ranged', damage: 15, fireRate: 0.1, magSize: 30, reloadTime: 2.5, spread: 0.015, recoil: 0.05, auto: true },
  shotgun: { type: 'ranged', damage: 8, fireRate: 0.8, magSize: 8, reloadTime: 3.0, spread: 0.08, pellets: 8, recoil: 0.1, auto: false },
  smg: { type: 'ranged', damage: 8, fireRate: 0.07, magSize: 35, reloadTime: 2.0, spread: 0.03, recoil: 0.02, auto: true },
  sniper: { type: 'ranged', damage: 50, fireRate: 1.5, magSize: 5, reloadTime: 3.5, spread: 0.002, recoil: 0.12, auto: false },
  sword: { type: 'melee', damage: 20, speed: 1.0, range: 3.0, staminaCost: 15, heavyMult: 2.0 },
  axe: { type: 'melee', damage: 30, speed: 0.7, range: 2.5, staminaCost: 20, heavyMult: 2.5 },
  hammer: { type: 'melee', damage: 35, speed: 0.6, range: 2.0, staminaCost: 25, heavyMult: 3.0 },
  dagger: { type: 'melee', damage: 12, speed: 1.5, range: 1.8, staminaCost: 8, heavyMult: 1.5 },
  spear: { type: 'melee', damage: 22, speed: 0.9, range: 4.0, staminaCost: 18, heavyMult: 2.0 },
};

// Combat state
const combatState = {
  equippedWeapon: null,
  weaponData: null,
  ammo: 0,
  magAmmo: 0,
  shooting: false,
  shootTimer: 0,
  reloading: false,
  reloadTimer: 0,
  spreadAccum: 0,
  recoilRecovery: 0,
  // Melee
  attacking: false,
  attackTimer: 0,
  attackPhase: 'none', // none, windup, active, recovery
  comboCount: 0,
  comboTimer: 0,
  // Stamina
  stamina: 100,
  maxStamina: 100,
  staminaRegenDelay: 0,
  staminaRegenRate: 20,
  staminaDepleted: false,
  // Player health
  health: 100,
  maxHealth: 100,
  // HUD elements
  hudCreated: false,
};

// Detect weapon type from equipped weapon name
function detectWeaponType(weaponName) {
  if (!weaponName) return null;
  const n = weaponName.toLowerCase();
  for (const [key, data] of Object.entries(WEAPON_DATA)) {
    if (n.includes(key)) return { key, ...data };
  }
  // Fallback detection
  if (/gun|pistol|blaster|revolver/.test(n)) return { key: 'pistol', ...WEAPON_DATA.pistol };
  if (/rifle|ar_|carbine|assault/.test(n)) return { key: 'rifle', ...WEAPON_DATA.rifle };
  if (/shotgun|scatter/.test(n)) return { key: 'shotgun', ...WEAPON_DATA.shotgun };
  if (/smg|sub.*machine|uzi|mp[0-9]/.test(n)) return { key: 'smg', ...WEAPON_DATA.smg };
  if (/sniper|marksman|scope/.test(n)) return { key: 'sniper', ...WEAPON_DATA.sniper };
  if (/sword|blade|katana|saber/.test(n)) return { key: 'sword', ...WEAPON_DATA.sword };
  if (/axe|hatchet|cleaver/.test(n)) return { key: 'axe', ...WEAPON_DATA.axe };
  if (/hammer|mace|club|maul/.test(n)) return { key: 'hammer', ...WEAPON_DATA.hammer };
  if (/dagger|knife|shiv/.test(n)) return { key: 'dagger', ...WEAPON_DATA.dagger };
  if (/spear|lance|pike|trident|staff/.test(n)) return { key: 'spear', ...WEAPON_DATA.spear };
  return null;
}

// Create combat HUD
function createCombatHUD() {
  if (combatState.hudCreated) return;
  combatState.hudCreated = true;
  
  // Crosshair
  const crosshair = document.createElement('div');
  crosshair.id = 'combat-crosshair';
  crosshair.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:9001;pointer-events:none;display:none;';
  crosshair.innerHTML = '<div style="width:2px;height:14px;background:rgba(255,255,255,0.8);position:absolute;left:50%;top:-8px;transform:translateX(-50%)"></div>' +
    '<div style="width:2px;height:14px;background:rgba(255,255,255,0.8);position:absolute;left:50%;bottom:-8px;transform:translateX(-50%)"></div>' +
    '<div style="width:14px;height:2px;background:rgba(255,255,255,0.8);position:absolute;top:50%;left:-8px;transform:translateY(-50%)"></div>' +
    '<div style="width:14px;height:2px;background:rgba(255,255,255,0.8);position:absolute;top:50%;right:-8px;transform:translateY(-50%)"></div>' +
    '<div style="width:3px;height:3px;background:rgba(255,100,100,0.9);border-radius:50%;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)"></div>';
  document.body.appendChild(crosshair);
  
  // Health bar
  const healthBar = document.createElement('div');
  healthBar.id = 'combat-health';
  healthBar.style.cssText = 'position:fixed;top:20px;left:20px;z-index:9001;display:none;font-family:monospace;';
  healthBar.innerHTML = '<div style="color:#aaa;font-size:11px;margin-bottom:2px">❤️ HEALTH</div>' +
    '<div style="width:200px;height:8px;background:rgba(0,0,0,0.6);border-radius:4px;overflow:hidden;border:1px solid #333">' +
    '<div id="health-fill" style="width:100%;height:100%;background:linear-gradient(90deg,#ef4444,#f87171);transition:width 0.3s;border-radius:4px"></div></div>';
  document.body.appendChild(healthBar);
  
  // Stamina bar
  const staminaBar = document.createElement('div');
  staminaBar.id = 'combat-stamina';
  staminaBar.style.cssText = 'position:fixed;top:52px;left:20px;z-index:9001;display:none;font-family:monospace;';
  staminaBar.innerHTML = '<div style="color:#aaa;font-size:11px;margin-bottom:2px">⚡ STAMINA</div>' +
    '<div style="width:160px;height:6px;background:rgba(0,0,0,0.6);border-radius:3px;overflow:hidden;border:1px solid #333">' +
    '<div id="stamina-fill" style="width:100%;height:100%;background:linear-gradient(90deg,#22c55e,#4ade80);transition:width 0.2s;border-radius:3px"></div></div>';
  document.body.appendChild(staminaBar);
  
  // Ammo counter
  const ammoDiv = document.createElement('div');
  ammoDiv.id = 'combat-ammo';
  ammoDiv.style.cssText = 'position:fixed;bottom:100px;right:20px;z-index:9001;display:none;font-family:monospace;color:#e0e0e0;text-align:right;';
  ammoDiv.innerHTML = '<div id="ammo-text" style="font-size:28px;font-weight:bold">30</div><div id="ammo-reserve" style="font-size:14px;color:#888">/ 120</div><div id="weapon-name" style="font-size:11px;color:#666;margin-top:4px">RIFLE</div>';
  document.body.appendChild(ammoDiv);
  
  // Hit marker
  const hitMarker = document.createElement('div');
  hitMarker.id = 'combat-hitmarker';
  hitMarker.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:9002;pointer-events:none;display:none;opacity:0;transition:opacity 0.15s;';
  hitMarker.innerHTML = '<div style="width:20px;height:2px;background:#fff;position:absolute;transform:rotate(45deg);left:-10px;top:-1px"></div>' +
    '<div style="width:20px;height:2px;background:#fff;position:absolute;transform:rotate(-45deg);left:-10px;top:-1px"></div>' +
    '<div style="width:20px;height:2px;background:#fff;position:absolute;transform:rotate(135deg);left:-10px;top:-1px"></div>' +
    '<div style="width:20px;height:2px;background:#fff;position:absolute;transform:rotate(-135deg);left:-10px;top:-1px"></div>';
  document.body.appendChild(hitMarker);
  
  // Damage vignette
  const vignette = document.createElement('div');
  vignette.id = 'combat-vignette';
  vignette.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:9000;pointer-events:none;display:none;opacity:0;transition:opacity 0.3s;' +
    'background:radial-gradient(ellipse at center, transparent 50%, rgba(255,0,0,0.4) 100%);';
  document.body.appendChild(vignette);
  
  // Kill feed
  const killFeed = document.createElement('div');
  killFeed.id = 'combat-killfeed';
  killFeed.style.cssText = 'position:fixed;top:80px;right:20px;z-index:9001;display:none;font-family:monospace;font-size:12px;text-align:right;';
  document.body.appendChild(killFeed);
}

// Show/hide combat HUD
function toggleCombatHUD(show) {
  const ids = ['combat-crosshair','combat-health','combat-stamina','combat-ammo','combat-killfeed'];
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = show ? 'block' : 'none'; });
  // Only show ammo for ranged weapons
  const ammoEl = document.getElementById('combat-ammo');
  if (ammoEl && combatState.weaponData && combatState.weaponData.type !== 'ranged') ammoEl.style.display = 'none';
}

// Spawn floating damage number
function spawnDamageNumber(position, damage, isCrit) {
  const canvas = document.querySelector('canvas');
  if (!canvas) return;
  const vec = position.clone().project(camera);
  const x = (vec.x * 0.5 + 0.5) * canvas.clientWidth;
  const y = (-vec.y * 0.5 + 0.5) * canvas.clientHeight;
  
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;z-index:9003;pointer-events:none;font-family:monospace;font-weight:bold;text-shadow:0 1px 3px rgba(0,0,0,0.8);transition:all 1s;';
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  el.style.fontSize = isCrit ? '28px' : '20px';
  el.style.color = isCrit ? '#ffd700' : '#fff';
  el.textContent = (isCrit ? '💥 ' : '') + Math.round(damage);
  document.body.appendChild(el);
  
  requestAnimationFrame(() => {
    el.style.transform = 'translateY(-60px)';
    el.style.opacity = '0';
  });
  setTimeout(() => el.remove(), 1000);
}

// Show hit marker
function showHitMarker() {
  const el = document.getElementById('combat-hitmarker');
  if (!el) return;
  el.style.display = 'block';
  el.style.opacity = '1';
  setTimeout(() => { el.style.opacity = '0'; }, 100);
  setTimeout(() => { el.style.display = 'none'; }, 250);
}

// Damage flash
function showDamageFlash() {
  const el = document.getElementById('combat-vignette');
  if (!el) return;
  el.style.display = 'block';
  el.style.opacity = '1';
  setTimeout(() => { el.style.opacity = '0'; }, 300);
  setTimeout(() => { el.style.display = 'none'; }, 600);
}

// Add to kill feed
function addKillFeedEntry(text, color) {
  const feed = document.getElementById('combat-killfeed');
  if (!feed) return;
  const entry = document.createElement('div');
  entry.style.cssText = 'color:' + (color || '#4ade80') + ';margin-bottom:4px;opacity:1;transition:opacity 1s;';
  entry.textContent = text;
  feed.appendChild(entry);
  setTimeout(() => { entry.style.opacity = '0'; }, 4000);
  setTimeout(() => entry.remove(), 5000);
  // Max 5 entries
  while (feed.children.length > 5) feed.removeChild(feed.firstChild);
}

// Shoot raycast
function shootRaycast() {
  const wd = combatState.weaponData;
  if (!wd || wd.type !== 'ranged') return;
  
  const pellets = wd.pellets || 1;
  for (let p = 0; p < pellets; p++) {
    const spread = combatState.spreadAccum + wd.spread;
    const ray = new THREE.Raycaster();
    const dir = new THREE.Vector3(
      (Math.random() - 0.5) * spread,
      (Math.random() - 0.5) * spread,
      -1
    ).normalize();
    dir.applyQuaternion(camera.quaternion);
    ray.set(camera.position, dir);
    ray.far = 200;
    
    const hits = ray.intersectObjects(objects, true);
    if (hits.length > 0) {
      const hit = hits[0];
      // Find root object
      let root = hit.object;
      while (root.parent && !root.userData.name && root.parent !== scene) root = root.parent;
      
      // Check if NPC
      const isNPC = root.userData.isNPC || root.userData.name?.includes('npc');
      if (isNPC && typeof npcController !== 'undefined') {
        const isCrit = Math.random() < 0.1;
        const dmg = wd.damage * (isCrit ? 2 : 1) * (pellets > 1 ? 0.7 : 1);
        // Find NPC in controller
        const npc = npcController.npcs?.find(n => n.model === root);
        if (npc && !npc.isDead) {
          npc.health = Math.max(0, npc.health - dmg);
          spawnDamageNumber(hit.point, dmg, isCrit);
          showHitMarker();
          if (npc.health <= 0) {
            npc.isDead = true;
            addKillFeedEntry('☠ Killed ' + (root.userData.name || 'Enemy'));
          } else {
            npc.isAggro = true; // aggro on hit
          }
        }
      }
      
      // Impact particle
      createImpactEffect(hit.point, hit.face?.normal);
    }
  }
  
  // Recoil
  combatState.recoilRecovery = wd.recoil;
  combatState.spreadAccum = Math.min(combatState.spreadAccum + wd.spread * 0.5, wd.spread * 4);
  
  // Muzzle flash (brief light)
  const flashLight = new THREE.PointLight(0xffaa33, 3, 10);
  flashLight.position.copy(camera.position);
  scene.add(flashLight);
  setTimeout(() => scene.remove(flashLight), 50);
}

// Impact particle effect
function createImpactEffect(position, normal) {
  const count = 8;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const velocities = [];
  for (let i = 0; i < count; i++) {
    positions[i * 3] = position.x;
    positions[i * 3 + 1] = position.y;
    positions[i * 3 + 2] = position.z;
    velocities.push(new THREE.Vector3((Math.random()-0.5)*0.3, Math.random()*0.3, (Math.random()-0.5)*0.3));
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({ color: 0xffaa33, size: 0.15, transparent: true, opacity: 1 });
  const particles = new THREE.Points(geo, mat);
  scene.add(particles);
  
  let life = 1.0;
  const animateImpact = () => {
    life -= 0.05;
    if (life <= 0) { scene.remove(particles); geo.dispose(); mat.dispose(); return; }
    const pos = geo.attributes.position.array;
    for (let i = 0; i < count; i++) {
      pos[i*3] += velocities[i].x;
      pos[i*3+1] += velocities[i].y;
      pos[i*3+2] += velocities[i].z;
      velocities[i].y -= 0.015;
    }
    geo.attributes.position.needsUpdate = true;
    mat.opacity = life;
    requestAnimationFrame(animateImpact);
  };
  requestAnimationFrame(animateImpact);
}

// Melee attack
function meleeAttack(heavy) {
  const wd = combatState.weaponData;
  if (!wd || wd.type !== 'melee') return;
  if (combatState.attacking) return;
  if (combatState.staminaDepleted) return;
  
  const cost = heavy ? wd.staminaCost * 1.5 : wd.staminaCost;
  if (combatState.stamina < cost) return;
  combatState.stamina -= cost;
  combatState.staminaRegenDelay = 1.0;
  
  combatState.attacking = true;
  combatState.attackPhase = 'windup';
  combatState.attackTimer = 0;
  
  const totalTime = 1.0 / wd.speed;
  const windupTime = totalTime * 0.2;
  const activeTime = totalTime * 0.4;
  const recoveryTime = totalTime * 0.4;
  
  // Windup → Active → Recovery
  setTimeout(() => {
    combatState.attackPhase = 'active';
    // Check for hits in range
    const playerPos = characterController ? characterController.position : camera.position;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    
    if (typeof npcController !== 'undefined' && npcController.npcs) {
      for (const npc of npcController.npcs) {
        if (npc.isDead || !npc.model) continue;
        const dist = playerPos.distanceTo(npc.model.position);
        if (dist < wd.range) {
          // Direction check
          const toNPC = npc.model.position.clone().sub(playerPos).normalize();
          const dot = forward.dot(toNPC);
          if (dot > 0.3) { // roughly facing
            const isCrit = Math.random() < 0.1;
            const dmg = wd.damage * (heavy ? wd.heavyMult : 1) * (isCrit ? 2 : 1);
            npc.health = Math.max(0, npc.health - dmg);
            spawnDamageNumber(npc.model.position.clone().add(new THREE.Vector3(0, 1.5, 0)), dmg, isCrit);
            showHitMarker();
            // Knockback
            npc.model.position.addScaledVector(toNPC, heavy ? 2 : 1);
            if (npc.health <= 0) {
              npc.isDead = true;
              addKillFeedEntry('⚔ Killed ' + (npc.model.userData.name || 'Enemy'));
            } else {
              npc.isAggro = true;
            }
          }
        }
      }
    }
  }, windupTime * 1000);
  
  setTimeout(() => {
    combatState.attackPhase = 'recovery';
  }, (windupTime + activeTime) * 1000);
  
  setTimeout(() => {
    combatState.attacking = false;
    combatState.attackPhase = 'none';
  }, totalTime * 1000);
}

// Update combat system (called from animate loop)
function updateCombat(dt) {
  if (!playMode) { toggleCombatHUD(false); return; }
  
  // Create HUD if needed
  if (!combatState.hudCreated) createCombatHUD();
  toggleCombatHUD(true);
  
  // Detect equipped weapon
  if (characterController && characterController.model) {
    let foundWeapon = null;
    characterController.model.traverse(child => {
      if (child.userData.isEquipped && child.userData.name) {
        foundWeapon = child.userData.name.replace('equipped_', '');
      }
    });
    if (foundWeapon !== combatState.equippedWeapon) {
      combatState.equippedWeapon = foundWeapon;
      combatState.weaponData = detectWeaponType(foundWeapon);
      if (combatState.weaponData && combatState.weaponData.type === 'ranged') {
        combatState.magAmmo = combatState.weaponData.magSize;
        combatState.ammo = combatState.weaponData.magSize * 4;
      }
    }
  }
  // Also check selectedObj for standalone weapon equip
  if (!combatState.weaponData) {
    for (const obj of objects) {
      if (obj.userData.isEquipped) {
        const name = (obj.userData.name || '').replace('equipped_', '');
        combatState.equippedWeapon = name;
        combatState.weaponData = detectWeaponType(name);
        if (combatState.weaponData && combatState.weaponData.type === 'ranged') {
          combatState.magAmmo = combatState.weaponData.magSize;
          combatState.ammo = combatState.weaponData.magSize * 4;
        }
        break;
      }
    }
  }
  
  // Update stamina
  if (combatState.staminaRegenDelay > 0) {
    combatState.staminaRegenDelay -= dt;
  } else {
    combatState.stamina = Math.min(combatState.maxStamina, combatState.stamina + combatState.staminaRegenRate * dt);
  }
  if (combatState.stamina <= 0) combatState.staminaDepleted = true;
  if (combatState.stamina > 20) combatState.staminaDepleted = false;
  
  // Sprint stamina cost
  if (playKeys['shift'] && (playKeys['w'] || playKeys['a'] || playKeys['s'] || playKeys['d'])) {
    combatState.stamina = Math.max(0, combatState.stamina - 10 * dt);
    combatState.staminaRegenDelay = 1.0;
  }
  
  // Shooting
  if (combatState.weaponData && combatState.weaponData.type === 'ranged') {
    combatState.shootTimer -= dt;
    
    if (combatState.shooting && combatState.shootTimer <= 0 && !combatState.reloading && combatState.magAmmo > 0) {
      shootRaycast();
      combatState.magAmmo--;
      combatState.shootTimer = combatState.weaponData.fireRate;
      if (!combatState.weaponData.auto) combatState.shooting = false;
    }
    
    // Reload
    if (combatState.reloading) {
      combatState.reloadTimer -= dt;
      if (combatState.reloadTimer <= 0) {
        const needed = combatState.weaponData.magSize - combatState.magAmmo;
        const available = Math.min(needed, combatState.ammo);
        combatState.magAmmo += available;
        combatState.ammo -= available;
        combatState.reloading = false;
      }
    }
    
    // Spread recovery
    combatState.spreadAccum = Math.max(0, combatState.spreadAccum - dt * 0.5);
    
    // Recoil recovery
    if (combatState.recoilRecovery > 0) {
      camera.rotation.x += combatState.recoilRecovery * 0.3;
      combatState.recoilRecovery *= 0.85;
      if (combatState.recoilRecovery < 0.001) combatState.recoilRecovery = 0;
    }
  }
  
  // Update HUD
  const healthFill = document.getElementById('health-fill');
  if (healthFill) healthFill.style.width = (combatState.health / combatState.maxHealth * 100) + '%';
  
  const staminaFill = document.getElementById('stamina-fill');
  if (staminaFill) staminaFill.style.width = (combatState.stamina / combatState.maxStamina * 100) + '%';
  
  if (combatState.weaponData && combatState.weaponData.type === 'ranged') {
    const ammoText = document.getElementById('ammo-text');
    const ammoReserve = document.getElementById('ammo-reserve');
    const weaponName = document.getElementById('weapon-name');
    if (ammoText) ammoText.textContent = combatState.reloading ? '...' : combatState.magAmmo;
    if (ammoReserve) ammoReserve.textContent = '/ ' + combatState.ammo;
    if (weaponName) weaponName.textContent = (combatState.equippedWeapon || '').toUpperCase();
    const ammoDiv = document.getElementById('combat-ammo');
    if (ammoDiv) ammoDiv.style.display = 'block';
  }
  
  // Low health vignette
  if (combatState.health < 30) {
    const vig = document.getElementById('combat-vignette');
    if (vig) {
      vig.style.display = 'block';
      vig.style.opacity = String(0.3 + Math.sin(performance.now() * 0.003) * 0.15);
    }
  }
}

// Combat input handlers
window.addEventListener('mousedown', (e) => {
  if (!playMode || !combatState.weaponData) return;
  if (e.button === 0) { // Left click
    if (combatState.weaponData.type === 'ranged') {
      combatState.shooting = true;
    } else {
      meleeAttack(false);
    }
  }
  if (e.button === 2) { // Right click — heavy attack (melee) or aim (ranged)
    if (combatState.weaponData.type === 'melee') {
      meleeAttack(true);
    }
  }
});

window.addEventListener('mouseup', (e) => {
  if (e.button === 0) combatState.shooting = false;
});

window.addEventListener('keydown', (e) => {
  if (!playMode || !combatState.weaponData) return;
  if (e.code === 'KeyR' && combatState.weaponData.type === 'ranged' && !combatState.reloading) {
    if (combatState.magAmmo < combatState.weaponData.magSize && combatState.ammo > 0) {
      combatState.reloading = true;
      combatState.reloadTimer = combatState.weaponData.reloadTime;
      logOutput('ok', '🔄 Reloading...');
    }
  }
});

// Make updateCombat available globally
window._updateCombat = updateCombat;

// ═══ MINI-MAP SYSTEM (v67) ═══

let miniMapRenderer = null;
let miniMapCamera = null;
let miniMapTarget = null;
let miniMapVisible = true;
let miniMapFrame = 0;

function createMiniMap() {
  if (document.getElementById('minimap-container')) return;
  
  const container = document.createElement('div');
  container.id = 'minimap-container';
  container.style.cssText = 'position:fixed;top:20px;right:20px;width:160px;height:160px;z-index:9001;display:none;' +
    'border-radius:50%;overflow:hidden;border:2px solid rgba(255,255,255,0.3);box-shadow:0 0 20px rgba(0,0,0,0.5);';
  
  // Player direction indicator
  const playerDot = document.createElement('div');
  playerDot.id = 'minimap-player';
  playerDot.style.cssText = 'position:absolute;top:50%;left:50%;width:8px;height:8px;background:#4ade80;border-radius:50%;' +
    'transform:translate(-50%,-50%);z-index:2;box-shadow:0 0 6px #4ade80;';
  container.appendChild(playerDot);
  
  // Direction arrow
  const arrow = document.createElement('div');
  arrow.id = 'minimap-arrow';
  arrow.style.cssText = 'position:absolute;top:50%;left:50%;width:0;height:0;z-index:3;' +
    'border-left:4px solid transparent;border-right:4px solid transparent;border-bottom:10px solid #4ade80;' +
    'transform-origin:center 10px;transform:translate(-50%,-100%);';
  container.appendChild(arrow);
  
  // Compass labels
  ['N','E','S','W'].forEach((dir, i) => {
    const label = document.createElement('div');
    label.style.cssText = 'position:absolute;color:rgba(255,255,255,0.6);font-size:10px;font-family:monospace;font-weight:bold;z-index:3;';
    if (dir === 'N') { label.style.top = '5px'; label.style.left = '50%'; label.style.transform = 'translateX(-50%)'; label.style.color = '#ef4444'; }
    else if (dir === 'S') { label.style.bottom = '5px'; label.style.left = '50%'; label.style.transform = 'translateX(-50%)'; }
    else if (dir === 'E') { label.style.right = '8px'; label.style.top = '50%'; label.style.transform = 'translateY(-50%)'; }
    else { label.style.left = '8px'; label.style.top = '50%'; label.style.transform = 'translateY(-50%)'; }
    label.textContent = dir;
    container.appendChild(label);
  });
  
  document.body.appendChild(container);
  
  // Create orthographic camera for minimap
  const mapSize = 120;
  miniMapCamera = new THREE.OrthographicCamera(-mapSize, mapSize, mapSize, -mapSize, 1, 500);
  miniMapCamera.position.set(0, 200, 0);
  miniMapCamera.lookAt(0, 0, 0);
  miniMapCamera.up.set(0, 0, -1);
  
  // Create render target
  miniMapTarget = new THREE.WebGLRenderTarget(160, 160);
  
  // Create canvas for minimap rendering
  const mapCanvas = document.createElement('canvas');
  mapCanvas.id = 'minimap-canvas';
  mapCanvas.width = 160;
  mapCanvas.height = 160;
  mapCanvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;border-radius:50%;';
  container.insertBefore(mapCanvas, container.firstChild);
}

function updateMiniMap() {
  if (!playMode || !miniMapVisible) {
    const mc = document.getElementById('minimap-container');
    if (mc) mc.style.display = 'none';
    return;
  }
  
  const mc = document.getElementById('minimap-container');
  if (mc) mc.style.display = 'block';
  
  // Only update every 3 frames for performance
  miniMapFrame++;
  if (miniMapFrame % 3 !== 0) return;
  
  if (!miniMapCamera) createMiniMap();
  
  // Position minimap camera above player
  const playerPos = characterController ? characterController.position : camera.position;
  miniMapCamera.position.set(playerPos.x, 200, playerPos.z);
  miniMapCamera.lookAt(playerPos.x, 0, playerPos.z);
  
  // Render to minimap canvas
  const mapCanvas = document.getElementById('minimap-canvas');
  if (mapCanvas && typeof renderer !== 'undefined') {
    // Use main renderer to render to target
    const currentTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(miniMapTarget);
    renderer.render(scene, miniMapCamera);
    renderer.setRenderTarget(currentTarget);
    
    // Copy to canvas
    const ctx = mapCanvas.getContext('2d');
    const pixels = new Uint8Array(160 * 160 * 4);
    renderer.readRenderTargetPixels(miniMapTarget, 0, 0, 160, 160, pixels);
    const imageData = ctx.createImageData(160, 160);
    // Flip Y
    for (let y = 0; y < 160; y++) {
      for (let x = 0; x < 160; x++) {
        const srcIdx = ((159 - y) * 160 + x) * 4;
        const dstIdx = (y * 160 + x) * 4;
        imageData.data[dstIdx] = pixels[srcIdx];
        imageData.data[dstIdx + 1] = pixels[srcIdx + 1];
        imageData.data[dstIdx + 2] = pixels[srcIdx + 2];
        imageData.data[dstIdx + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);
    
    // Draw NPC dots on canvas
    if (typeof npcController !== 'undefined' && npcController.npcs) {
      ctx.save();
      for (const npc of npcController.npcs) {
        if (npc.isDead || !npc.model) continue;
        const dx = (npc.model.position.x - playerPos.x) / 240 * 160 + 80;
        const dz = (npc.model.position.z - playerPos.z) / 240 * 160 + 80;
        if (dx > 5 && dx < 155 && dz > 5 && dz < 155) {
          ctx.fillStyle = npc.isAggro ? '#ef4444' : '#3b82f6';
          ctx.beginPath();
          ctx.arc(dx, dz, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }
  }
  
  // Rotate direction arrow
  const arrow = document.getElementById('minimap-arrow');
  if (arrow) {
    const yaw = camera.rotation.y;
    arrow.style.transform = 'translate(-50%, -100%) rotate(' + (-yaw * 180 / Math.PI) + 'deg)';
  }
}

// Toggle minimap with M key
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM' && playMode && !e.ctrlKey && !e.metaKey) {
    miniMapVisible = !miniMapVisible;
  }
});

window._updateMiniMap = updateMiniMap;

// ═══ INVENTORY SYSTEM (v67) ═══

const inventory = {
  slots: new Array(32).fill(null), // 8x4 grid
  equipment: { weapon: null, armor: null, accessory: null },
  isOpen: false,
};

function createInventoryUI() {
  if (document.getElementById('inventory-overlay')) return;
  
  const overlay = document.createElement('div');
  overlay.id = 'inventory-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:10000;display:none;' +
    'flex-direction:column;align-items:center;justify-content:center;font-family:monospace;';
  
  overlay.innerHTML = '<div style="color:#e0e0e0;font-size:20px;margin-bottom:16px">🎒 INVENTORY <span style="color:#666;font-size:12px">(Tab to close)</span></div>' +
    '<div id="inv-grid" style="display:grid;grid-template-columns:repeat(8,56px);gap:4px;margin-bottom:20px"></div>' +
    '<div style="display:flex;gap:16px;margin-top:12px">' +
    '<div style="text-align:center"><div style="color:#888;font-size:11px;margin-bottom:4px">⚔️ WEAPON</div><div id="eq-weapon" class="eq-slot" style="width:56px;height:56px;background:#1a1a1a;border:1px solid #333;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:24px;cursor:pointer"></div></div>' +
    '<div style="text-align:center"><div style="color:#888;font-size:11px;margin-bottom:4px">🛡️ ARMOR</div><div id="eq-armor" class="eq-slot" style="width:56px;height:56px;background:#1a1a1a;border:1px solid #333;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:24px;cursor:pointer"></div></div>' +
    '<div style="text-align:center"><div style="color:#888;font-size:11px;margin-bottom:4px">💍 ACCESSORY</div><div id="eq-accessory" class="eq-slot" style="width:56px;height:56px;background:#1a1a1a;border:1px solid #333;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:24px;cursor:pointer"></div></div></div>';
  
  document.body.appendChild(overlay);
  
  // Create grid slots
  const grid = document.getElementById('inv-grid');
  for (let i = 0; i < 32; i++) {
    const slot = document.createElement('div');
    slot.dataset.slot = i;
    slot.style.cssText = 'width:56px;height:56px;background:#1a1a1a;border:1px solid #252525;border-radius:6px;' +
      'display:flex;align-items:center;justify-content:center;font-size:24px;cursor:pointer;transition:all 0.2s;position:relative;';
    slot.addEventListener('mouseenter', () => { slot.style.borderColor = '#4ade80'; });
    slot.addEventListener('mouseleave', () => { slot.style.borderColor = '#252525'; });
    slot.addEventListener('click', () => {
      if (inventory.slots[i]) {
        // Show item tooltip or use item
        const item = inventory.slots[i];
        logOutput('ok', item.icon + ' ' + item.name + (item.stats ? ' — ' + item.stats : ''));
      }
    });
    grid.appendChild(slot);
  }
}

function toggleInventory() {
  inventory.isOpen = !inventory.isOpen;
  const overlay = document.getElementById('inventory-overlay');
  if (!overlay) { createInventoryUI(); }
  const ov = document.getElementById('inventory-overlay');
  if (ov) {
    ov.style.display = inventory.isOpen ? 'flex' : 'none';
    if (inventory.isOpen) renderInventory();
  }
}

function renderInventory() {
  const grid = document.getElementById('inv-grid');
  if (!grid) return;
  const slots = grid.children;
  for (let i = 0; i < 32; i++) {
    const item = inventory.slots[i];
    if (slots[i]) {
      slots[i].textContent = item ? item.icon : '';
      slots[i].title = item ? item.name : '';
    }
  }
  // Equipment
  ['weapon', 'armor', 'accessory'].forEach(slot => {
    const el = document.getElementById('eq-' + slot);
    if (el) {
      const item = inventory.equipment[slot];
      el.textContent = item ? item.icon : '';
      el.title = item ? item.name : '';
    }
  });
}

function addToInventory(item) {
  const emptySlot = inventory.slots.indexOf(null);
  if (emptySlot === -1) { logOutput('warn', '🎒 Inventory full!'); return false; }
  inventory.slots[emptySlot] = item;
  logOutput('ok', '🎒 Picked up ' + item.icon + ' ' + item.name);
  // Save
  try { localStorage.setItem('crate_inventory', JSON.stringify(inventory)); } catch(e) {}
  return true;
}

// Load inventory from localStorage
try {
  const saved = JSON.parse(localStorage.getItem('crate_inventory'));
  if (saved && saved.slots) {
    inventory.slots = saved.slots;
    inventory.equipment = saved.equipment || { weapon: null, armor: null, accessory: null };
  }
} catch(e) {}

// Inventory toggle
window.addEventListener('keydown', (e) => {
  if (e.code === 'Tab' || e.code === 'KeyI') {
    if (playMode || document.getElementById('inventory-overlay')?.style.display === 'flex') {
      e.preventDefault();
      toggleInventory();
    }
  }
});

window._addToInventory = addToInventory;
window._toggleInventory = toggleInventory;


// Marketplace loader removed — all models are in the built-in catalog



// === QUICK START SCENE SELECTOR (v215) ===
function showQuickStart() {
  // Don't show if scene already has objects
  if ((window._sceneObjects || []).length > 5) return;
  
  const scenes = [
    { name: 'Modern City', cmd: 'generate city', icon: '🏙️', desc: 'Downtown with skyscrapers, shops, roads & traffic' },
    { name: 'Medieval Town', cmd: 'generate town', icon: '🏰', desc: 'Fantasy village with tavern, blacksmith & houses' },
    { name: 'Zombie Survival', cmd: 'zombie game', icon: '🧟', desc: 'Abandoned city, waves of zombies, weapons' },
    { name: 'Racing Track', cmd: 'generate racing', icon: '🏎️', desc: 'Race circuit with cars and checkpoints' },
    { name: 'Fantasy Kingdom', cmd: 'generate kingdom', icon: '⚔️', desc: 'Castle, knights, dragons & treasure' },
    { name: 'Space Station', cmd: 'generate space', icon: '🚀', desc: 'Orbital base with sci-fi corridors' },
    { name: 'Pirate Island', cmd: 'generate pirate', icon: '🏴‍☠️', desc: 'Tropical cove with ships & treasure' },
    { name: 'Empty Sandbox', cmd: 'flat', icon: '📦', desc: 'Blank canvas — build anything' },
  ];
  
  const modal = document.createElement('div');
  modal.id = 'quick-start-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:10010;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,sans-serif;backdrop-filter:blur(10px);';
  
  html = '<div style="text-align:center;margin-bottom:32px;"><div style="font-size:40px;margin-bottom:8px;">🎮</div><h1 style="color:#fff;font-size:28px;margin:0;">What do you want to build?</h1><p style="color:#888;font-size:14px;margin:8px 0 0 0;">Pick a preset or start from scratch</p></div>';
  html += '<div style="display:grid;grid-template-columns:repeat(4,180px);gap:12px;max-width:760px;">';
  
  for (const s of scenes) {
    html += `<div class="qs-card" data-cmd="${s.cmd}" style="background:#1a1a1a;border:1px solid #333;border-radius:12px;padding:16px;cursor:pointer;transition:all 0.2s;text-align:center;" onmouseenter="this.style.borderColor='#ff6b35';this.style.transform='translateY(-2px)'" onmouseleave="this.style.borderColor='#333';this.style.transform='none'">
      <div style="font-size:32px;margin-bottom:8px;">${s.icon}</div>
      <div style="color:#fff;font-size:14px;font-weight:600;margin-bottom:4px;">${s.name}</div>
      <div style="color:#666;font-size:11px;line-height:1.4;">${s.desc}</div>
    </div>`;
  }
  
  html += '</div>';
  html += '<div style="margin-top:24px;color:#555;font-size:12px;">Or type any command below — "add house", "make it rain", "zombie game"</div>';
  
  modal.innerHTML = html;
  document.body.appendChild(modal);
  
  // Click handlers
  modal.querySelectorAll('.qs-card').forEach(card => {
    card.onclick = () => {
      const cmd = card.dataset.cmd;
      modal.remove();
      if (window._runCommand) window._runCommand(cmd);
    };
  });
  
  // Close on Escape
  const escHandler = (e) => {
    if (e.key === 'Escape') { modal.remove(); document.removeEventListener('keydown', escHandler); }
  };
  document.addEventListener('keydown', escHandler);
}

// Show quick start after tutorial is dismissed
// Hook into tutorial skip/complete
window._onTutorialDone = function() { /* No auto quick-start */ };
// Quick start is now manual — triggered from toolbar button or ? icon
// Auto-show disabled to prevent popup on load

// Add "New World" button to toolbar
setTimeout(() => {
  const toolbar = document.querySelector('.toolbar, #toolbar, [class*=toolbar]');
  if (toolbar) {
    const btn = document.createElement('button');
    btn.textContent = '🌍';
    btn.title = 'New World';
    btn.style.cssText = 'background:none;border:none;font-size:20px;cursor:pointer;padding:4px 8px;';
    btn.onclick = () => showQuickStart();
    toolbar.prepend(btn);
  }
}, 1500);

window.showQuickStart = showQuickStart;


// === SETTINGS MENU (v217) ===
function showSettings() {
  panel = document.getElementById('settings-panel');
  if (panel) { panel.remove(); return; }
  
  // Load saved settings
  const saved = JSON.parse(localStorage.getItem('crate-settings') || '{}');
  const quality = saved.quality || 'high';
  const shadows = saved.shadows !== false;
  const fog = saved.fog !== false;
  const clouds = saved.clouds === true;
  const music = saved.music !== false;
  const sfx = saved.sfx !== false;
  const sensitivity = saved.sensitivity || 1;
  const fov = saved.fov || 60;
  
  panel = document.createElement('div');
  panel.id = 'settings-panel';
  panel.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:10020;display:flex;align-items:center;justify-content:center;font-family:-apple-system,sans-serif;backdrop-filter:blur(10px);';
  
  panel.innerHTML = `
    <div style="background:#111;border:1px solid #333;border-radius:16px;padding:32px;width:440px;max-height:80vh;overflow-y:auto;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;">
        <h2 style="margin:0;color:#fff;font-size:22px;">⚙️ Settings</h2>
        <div id="settings-close" style="cursor:pointer;font-size:20px;color:#666;">✕</div>
      </div>
      
      <div style="margin-bottom:20px;">
        <div style="color:#888;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;">Graphics</div>
        
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <span style="color:#ccc;font-size:14px;">Quality</span>
          <select id="s-quality" style="background:#222;color:#fff;border:1px solid #444;padding:4px 12px;border-radius:6px;">
            <option value="low" ${quality==='low'?'selected':''}>Low</option>
            <option value="medium" ${quality==='medium'?'selected':''}>Medium</option>
            <option value="high" ${quality==='high'?'selected':''}>High</option>
            <option value="ultra" ${quality==='ultra'?'selected':''}>Ultra</option>
          </select>
        </div>
        
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <span style="color:#ccc;font-size:14px;">Shadows</span>
          <label style="position:relative;width:44px;height:24px;">
            <input type="checkbox" id="s-shadows" ${shadows?'checked':''} style="opacity:0;width:0;height:0;">
            <span style="position:absolute;cursor:pointer;inset:0;background:${shadows?'#4ade80':'#333'};border-radius:24px;transition:0.3s;"></span>
            <span style="position:absolute;left:${shadows?'22px':'2px'};top:2px;width:20px;height:20px;background:#fff;border-radius:50%;transition:0.3s;"></span>
          </label>
        </div>
        
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <span style="color:#ccc;font-size:14px;">Fog</span>
          <label style="position:relative;width:44px;height:24px;">
            <input type="checkbox" id="s-fog" ${fog?'checked':''} style="opacity:0;width:0;height:0;">
            <span style="position:absolute;cursor:pointer;inset:0;background:${fog?'#4ade80':'#333'};border-radius:24px;transition:0.3s;"></span>
            <span style="position:absolute;left:${fog?'22px':'2px'};top:2px;width:20px;height:20px;background:#fff;border-radius:50%;transition:0.3s;"></span>
          </label>
        </div>
        
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <span style="color:#ccc;font-size:14px;">Clouds</span>
          <label style="position:relative;width:44px;height:24px;">
            <input type="checkbox" id="s-clouds" ${clouds?'checked':''} style="opacity:0;width:0;height:0;">
            <span style="position:absolute;cursor:pointer;inset:0;background:${clouds?'#4ade80':'#333'};border-radius:24px;transition:0.3s;"></span>
            <span style="position:absolute;left:${clouds?'22px':'2px'};top:2px;width:20px;height:20px;background:#fff;border-radius:50%;transition:0.3s;"></span>
          </label>
        </div>
        
        <div style="margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
            <span style="color:#ccc;font-size:14px;">FOV</span>
            <span style="color:#666;font-size:13px;" id="s-fov-val">${fov}°</span>
          </div>
          <input type="range" id="s-fov" min="40" max="120" value="${fov}" style="width:100%;accent-color:#ff6b35;">
        </div>
      </div>
      
      <div style="margin-bottom:20px;">
        <div style="color:#888;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;">Controls</div>
        <div style="margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
            <span style="color:#ccc;font-size:14px;">Mouse Sensitivity</span>
            <span style="color:#666;font-size:13px;" id="s-sens-val">${sensitivity.toFixed(1)}x</span>
          </div>
          <input type="range" id="s-sensitivity" min="0.1" max="3" step="0.1" value="${sensitivity}" style="width:100%;accent-color:#ff6b35;">
        </div>
      </div>
      
      <button id="s-apply" style="width:100%;padding:12px;background:#ff6b35;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">
        Apply & Save
      </button>
    </div>
  `;
  
  document.body.appendChild(panel);
  
  // FOV slider
  document.getElementById('s-fov').oninput = (e) => {
    document.getElementById('s-fov-val').textContent = e.target.value + '°';
  };
  document.getElementById('s-sensitivity').oninput = (e) => {
    document.getElementById('s-sens-val').textContent = parseFloat(e.target.value).toFixed(1) + 'x';
  };
  
  // Close
  document.getElementById('settings-close').onclick = () => panel.remove();
  document.addEventListener('keydown', function esc(e) { 
    if (e.key === 'Escape') { panel.remove(); document.removeEventListener('keydown', esc); } 
  });
  
  // Apply
  document.getElementById('s-apply').onclick = () => {
    const settings = {
      quality: document.getElementById('s-quality').value,
      shadows: document.getElementById('s-shadows').checked,
      fog: document.getElementById('s-fog').checked,
      clouds: document.getElementById('s-clouds').checked,
      sensitivity: parseFloat(document.getElementById('s-sensitivity').value),
      fov: parseInt(document.getElementById('s-fov').value),
    };
    
    localStorage.setItem('crate-settings', JSON.stringify(settings));
    
    // Apply quality
    const qualityMap = { low: 0.5, medium: 0.75, high: 1, ultra: window.devicePixelRatio || 1 };
    renderer.setPixelRatio(qualityMap[settings.quality] || 1);
    
    // Apply shadows
    renderer.shadowMap.enabled = settings.shadows;
    
    // Apply FOV
    camera.fov = settings.fov;
    camera.updateProjectionMatrix();
    
    // Apply fog
    if (!settings.fog) scene.fog = null;
    
    // Apply clouds
    if (!settings.clouds && _cloudGroup) { scene.remove(_cloudGroup); _cloudGroup = null; }
    else if (settings.clouds && !_cloudGroup) createClouds();
    
    // Apply sensitivity (store for mouse handler)
    window._mouseSensitivity = settings.sensitivity;
    
    panel.remove();
    showToast('⚙️ Settings saved!');
  };
}
window.showSettings = showSettings;

// === BUILD TOOLBAR — Always visible category icons ===
(function() {
  const toolbar = document.createElement('div');
  toolbar.id = 'build-toolbar';
  toolbar.style.cssText = 'position:fixed;bottom:42px;left:50%;transform:translateX(-50%);z-index:9997;display:flex;flex-direction:row;gap:4px;background:rgba(0,0,0,0.7);backdrop-filter:blur(10px);padding:6px 10px;border-radius:12px;border:1px solid #252525;max-width:80vw;overflow-x:auto;';
  
  const cats = [
    { action: 'play', icon: '▶️', tip: 'Play / First Person', color: '#22c55e', isPlay: true },
    { action: 'worlds', icon: '🌍', tip: 'Switch World', color: '#a855f7' },
    { cmd: 'edit', icon: '⏹️', tip: 'Stop', color: '#ef4444', isStop: true },
    { cmd: '_sep1', icon: '|', tip: '', isSep: true },
    { action: 'save', icon: '💾', tip: 'Save', color: '#4ade80' },
    { action: 'load', icon: '📂', tip: 'Load', color: '#60a5fa' },
    { action: 'share', icon: '🔗', tip: 'Share', color: '#ff6b35' },
    { action: 'export_html', icon: '📦', tip: 'Export', color: '#c084fc' },
    { cmd: '_sep2', icon: '|', tip: '', isSep: true },
    { action: 'library', icon: '🗂️', tip: 'All Assets', color: '#ffd700' },
  ];
  
  cats.forEach(c => {
    // Separator
    if (c.isSep) {
      const sep = document.createElement('div');
      sep.style.cssText = 'width:1px;height:24px;background:rgba(255,255,255,0.15);flex-shrink:0;align-self:center;margin:0 2px;';
      toolbar.appendChild(sep);
      return;
    }
    const btn = document.createElement('button');
    btn.title = c.tip;
    btn.textContent = c.icon;
    btn.style.cssText = 'width:34px;height:34px;border:none;background:transparent;font-size:16px;cursor:pointer;border-radius:8px;transition:all 0.15s;display:flex;align-items:center;justify-content:center;flex-shrink:0;';
    btn.onmouseenter = () => { btn.style.background = 'rgba(255,255,255,0.1)'; btn.style.transform = 'scale(1.15)'; };
    btn.onmouseleave = () => { btn.style.background = 'transparent'; btn.style.transform = 'scale(1)'; };
    btn.onclick = () => {
      if (c.action && window._sceneActions && window._sceneActions[c.action]) {
        window._sceneActions[c.action]();
      } else if (c.cmd && window._runCommand) {
        window._runCommand(c.cmd);
      }
      // Toggle play/stop button visibility
      if (c.isPlay || c.isStop) {
        toolbar.querySelectorAll('[data-play-btn]').forEach(b => {
          b.style.display = c.isPlay ? 'none' : 'flex';
        });
        toolbar.querySelectorAll('[data-stop-btn]').forEach(b => {
          b.style.display = c.isPlay ? 'flex' : 'none';
        });
      }
    };
    if (c.isPlay) { btn.setAttribute('data-play-btn', '1'); btn.style.background = 'rgba(34,197,94,0.2)'; btn.style.border = '1px solid #22c55e'; }
    if (c.isStop) { btn.setAttribute('data-stop-btn', '1'); btn.style.display = 'none'; btn.style.background = 'rgba(239,68,68,0.2)'; btn.style.border = '1px solid #ef4444'; }
    toolbar.appendChild(btn);
  });
  
  // Hide in play mode
  const origEnter = window._enterPlayMode;
  const origExit = window._exitPlayMode;
  
  // Wait for engine ready then append
  const waitAndAppend = () => {
    if (document.getElementById('crate-canvas')) {
      document.body.appendChild(toolbar);
    } else {
      setTimeout(waitAndAppend, 500);
    }
  };
  waitAndAppend();
})();

// ═══════════════════════════════════════════════════════════════
// 3D MODEL GENERATOR — Image-to-3D via Modal.com (TripoSR on L4)

// === Shooter click handler (v61) ===
document.addEventListener('mousedown', (e) => {
  if (!shooterMode || !playMode || e.button !== 0) return;
  if (ammo <= 0) { if (typeof showToast === 'function') showToast('🔫 Out of ammo! Press R to reload.'); return; }
  ammo--;
  updateShooterHUD();
  const cam = camera;
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
  createBullet(cam.position.clone().add(dir.clone().multiplyScalar(1)), dir);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'r' || e.key === 'R') {
    if (shooterMode) { ammo = maxAmmo; updateShooterHUD(); if (typeof showToast === 'function') showToast('🔄 Reloaded!'); }
  }
});

// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// MESHY AI INTEGRATION — Users connect their own Meshy account
// Text-to-3D and Image-to-3D via api.meshy.ai
// ═══════════════════════════════════════════════════════════════
const MESHY_API_BASE = 'https://api.meshy.ai';
const MESHY_TEST_KEY = 'msy_dummy_api_key_for_test_mode_12345678';

function getMeshyApiKey() {
  return localStorage.getItem('crate_meshy_api_key') || '';
}
function setMeshyApiKey(key) {
  localStorage.setItem('crate_meshy_api_key', key);
}

// Credit system
window._userCredits = JSON.parse(localStorage.getItem('crate-credits') || '{"plan":"free","credits":5,"used":0}');
function saveCredits() { localStorage.setItem('crate-credits', JSON.stringify(window._userCredits)); }
function getCreditsRemaining() { if (!window._userCredits) window._userCredits = {plan:'free',credits:5,used:0}; return Math.max(0, window._userCredits.credits - window._userCredits.used); }
function useCredits(amount) { window._userCredits.used += amount; saveCredits(); }

function showGeneratorModal() {
  if (document.getElementById('gen3d-modal')) { document.getElementById('gen3d-modal').remove(); }
  
  const credits = getCreditsRemaining();
  const modal = document.createElement('div');
  modal.id = 'gen3d-modal';
  modal.innerHTML = `
    <div style="position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:100000;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,sans-serif" onclick="if(event.target===this)this.remove()">
      <div style="background:#1a1a2e;border-radius:16px;width:560px;max-height:90vh;overflow-y:auto;color:#fff;box-shadow:0 25px 60px rgba(0,0,0,0.5)">
        
        <div style="padding:24px 28px 0;display:flex;justify-content:space-between;align-items:center">
          <div>
            <h2 style="margin:0;font-size:22px">🎨 3D Model Generator</h2>
            <p style="margin:4px 0 0;color:#888;font-size:13px">Generate 3D models from text or images via Meshy AI</p>
          </div>
          <div style="text-align:right">
            <div style="background:#2a2a4a;padding:6px 14px;border-radius:20px;font-size:13px">
              <span style="color:#fbbf24">⚡</span> <strong>${credits}</strong> credits left
            </div>
          </div>
        </div>

        <div style="padding:20px 28px">
          <!-- Tab buttons -->
          <div style="display:flex;gap:8px;margin-bottom:20px">
            <button id="gen3d-tab-img" onclick="document.getElementById('gen3d-img-section').style.display='block';document.getElementById('gen3d-txt-section').style.display='none';this.style.background='#6366f1';document.getElementById('gen3d-tab-txt').style.background='#2a2a4a'" style="flex:1;padding:10px;border:none;border-radius:8px;background:#6366f1;color:#fff;cursor:pointer;font-size:14px;font-weight:600">📷 Image to 3D</button>
            <button id="gen3d-tab-txt" onclick="document.getElementById('gen3d-txt-section').style.display='block';document.getElementById('gen3d-img-section').style.display='none';this.style.background='#6366f1';document.getElementById('gen3d-tab-img').style.background='#2a2a4a'" style="flex:1;padding:10px;border:none;border-radius:8px;background:#2a2a4a;color:#fff;cursor:pointer;font-size:14px;font-weight:600">✏️ Text to 3D</button>
          </div>

          <!-- Image to 3D -->
          <div id="gen3d-img-section">
            <div id="gen3d-dropzone" style="border:2px dashed #444;border-radius:12px;padding:40px 20px;text-align:center;cursor:pointer;transition:border-color 0.2s" 
                 ondragover="event.preventDefault();this.style.borderColor='#6366f1'" 
                 ondragleave="this.style.borderColor='#444'"
                 ondrop="event.preventDefault();this.style.borderColor='#444';handleGen3dDrop(event)"
                 onclick="document.getElementById('gen3d-file-input').click()">
              <div id="gen3d-preview" style="display:none;margin-bottom:12px"></div>
              <div id="gen3d-upload-text">
                <div style="font-size:36px;margin-bottom:8px">📁</div>
                <div style="color:#aaa;font-size:14px">Drop an image here or click to upload</div>
                <div style="color:#666;font-size:12px;margin-top:4px">PNG, JPG — any object, character, prop</div>
              </div>
            </div>
            <input type="file" id="gen3d-file-input" accept="image/*" style="display:none" onchange="handleGen3dFile(this.files[0])">
          </div>

          <!-- Text to 3D -->
          <div id="gen3d-txt-section" style="display:none">
            <textarea id="gen3d-text-prompt" placeholder="Describe the 3D model you want...&#10;e.g. 'A medieval wooden shield with iron bands'&#10;'A cute low-poly dragon'&#10;'Futuristic sci-fi rifle'" style="width:100%;height:100px;background:#0d0d1a;border:1px solid #333;border-radius:8px;color:#fff;padding:12px;font-size:14px;resize:none;box-sizing:border-box"></textarea>
            <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap" id="gen3d-suggestions">
              <span onclick="document.getElementById('gen3d-text-prompt').value=this.textContent" style="padding:4px 10px;background:#2a2a4a;border-radius:12px;color:#aaa;font-size:12px;cursor:pointer;border:1px solid #333">medieval sword</span>
              <span onclick="document.getElementById('gen3d-text-prompt').value=this.textContent" style="padding:4px 10px;background:#2a2a4a;border-radius:12px;color:#aaa;font-size:12px;cursor:pointer;border:1px solid #333">low-poly dragon</span>
              <span onclick="document.getElementById('gen3d-text-prompt').value=this.textContent" style="padding:4px 10px;background:#2a2a4a;border-radius:12px;color:#aaa;font-size:12px;cursor:pointer;border:1px solid #333">wooden treasure chest</span>
              <span onclick="document.getElementById('gen3d-text-prompt').value=this.textContent" style="padding:4px 10px;background:#2a2a4a;border-radius:12px;color:#aaa;font-size:12px;cursor:pointer;border:1px solid #333">sci-fi spaceship</span>
              <span onclick="document.getElementById('gen3d-text-prompt').value=this.textContent" style="padding:4px 10px;background:#2a2a4a;border-radius:12px;color:#aaa;font-size:12px;cursor:pointer;border:1px solid #333">stone castle tower</span>
              <span onclick="document.getElementById('gen3d-text-prompt').value=this.textContent" style="padding:4px 10px;background:#2a2a4a;border-radius:12px;color:#aaa;font-size:12px;cursor:pointer;border:1px solid #333">cute robot companion</span>
            </div>
          </div>

          <!-- Quality selector -->
          <div style="margin-top:16px;display:flex;gap:8px">
            <button class="gen3d-quality" data-quality="draft" data-cost="0.5" onclick="selectGen3dQuality(this)" style="flex:1;padding:8px;border:1px solid #333;border-radius:8px;background:#0d0d1a;color:#aaa;cursor:pointer;font-size:12px;text-align:center">
              <div style="font-weight:600">Draft</div>
              <div style="color:#666;font-size:11px">Preview only · ~30s</div>
            </button>
            <button class="gen3d-quality selected" data-quality="standard" data-cost="1" onclick="selectGen3dQuality(this)" style="flex:1;padding:8px;border:1px solid #6366f1;border-radius:8px;background:#1a1a3e;color:#fff;cursor:pointer;font-size:12px;text-align:center">
              <div style="font-weight:600">Standard ✓</div>
              <div style="color:#888;font-size:11px">Full quality · ~60s</div>
            </button>
            <button class="gen3d-quality" data-quality="hd" data-cost="2" onclick="selectGen3dQuality(this)" style="flex:1;padding:8px;border:1px solid #333;border-radius:8px;background:#0d0d1a;color:#aaa;cursor:pointer;font-size:12px;text-align:center">
              <div style="font-weight:600">HD</div>
              <div style="color:#666;font-size:11px">HD + PBR · ~90s</div>
            </button>
          </div>

          <!-- Generate button -->
          <button id="gen3d-btn" onclick="startGeneration()" style="width:100%;margin-top:16px;padding:14px;border:none;border-radius:10px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-size:16px;font-weight:700;cursor:pointer;transition:transform 0.1s" onmousedown="this.style.transform='scale(0.98)'" onmouseup="this.style.transform='scale(1)'">
            🚀 Generate 3D Model
          </button>

          <!-- Progress -->
          <div id="gen3d-progress" style="display:none;margin-top:16px;text-align:center">
            <div style="width:100%;height:4px;background:#2a2a4a;border-radius:2px;overflow:hidden">
              <div id="gen3d-progress-bar" style="width:0%;height:100%;background:linear-gradient(90deg,#6366f1,#8b5cf6);transition:width 0.3s;border-radius:2px"></div>
            </div>
            <div id="gen3d-status" style="color:#888;font-size:13px;margin-top:8px">Preparing...</div>
          </div>

          <!-- Result -->
          <div id="gen3d-result" style="display:none;margin-top:16px;background:#0d0d1a;border-radius:12px;padding:16px;text-align:center">
            <div style="font-size:14px;color:#4ade80;margin-bottom:12px">✅ Model generated!</div>
            <div style="display:flex;gap:8px">
              <button onclick="gen3dAddToScene()" style="flex:1;padding:10px;border:none;border-radius:8px;background:#22c55e;color:#fff;font-weight:600;cursor:pointer">➕ Add to Scene</button>
              <button onclick="gen3dDownload()" style="flex:1;padding:10px;border:none;border-radius:8px;background:#3b82f6;color:#fff;font-weight:600;cursor:pointer">💾 Download GLB</button>
              <button onclick="gen3dSellOnMarketplace()" style="flex:1;padding:10px;border:none;border-radius:8px;background:#f59e0b;color:#fff;font-weight:600;cursor:pointer">💰 Sell on Marketplace</button>
              <button onclick="gen3dSaveToLibrary()" style="flex:1;padding:10px;border:none;border-radius:8px;background:#8b5cf6;color:#fff;font-weight:600;cursor:pointer">📚 Save to Library</button>
            </div>
          </div>
        </div>

        <!-- Upgrade banner for free users -->
        ${window._userCredits.plan === 'free' ? `
        <div style="padding:16px 28px 24px;border-top:1px solid #2a2a4a">
          <div style="background:linear-gradient(135deg,#1a1a3e,#2a1a4e);border-radius:12px;padding:16px;display:flex;align-items:center;justify-content:space-between">
            <div>
              <div style="font-size:14px;font-weight:600">Need more credits?</div>
              <div style="color:#888;font-size:12px;margin-top:2px">Starting at $4.99/mo for 100 credits</div>
            </div>
            <button onclick="showPricingModal()" style="padding:8px 20px;border:none;border-radius:8px;background:#6366f1;color:#fff;font-weight:600;cursor:pointer;font-size:13px">Upgrade</button>
          </div>
        </div>` : ''}
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

// State
window._gen3dImage = null;
window._gen3dQuality = 'standard';
window._gen3dResultBlob = null;

window.selectGen3dQuality = selectGen3dQuality;
function selectGen3dQuality(btn) {
  document.querySelectorAll('.gen3d-quality').forEach(b => {
    b.style.border = '1px solid #333'; b.style.background = '#0d0d1a'; b.style.color = '#aaa';
    b.innerHTML = b.innerHTML.replace(' ✓', '');
  });
  btn.style.border = '1px solid #6366f1'; btn.style.background = '#1a1a3e'; btn.style.color = '#fff';
  btn.querySelector('div').textContent += ' ✓';
  window._gen3dQuality = btn.dataset.quality;
}

function handleGen3dFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    window._gen3dImage = e.target.result; // data URL
    const preview = document.getElementById('gen3d-preview');
    preview.innerHTML = `<img src="${e.target.result}" style="max-width:200px;max-height:200px;border-radius:8px;object-fit:contain">`;
    preview.style.display = 'block';
    document.getElementById('gen3d-upload-text').innerHTML = `<div style="color:#4ade80;font-size:13px;margin-top:8px">✓ ${file.name} — click to change</div>`;
  };
  reader.readAsDataURL(file);
}

function handleGen3dDrop(event) {
  const file = event.dataTransfer.files[0];
  if (file) handleGen3dFile(file);
}

window.startGeneration = startGeneration;
async function startGeneration() {
  const isTextMode = document.getElementById('gen3d-txt-section').style.display !== 'none';
  const textPrompt = isTextMode ? (document.getElementById('gen3d-text-prompt')?.value || '').trim() : '';
  if (!isTextMode && !window._gen3dImage) { showToast('Upload an image first!'); return; }
  if (isTextMode && !textPrompt) { showToast('Enter a description first!'); return; }
  
  const costMap = { draft: 0.5, standard: 1, hd: 2 };
  const cost = costMap[window._gen3dQuality] || 1;
  if (getCreditsRemaining() < cost) { showToast('Not enough credits! Upgrade your plan.'); return; }
  
  const btn = document.getElementById('gen3d-btn');
  const progress = document.getElementById('gen3d-progress');
  const progressBar = document.getElementById('gen3d-progress-bar');
  const status = document.getElementById('gen3d-status');
  const result = document.getElementById('gen3d-result');
  
  btn.disabled = true; btn.textContent = '⏳ Generating...'; btn.style.opacity = '0.6';
  progress.style.display = 'block'; result.style.display = 'none';
  
  // Animate progress bar
  let pct = 0;
  const progressInterval = setInterval(() => {
    pct = Math.min(pct + (pct < 60 ? 2 : pct < 90 ? 0.5 : 0.1), 95);
    progressBar.style.width = pct + '%';
    if (isTextMode) {
      if (pct < 15) status.textContent = '📝 Processing your description...';
      else if (pct < 40) status.textContent = '🎨 AI is generating reference image...';
      else if (pct < 65) status.textContent = '🧠 Building 3D model from image...';
      else if (pct < 85) status.textContent = '🔨 Extracting mesh & textures...';
      else status.textContent = '✨ Almost there...';
    } else {
      if (pct < 20) status.textContent = '🔄 Uploading image...';
      else if (pct < 50) status.textContent = '🧠 AI is building your 3D model...';
      else if (pct < 80) status.textContent = '🔨 Extracting mesh & textures...';
      else status.textContent = '✨ Almost there...';
    }
  }, 500);
  
  try {
    const apiKey = getMeshyApiKey();
    if (!apiKey) {
      clearInterval(progressInterval);
      status.textContent = '🔑 Please set your Meshy API key first!';
      progressBar.style.width = '0%';
      btn.disabled = false; btn.textContent = '🚀 Generate 3D Model'; btn.style.opacity = '1';
      showMeshyKeyModal();
      return;
    }
    
    const headers = { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' };
    
    // ── MESHY API CALL ──
    let taskId;
    if (isTextMode) {
      // Text-to-3D: Preview stage first
      status.textContent = '📝 Creating preview from your description...';
      const previewResp = await fetch(MESHY_API_BASE + '/openapi/v2/text-to-3d', {
        method: 'POST', headers,
        body: JSON.stringify({
          mode: 'preview',
          prompt: textPrompt,
          negative_prompt: 'low quality, low resolution, ugly, blurry',
          should_remesh: true,
        })
      });
      if (!previewResp.ok) { const err = await previewResp.json().catch(()=>({})); throw new Error(err.message || 'Meshy API error: ' + previewResp.status); }
      const previewData = await previewResp.json();
      taskId = previewData.result;
      
      // Poll preview
      let previewTask;
      let _pollCount1 = 0;
      while (true) {
        if (++_pollCount1 > 100) throw new Error('Generation timed out after 5 minutes');
        await new Promise(r => setTimeout(r, 3000));
        const pollResp = await fetch(MESHY_API_BASE + '/openapi/v2/text-to-3d/' + taskId, { headers: { 'Authorization': 'Bearer ' + apiKey } });
        previewTask = await pollResp.json();
        if (previewTask.status === 'SUCCEEDED') break;
        if (previewTask.status === 'FAILED') throw new Error('Preview failed: ' + (previewTask.task_error?.message || 'unknown'));
        pct = Math.min(10 + (previewTask.progress || 0) * 0.4, 50);
        progressBar.style.width = pct + '%';
        status.textContent = '🎨 Building preview... ' + (previewTask.progress || 0) + '%';
      }
      
      // Refine stage (if not draft quality)
      if (window._gen3dQuality !== 'draft') {
        status.textContent = '✨ Refining with textures...';
        const refineResp = await fetch(MESHY_API_BASE + '/openapi/v2/text-to-3d', {
          method: 'POST', headers,
          body: JSON.stringify({ mode: 'refine', preview_task_id: taskId })
        });
        if (!refineResp.ok) { const err = await refineResp.json().catch(()=>({})); throw new Error(err.message || 'Refine error: ' + refineResp.status); }
        const refineData = await refineResp.json();
        taskId = refineData.result;
        
        let _pollCount2 = 0;
        while (true) {
          if (++_pollCount2 > 100) throw new Error('Refine timed out after 5 minutes');
          await new Promise(r => setTimeout(r, 3000));
          const pollResp = await fetch(MESHY_API_BASE + '/openapi/v2/text-to-3d/' + taskId, { headers: { 'Authorization': 'Bearer ' + apiKey } });
          const refineTask = await pollResp.json();
          if (refineTask.status === 'SUCCEEDED') { previewTask = refineTask; break; }
          if (refineTask.status === 'FAILED') throw new Error('Refine failed: ' + (refineTask.task_error?.message || 'unknown'));
          pct = Math.min(50 + (refineTask.progress || 0) * 0.45, 95);
          progressBar.style.width = pct + '%';
          status.textContent = '✨ Refining... ' + (refineTask.progress || 0) + '%';
        }
      }
      
      // Download GLB
      const glbUrl = previewTask.model_urls?.glb;
      if (!glbUrl) throw new Error('No GLB URL in response');
      const glbResp = await fetch(glbUrl);
      const glbBlob = await glbResp.blob();
      window._gen3dResultBlob = glbBlob;
      window._gen3dResultUrl = URL.createObjectURL(glbBlob);
      
    } else {
      // Image-to-3D (single step)
      status.textContent = '🧠 Sending image to Meshy AI...';
      const imgResp = await fetch(MESHY_API_BASE + '/openapi/v1/image-to-3d', {
        method: 'POST', headers,
        body: JSON.stringify({
          image_url: window._gen3dImage, // data URI works!
          enable_pbr: true,
          should_remesh: window._gen3dQuality !== 'draft',
          should_texture: true,
        })
      });
      if (!imgResp.ok) { const err = await imgResp.json().catch(()=>({})); throw new Error(err.message || 'Meshy API error: ' + imgResp.status); }
      const imgData = await imgResp.json();
      taskId = imgData.result;
      
      // Poll until done
      let imgTask;
      let _pollCount3 = 0;
      while (true) {
        if (++_pollCount3 > 100) throw new Error('Image-to-3D timed out after 5 minutes');
        await new Promise(r => setTimeout(r, 3000));
        const pollResp = await fetch(MESHY_API_BASE + '/openapi/v1/image-to-3d/' + taskId, { headers: { 'Authorization': 'Bearer ' + apiKey } });
        imgTask = await pollResp.json();
        if (imgTask.status === 'SUCCEEDED') break;
        if (imgTask.status === 'FAILED') throw new Error('Generation failed: ' + (imgTask.task_error?.message || 'unknown'));
        pct = Math.min(5 + (imgTask.progress || 0) * 0.9, 95);
        progressBar.style.width = pct + '%';
        status.textContent = '🧠 Generating 3D model... ' + (imgTask.progress || 0) + '%';
      }
      
      // Download GLB
      const glbUrl = imgTask.model_urls?.glb;
      if (!glbUrl) throw new Error('No GLB URL in response');
      const glbResp = await fetch(glbUrl);
      const glbBlob = await glbResp.blob();
      window._gen3dResultBlob = glbBlob;
      window._gen3dResultUrl = URL.createObjectURL(glbBlob);
    }
    
    clearInterval(progressInterval);
    progressBar.style.width = '100%';
    const sizeMB = window._gen3dResultBlob ? (window._gen3dResultBlob.size / 1048576).toFixed(1) : '?';
    status.textContent = '✅ Done! ' + sizeMB + 'MB GLB model';
    result.style.display = 'block';
  } catch (err) {
    clearInterval(progressInterval);
    status.textContent = '❌ Error: ' + err.message;
    progressBar.style.width = '0%';
  }
  
  btn.disabled = false; btn.textContent = '🚀 Generate 3D Model'; btn.style.opacity = '1';
}

function gen3dAddToScene() {
  if (!window._gen3dResultUrl) return;
  const name = 'generated_' + Date.now();
  const url = window._gen3dResultUrl;
  gltfLoader.load(url, (gltf) => {
    const model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0.001) model.scale.setScalar(2.0 / maxDim);
    model.castShadow = true;
    model.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
    model.userData.name = name;
    model.userData.isGLB = true;
    // Position near player, grounded on terrain
    const px = (characterController ? characterController.position.x : 0) + (Math.random() - 0.5) * 6;
    const pz = (characterController ? characterController.position.z : 0) + (Math.random() - 0.5) * 6;
    addObj(name, model, px, pz);
    showToast('✓ 3D model added to scene!');
  });
  document.getElementById('gen3d-modal').remove();
}

function gen3dDownload() {
  if (!window._gen3dResultBlob) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(window._gen3dResultBlob);
  a.download = 'crate-engine-model-' + Date.now() + '.glb';
  a.click();
  showToast('💾 GLB downloaded!');
}

function gen3dSellOnMarketplace() {
  if (!window._gen3dResultBlob) return;
  const listingId = 'listing_' + Date.now();
  const listingName = prompt('Name your model:', 'AI Generated Model') || 'AI Generated Model';
  
  // Save blob to IndexedDB
  _modelDB.save(listingId, listingName, 'premium', window._gen3dResultBlob).then(() => {
    _assetCatalog = null;
  });
  
  // Save listing metadata to localStorage
  const listings = JSON.parse(localStorage.getItem('crate-marketplace-listings') || '[]');
  listings.push({
    id: listingId,
    name: listingName,
    creator: localStorage.getItem('crate-username') || 'Anonymous',
    price: 0,
    format: 'glb',
    created: new Date().toISOString(),
    downloads: 0,
  });
  localStorage.setItem('crate-marketplace-listings', JSON.stringify(listings));
  showToast('💰 Listed on marketplace! Model saved to your library too.');
  document.getElementById('gen3d-modal').remove();
}

function gen3dSaveToLibrary() {
  if (!window._gen3dResultBlob) return;
  const modelName = prompt('Name this model:', 'AI Model ' + new Date().toLocaleDateString()) || 'AI Model';
  const category = prompt('Category (characters, weapons, buildings, vehicles, furniture, nature, scifi, food):', 'food') || 'food';
  
  const modelId = 'user_' + Date.now();
  
  // Save to IndexedDB (persistent, survives cache clear)
  _modelDB.save(modelId, modelName, category.toLowerCase(), window._gen3dResultBlob).then(() => {
    // Invalidate catalog cache so it shows in gallery immediately
    _assetCatalog = null;
    showToast('📚 Saved to library! Find it in "' + category + '" category.');
  });
  
  // Also save to localStorage as backup
  const reader = new FileReader();
  reader.onload = () => {
    const saved = JSON.parse(localStorage.getItem('crate-user-models') || '[]');
    saved.push({ id: modelId, name: modelName, category: category.toLowerCase(), data_b64: reader.result.split(',')[1], created: new Date().toISOString() });
    localStorage.setItem('crate-user-models', JSON.stringify(saved));
  };
  reader.readAsDataURL(window._gen3dResultBlob);
  
  document.getElementById('gen3d-modal').remove();
}

// Pricing modal
function showPricingModal() {
  if (document.getElementById('pricing-modal')) document.getElementById('pricing-modal').remove();
  const m = document.createElement('div');
  m.id = 'pricing-modal';
  m.innerHTML = `
    <div style="position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:100001;display:flex;align-items:center;justify-content:center;font-family:-apple-system,sans-serif" onclick="if(event.target===this)this.remove()">
      <div style="background:#1a1a2e;border-radius:16px;width:720px;padding:32px;color:#fff">
        <h2 style="text-align:center;margin:0 0 8px">⚡ Crate Engine Plans</h2>
        <p style="text-align:center;color:#888;margin:0 0 24px;font-size:14px">Generate 3D models. Sell on marketplace. Build games.</p>
        <div style="display:flex;gap:16px">
          ${[
            { name: 'Starter', price: '4.99', credits: '100', models: '100 standard / 50 HD', color: '#3b82f6' },
            { name: 'Pro', price: '14.99', credits: '500', models: '500 standard / 250 HD', color: '#8b5cf6', pop: true },
            { name: 'Studio', price: '39.99', credits: '2,000', models: '2,000 standard / 1,000 HD', color: '#f59e0b' },
          ].map(p => `
            <div style="flex:1;background:${p.pop ? '#1a1a4e' : '#0d0d1a'};border:${p.pop ? '2px solid #8b5cf6' : '1px solid #333'};border-radius:12px;padding:20px;text-align:center;position:relative">
              ${p.pop ? '<div style="position:absolute;top:-10px;left:50%;transform:translateX(-50%);background:#8b5cf6;padding:2px 12px;border-radius:10px;font-size:11px;font-weight:600">POPULAR</div>' : ''}
              <div style="font-size:18px;font-weight:700;color:${p.color}">${p.name}</div>
              <div style="font-size:32px;font-weight:800;margin:8px 0">$${p.price}<span style="font-size:14px;color:#888">/mo</span></div>
              <div style="color:#aaa;font-size:13px;margin-bottom:12px">${p.credits} credits/month</div>
              <div style="color:#888;font-size:12px;margin-bottom:16px">${p.models}</div>
              <ul style="text-align:left;list-style:none;padding:0;margin:0 0 16px;font-size:12px;color:#aaa">
                <li style="margin:4px 0">✅ Image to 3D</li>
                <li style="margin:4px 0">✅ GLB/OBJ export</li>
                <li style="margin:4px 0">✅ Add to scene</li>
                <li style="margin:4px 0">✅ Sell on marketplace</li>
                ${p.name !== 'Starter' ? '<li style="margin:4px 0">✅ HD quality</li>' : ''}
                ${p.name === 'Studio' ? '<li style="margin:4px 0">✅ API access</li><li style="margin:4px 0">✅ Priority queue</li>' : ''}
              </ul>
              <button onclick="selectPlan('${p.name.toLowerCase()}', ${p.credits.replace(',','')}, ${p.price})" style="width:100%;padding:10px;border:none;border-radius:8px;background:${p.color};color:#fff;font-weight:600;cursor:pointer">Choose ${p.name}</button>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(m);
}

function selectPlan(plan, credits, price) {
  // For now, just set credits locally (Stripe integration later)
  window._userCredits = { plan, credits, used: 0 };
  saveCredits();
  showToast('✅ Plan activated! ' + credits + ' credits loaded.');
  if (document.getElementById('pricing-modal')) document.getElementById('pricing-modal').remove();
  if (document.getElementById('gen3d-modal')) {
    document.getElementById('gen3d-modal').remove();
    showGeneratorModal(); // Refresh to show new credits
  }
}

// 3D generator button removed

// Hook into AI agent — "generate" commands open the generator
window._handleGenerateCommand = function(cmd) {
  const lower = cmd.toLowerCase();
  if (lower.match(/^(generate|create|make)\s+(a\s+)?3d\s+(model|asset|object)/i) || 
      lower === '3d generator' || lower === 'generator' || lower === 'generate 3d' || lower === 'generate 3d model') {
    showGeneratorModal();
    return '🎨 Opening 3D Generator...';
  }
  return null;
};

console.log('[CRATE ENGINE] 3D Generator module loaded ✓');


// === AUTO-RECORD MODE (v218 — orbit camera recording) ===
(function() {
  var params = new URLSearchParams(window.location.search);
  var sceneCmd = params.get("autorecord");
  if (!sceneCmd) return;
  
  var cmdMap = {
    city: "generate city", town: "generate town", zombie: "zombie game",
    racing: "racing mode", rpg: "rpg game", horror: "horror game",
    survival: "survival game", fps: "fps game", fantasy: "generate fantasy"
  };
  var cmd = cmdMap[sceneCmd] || ("generate " + sceneCmd);
  var duration = parseInt(params.get("duration")) || 120;
  
  console.log("[AutoRecord] v218 orbit mode: " + sceneCmd + " (" + duration + "s)");
  
  function clearOverlays() {
    document.querySelectorAll("div").forEach(function(d) {
      if (d.style && d.style.zIndex && parseInt(d.style.zIndex) > 9500) d.style.display = "none";
    });
  }
  
  // Step 1: Clear overlays + generate scene
  setTimeout(function() { clearOverlays(); }, 1000);
  setTimeout(function() {
    clearOverlays();
    if (window._runCommand) {
      window._runCommand(cmd);
      console.log("[AutoRecord] Generating: " + cmd);
    }
  }, 3000);
  setTimeout(function() { clearOverlays(); }, 5000);
  setTimeout(function() { clearOverlays(); }, 10000);
  
  // Step 2: After scene loads, orbit camera and record
  var recording = false;
  var recordData = null;
  var moveInt = null;
  var orbitAngle = 0;
  
  setTimeout(function() {
    clearOverlays();
    recording = true;
    recordData = {
      version: 2, mode: "orbit", sceneType: sceneCmd,
      startTime: Date.now(), frames: [], sceneObjects: []
    };
    
    // Snapshot all scene objects
    if (typeof scene !== "undefined") {
      scene.children.forEach(function(obj) {
        if (obj.userData && (obj.userData.objectType || obj.userData.name)) {
          recordData.sceneObjects.push({
            type: obj.userData.objectType || "unknown",
            name: obj.userData.displayName || obj.userData.name || obj.name || "",
            pos: [Math.round(obj.position.x), Math.round(obj.position.y), Math.round(obj.position.z)]
          });
        }
      });
    }
    console.log("[AutoRecord] Recording! Objects: " + recordData.sceneObjects.length);
    document.title = "🔴 REC — " + sceneCmd + " (" + recordData.sceneObjects.length + " objects)";
    
    // Orbit camera around world center
    moveInt = setInterval(function() {
      if (!recording) return;
      orbitAngle += 0.015;
      var t = (Date.now() - recordData.startTime) / 1000;
      var r = 80 + Math.sin(t * 0.1) * 30;
      var h = 40 + Math.sin(t * 0.15) * 20;
      var cx = Math.cos(orbitAngle) * r;
      var cz = Math.sin(orbitAngle) * r;
      if (typeof camera !== "undefined") {
        camera.position.set(cx, h, cz);
        camera.lookAt(0, 5, 0);
      }
      if (t % 1 < 0.12) {
        recordData.frames.push({
          t: Math.round(t * 1000),
          cam: [Math.round(cx), Math.round(h), Math.round(cz)]
        });
      }
    }, 100);
  }, 18000);
  
  // Step 3: Save when done
  setTimeout(function() {
    recording = false;
    if (moveInt) clearInterval(moveInt);
    if (recordData) {
      recordData.endTime = Date.now();
      recordData.duration = recordData.endTime - recordData.startTime;
      recordData.totalFrames = recordData.frames.length;
      var json = JSON.stringify(recordData);
      try { localStorage.setItem("autorec_" + sceneCmd + "_" + Date.now(), json); } catch(e) {}
      console.log("[AutoRecord] DONE! " + recordData.totalFrames + " frames, " + recordData.sceneObjects.length + " objects");
      document.title = "✅ DONE — " + sceneCmd + " (" + recordData.sceneObjects.length + " objects)";
    }
  }, (duration + 18) * 1000);
})();

// === WATER ZONES REGISTRY ===
window._waterZones = [];
function registerWaterZone(box3) { window._waterZones.push(box3); }
function clearWaterZones() { window._waterZones.length = 0; }

// =====================================================
// === PROCEDURAL NATURE SYSTEM ========================
// === Pine, Oak, Birch, Bush, Grass, Ground ===========
// =====================================================

// Ground material with grass colors
function _makeGroundMat() {
  const mat = new THREE.MeshStandardMaterial({
    color: 0x3a7d2c, roughness: 0.95, metalness: 0.0
  });
  return mat;
}

// Leaf cluster (shared geometry for performance)
const _leafGeo = new THREE.SphereGeometry(1, 7, 5);

function _makeLeafMat(color) {
  return new THREE.MeshStandardMaterial({
    color, roughness: 0.9, metalness: 0.0,
    flatShading: true
  });
}

// Trunk geometry
function _makeTrunk(h, rBot, rTop) {
  return new THREE.CylinderGeometry(rTop, rBot, h, 6, 1);
}

// === PINE TREE ===
function createPineTree(opts = {}) {
  const { x=0, z=0, height=8, scale=1 } = opts;
  const g = new THREE.Group();
  g.userData.isProcTree = true;

  const h = height * scale;
  // Trunk
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c3a1e, roughness: 1, flatShading: true });
  const trunk = new THREE.Mesh(_makeTrunk(h * 0.35, 0.13 * scale, 0.07 * scale), trunkMat);
  trunk.position.y = h * 0.175;
  trunk.castShadow = true;
  g.add(trunk);

  // Layered cone foliage
  const darkGreen = new THREE.MeshStandardMaterial({ color: 0x1a5c2e, roughness: 0.9, flatShading: true });
  const midGreen  = new THREE.MeshStandardMaterial({ color: 0x2d7a40, roughness: 0.9, flatShading: true });
  const lightGreen= new THREE.MeshStandardMaterial({ color: 0x3a9455, roughness: 0.9, flatShading: true });

  const layers = [
    { y: h * 0.28, r: 1.9 * scale, lh: h * 0.42, mat: darkGreen },
    { y: h * 0.52, r: 1.45* scale, lh: h * 0.36, mat: midGreen  },
    { y: h * 0.72, r: 1.05* scale, lh: h * 0.30, mat: midGreen  },
    { y: h * 0.87, r: 0.60* scale, lh: h * 0.24, mat: lightGreen},
  ];
  layers.forEach(l => {
    const coneGeo = new THREE.ConeGeometry(l.r, l.lh, 7, 1);
    const cone = new THREE.Mesh(coneGeo, l.mat);
    cone.position.y = l.y;
    cone.castShadow = true;
    g.add(cone);
  });

  g.position.set(x, 0, z);
  // Slight random rotation & scale variation
  g.rotation.y = Math.random() * Math.PI * 2;
  const sv = 0.85 + Math.random() * 0.35;
  g.scale.setScalar(sv);
  return g;
}

// === OAK TREE ===
function createOakTree(opts = {}) {
  const { x=0, z=0, height=7, scale=1 } = opts;
  const g = new THREE.Group();
  g.userData.isProcTree = true;

  const h = height * scale;
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a2e12, roughness: 1, flatShading: true });

  // Trunk with slight lean
  const trunk = new THREE.Mesh(_makeTrunk(h * 0.45, 0.18 * scale, 0.10 * scale), trunkMat);
  trunk.position.y = h * 0.225;
  trunk.castShadow = true;
  g.add(trunk);

  // Branch stubs
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.random() * 0.8;
    const branch = new THREE.Mesh(_makeTrunk(h * 0.22, 0.06 * scale, 0.03 * scale), trunkMat);
    branch.position.set(Math.cos(a) * h * 0.12, h * 0.36, Math.sin(a) * h * 0.12);
    branch.rotation.z = Math.cos(a) * 0.45;
    branch.rotation.x = Math.sin(a) * 0.45;
    g.add(branch);
  }

  // Main canopy — multiple overlapping spheres for volume
  const leafColors = [0x2d6e30, 0x3a8c3e, 0x4aad4e, 0x255c28, 0x5abf5e];
  const clusters = [
    { ox:0,    oy:0,    oz:0,    r:1.9 },
    { ox:0.8,  oy:0.4,  oz:0.5,  r:1.4 },
    { ox:-0.9, oy:0.2,  oz:-0.4, r:1.3 },
    { ox:0.3,  oy:0.7,  oz:-0.8, r:1.2 },
    { ox:-0.5, oy:-0.3, oz:0.7,  r:1.1 },
    { ox:0,    oy:1.1,  oz:0,    r:0.9 },
  ];
  clusters.forEach((c, i) => {
    const leafMat = _makeLeafMat(leafColors[i % leafColors.length]);
    const leaf = new THREE.Mesh(_leafGeo, leafMat);
    leaf.scale.setScalar(c.r * scale);
    leaf.position.set(c.ox * scale + h * 0.08, h * 0.6 + c.oy * scale, c.oz * scale);
    leaf.castShadow = true;
    g.add(leaf);
  });

  g.position.set(x, 0, z);
  g.rotation.y = Math.random() * Math.PI * 2;
  const sv = 0.8 + Math.random() * 0.45;
  g.scale.setScalar(sv);
  return g;
}

// === BIRCH TREE ===
function createBirchTree(opts = {}) {
  const { x=0, z=0, height=9, scale=1 } = opts;
  const g = new THREE.Group();
  g.userData.isProcTree = true;

  const h = height * scale;
  const trunkMat = new THREE.MeshStandardMaterial({
    color: 0xe8e0d0, roughness: 0.8, flatShading: true
  });

  const trunk = new THREE.Mesh(_makeTrunk(h * 0.65, 0.10 * scale, 0.07 * scale), trunkMat);
  trunk.position.y = h * 0.325;
  trunk.castShadow = true;
  g.add(trunk);

  // Wispy leaf clusters
  const birchLeafColors = [0x8ab84a, 0xa0d060, 0x70a030, 0xc8e878];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const r = (0.3 + Math.random() * 0.7) * scale;
    const leafMat = _makeLeafMat(birchLeafColors[i % birchLeafColors.length]);
    const leaf = new THREE.Mesh(_leafGeo, leafMat);
    leaf.scale.set(r * 1.1, r * 0.7, r);
    const py = h * (0.55 + Math.random() * 0.35);
    leaf.position.set(Math.cos(a) * h * 0.15, py, Math.sin(a) * h * 0.15);
    leaf.castShadow = true;
    g.add(leaf);
  }

  g.position.set(x, 0, z);
  g.rotation.y = Math.random() * Math.PI * 2;
  g.scale.setScalar(0.8 + Math.random() * 0.4);
  return g;
}

// === BUSH ===
function createBush(opts = {}) {
  const { x=0, z=0, scale=1 } = opts;
  const g = new THREE.Group();
  g.userData.isProcTree = true;

  const bushColors = [0x2d6e30, 0x3a8c3e, 0x255c28, 0x4aad4e, 0x1e5226];
  const count = 3 + Math.floor(Math.random() * 4);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.random();
    const r = (0.3 + Math.random() * 0.5) * scale;
    const mat = _makeLeafMat(bushColors[i % bushColors.length]);
    const bush = new THREE.Mesh(_leafGeo, mat);
    const px = Math.cos(a) * r * 0.6;
    const pz = Math.sin(a) * r * 0.6;
    bush.scale.set(r * 0.9, r * 0.65, r * 0.9);
    bush.position.set(px, r * 0.55, pz);
    bush.castShadow = true;
    g.add(bush);
  }

  g.position.set(x, 0, z);
  g.rotation.y = Math.random() * Math.PI * 2;
  g.scale.setScalar(0.6 + Math.random() * 0.8);
  return g;
}

// === GRASS TUFT ===
function createGrassTuft(x, z) {
  const g = new THREE.Group();
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x4a8c28, roughness: 1, side: THREE.DoubleSide, flatShading: true });
  for (let i = 0; i < 5; i++) {
    const bladeGeo = new THREE.PlaneGeometry(0.08, 0.3 + Math.random() * 0.2);
    const blade = new THREE.Mesh(bladeGeo, grassMat);
    blade.position.set((Math.random()-0.5)*0.2, 0.15, (Math.random()-0.5)*0.2);
    blade.rotation.y = Math.random() * Math.PI;
    blade.rotation.x = (Math.random()-0.5) * 0.4;
    g.add(blade);
  }
  g.position.set(x, 0, z);
  return g;
}

// Expose to window
window.createPineTree = createPineTree;
window.createOakTree = createOakTree;
window.createBirchTree = createBirchTree;
window.createBush = createBush;
window.createGrassTuft = createGrassTuft;

// =====================================================

// =====================================================
// === FOREST WORLD v2 — Procedural + Gerstner Water ===
// =====================================================

// Gerstner Wave Water Shader
const GERSTNER_VERT = `
uniform float uTime;
uniform float uWaveHeight;
varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vNormal2;

vec3 gerstner(vec3 pos, vec2 dir, float steepness, float wavelength, float speed) {
  float k = 2.0 * 3.14159 / wavelength;
  float c = sqrt(9.8 / k) * speed;
  float f = k * (dot(dir, pos.xz) - c * uTime);
  float a = steepness / k;
  return vec3(
    dir.x * a * cos(f),
    a * sin(f),
    dir.y * a * cos(f)
  );
}

void main() {
  vUv = uv;
  vec3 pos = position;
  vec3 g1 = gerstner(pos, normalize(vec2(1.0, 0.8)), 0.06, 22.0, 0.9);
  vec3 g2 = gerstner(pos, normalize(vec2(-0.6, 1.0)), 0.04, 14.0, 1.1);
  vec3 g3 = gerstner(pos, normalize(vec2(0.3, -0.7)), 0.03,  9.0, 1.3);
  pos += (g1 + g2 + g3) * uWaveHeight;
  vWorldPos = pos;
  // Approximate normal
  vec3 bitangent = vec3(1.0, g1.y + g2.y + g3.y, 0.0);
  vec3 tangent   = vec3(0.0, g1.y + g2.y + g3.y, 1.0);
  vNormal2 = normalize(cross(tangent, bitangent));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}`;

const GERSTNER_FRAG = `
uniform float uTime;
uniform vec3 uDeepColor;
uniform vec3 uShallowColor;
varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vNormal2;

void main() {
  // Depth gradient from center
  float dist = length(vUv - 0.5) * 2.0;
  vec3 waterCol = mix(uDeepColor, uShallowColor, dist * dist);
  
  // Fresnel specular
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  float fresnel = pow(1.0 - max(dot(vNormal2, viewDir), 0.0), 3.0);
  vec3 specular = vec3(1.0) * fresnel * 0.6;
  
  // Foam at edges
  float foam = smoothstep(0.85, 1.0, dist);
  waterCol = mix(waterCol, vec3(0.95, 0.98, 1.0), foam * 0.5);
  
  // Animated ripple lines
  float ripple = sin(vUv.x * 40.0 + uTime * 2.0) * sin(vUv.y * 35.0 - uTime * 1.5) * 0.04;
  waterCol += vec3(ripple * 0.5);
  
  gl_FragColor = vec4(waterCol + specular, 0.88);
}`;

// ═══ City builder, mine interior, template presets, and vehicle animation
// ═══ have been extracted to city-builder.mjs
// ═══ (buildGerstnerLake, buildMineInterior, populateMineAssets, loadGroupedAsset,
// ═══  listGroupPieces, buildPackShowcase, loadUEBuilding, buildCityWorld3,
// ═══  applyTemplatePreset, _stopCityVehicles, _startCityVehicles)
// END_OF_EXTRACTED_BLOCK
