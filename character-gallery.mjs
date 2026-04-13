import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let galleryContext = {};

export function setCharacterGalleryContext(nextContext = {}) {
  galleryContext = { ...galleryContext, ...nextContext };
}

export const CHARACTER_LIBRARY = [
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
  { id: 'zombie', file: 'npcs/quat_zombie', name: 'Zombie', desc: 'Undead walker', category: 'Enemy', thumb: '🧟', defaultAnim: 'Walk' },
  { id: 'zombie_smooth', file: 'npcs/quat_zombiesmooth', name: 'Zombie (Smooth)', desc: 'Fast zombie', category: 'Enemy', thumb: '🧟', defaultAnim: 'Walk' },
  { id: 'skeleton', file: 'npcs/quat_skeleton', name: 'Skeleton', desc: 'Bone warrior', category: 'Enemy', thumb: '💀', defaultAnim: 'Idle' },
  { id: 'dragon', file: 'npcs/quat_dragon', name: 'Dragon', desc: 'Fire-breathing beast', category: 'Enemy', thumb: '🐉', defaultAnim: 'Idle' },
  { id: 'slime', file: 'npcs/quat_slime', name: 'Slime', desc: 'Gelatinous blob', category: 'Enemy', thumb: '🫧', defaultAnim: 'Idle' },
  { id: 'bat', file: 'npcs/quat_bat', name: 'Bat', desc: 'Flying creature', category: 'Enemy', thumb: '🦇', defaultAnim: 'Idle' },
  { id: 'robot', file: 'npcs/quat_robot', name: 'Robot', desc: 'Mechanical enemy', category: 'Enemy', thumb: '🤖', defaultAnim: 'Idle' },
];

export function getCharacterLibrary() {
  return CHARACTER_LIBRARY;
}

export function findCharacterLibraryEntry(id) {
  return CHARACTER_LIBRARY.find((entry) => entry.id === id) || null;
}

export function showCharacterGallery(onSelect) {
  return new Promise((resolve) => {
    const existing = document.getElementById('char-gallery-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'char-gallery-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.92);z-index:10005;display:flex;flex-direction:column;align-items:center;overflow-y:auto;font-family:monospace;padding:20px 0;';

    const header = document.createElement('div');
    header.style.cssText = 'text-align:center;margin-bottom:20px;flex-shrink:0;';
    header.innerHTML = '<div style="font-size:32px;color:#ffd700;text-shadow:0 0 20px rgba(255,215,0,0.4);margin-bottom:6px;">⚔️ CHARACTER SELECT</div><div style="font-size:13px;color:#888;">Click any character to play as them</div>';
    overlay.appendChild(header);

    const tabs = document.createElement('div');
    tabs.style.cssText = 'display:flex;gap:10px;margin-bottom:20px;flex-shrink:0;';
    let currentFilter = 'All';
    ['All', 'Hero', 'NPC', 'Enemy'].forEach((category) => {
      const tab = document.createElement('button');
      tab.textContent = category;
      tab.style.cssText = 'padding:8px 20px;border:1px solid #444;border-radius:20px;background:' + (category === 'All' ? '#ffd700' : 'transparent') + ';color:' + (category === 'All' ? '#000' : '#aaa') + ';cursor:pointer;font-family:monospace;font-size:13px;transition:all 0.2s;';
      tab.onclick = () => {
        currentFilter = category;
        tabs.querySelectorAll('button').forEach((button) => {
          button.style.background = 'transparent';
          button.style.color = '#aaa';
          button.style.border = '1px solid #444';
        });
        tab.style.background = '#ffd700';
        tab.style.color = '#000';
        tab.style.border = '1px solid #ffd700';
        renderGrid();
      };
      tabs.appendChild(tab);
    });
    overlay.appendChild(tabs);

    const grid = document.createElement('div');
    grid.id = 'char-gallery-grid';
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,180px);gap:16px;justify-content:center;max-width:1000px;width:90%;padding-bottom:40px;';
    overlay.appendChild(grid);

    const closeBtn = document.createElement('div');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'position:fixed;top:15px;right:20px;font-size:28px;color:#666;cursor:pointer;z-index:10006;transition:color 0.2s;';
    closeBtn.onmouseenter = () => { closeBtn.style.color = '#fff'; };
    closeBtn.onmouseleave = () => { closeBtn.style.color = '#666'; };
    closeBtn.onclick = () => { overlay.remove(); resolve(null); };
    overlay.appendChild(closeBtn);

    function renderGrid() {
      grid.innerHTML = '';
      const selectedCharacterType = galleryContext.getSelectedCharacterType?.() || null;
      const filtered = currentFilter === 'All'
        ? CHARACTER_LIBRARY
        : CHARACTER_LIBRARY.filter((character) => character.category === currentFilter);

      filtered.forEach((character) => {
        const card = document.createElement('div');
        card.style.cssText = 'background:rgba(255,255,255,0.04);border:2px solid transparent;border-radius:12px;overflow:hidden;cursor:pointer;transition:all 0.25s;position:relative;';
        card.onmouseenter = () => {
          card.style.borderColor = '#ffd700';
          card.style.transform = 'translateY(-4px)';
          card.style.boxShadow = '0 8px 25px rgba(255,215,0,0.15)';
        };
        card.onmouseleave = () => {
          card.style.borderColor = 'transparent';
          card.style.transform = 'translateY(0)';
          card.style.boxShadow = 'none';
        };

        const canvasWrap = document.createElement('div');
        canvasWrap.style.cssText = 'width:180px;height:180px;background:#111;position:relative;';

        const cvs = document.createElement('canvas');
        cvs.width = 180;
        cvs.height = 180;
        cvs.style.cssText = 'width:100%;height:100%;display:block;';
        canvasWrap.appendChild(cvs);

        const spinner = document.createElement('div');
        spinner.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#555;font-size:24px;';
        spinner.textContent = '⏳';
        canvasWrap.appendChild(spinner);
        card.appendChild(canvasWrap);

        const info = document.createElement('div');
        info.style.cssText = 'padding:10px 12px;';

        const nameEl = document.createElement('div');
        nameEl.style.cssText = 'font-size:14px;font-weight:bold;color:#e0e0e0;margin-bottom:3px;';
        nameEl.textContent = character.name;
        info.appendChild(nameEl);

        const descEl = document.createElement('div');
        descEl.style.cssText = 'font-size:11px;color:#666;line-height:1.3;';
        descEl.textContent = character.desc;
        info.appendChild(descEl);

        const badge = document.createElement('span');
        const badgeColor = character.category === 'Hero'
          ? 'rgba(34,197,94,0.2);color:#22c55e'
          : character.category === 'NPC'
            ? 'rgba(59,130,246,0.25);color:#60a5fa'
            : 'rgba(239,68,68,0.2);color:#ef4444';
        badge.style.cssText = 'position:absolute;top:8px;right:8px;padding:2px 8px;border-radius:10px;font-size:10px;background:' + badgeColor + ';';
        badge.textContent = character.category;
        card.appendChild(badge);

        if (selectedCharacterType === character.id) {
          card.style.borderColor = '#22c55e';
          const activeBadge = document.createElement('div');
          activeBadge.style.cssText = 'position:absolute;top:8px;left:8px;background:#22c55e;color:#000;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:bold;';
          activeBadge.textContent = '✓ ACTIVE';
          card.appendChild(activeBadge);
        }

        card.onclick = () => {
          galleryContext.setSelectedCharacterType?.(character.id);
          try { localStorage.setItem('crate_character', character.id); } catch {}

          const characterController = galleryContext.getCharacterController?.();
          if (characterController && !characterController.characterModels[character.id]) {
            characterController.characterModels[character.id] = { file: character.file, animPrefix: '', procedural: true };
          }

          overlay.remove();

          const renderer = galleryContext.getRenderer?.();
          const canvas = galleryContext.getCanvas?.();
          const scene = galleryContext.getScene?.();
          const camera = galleryContext.getCamera?.();
          if (renderer && canvas && scene && camera) {
            setTimeout(() => {
              renderer.setSize(canvas.clientWidth, canvas.clientHeight);
              renderer.render(scene, camera);
            }, 100);
          }

          if (typeof onSelect === 'function') onSelect(character.id);
          resolve(character.id);
        };

        card.appendChild(info);
        grid.appendChild(card);

        const loadPreview = () => {
          try {
            const offCanvas = document.createElement('canvas');
            offCanvas.width = 360;
            offCanvas.height = 360;

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
            const dracoLoader = galleryContext.getDracoLoader?.();
            if (dracoLoader) miniLoader.setDRACOLoader(dracoLoader);

            miniLoader.load('/models/' + (character.file.endsWith('.glb') ? character.file : character.file + '.glb'), (gltf) => {
              spinner.remove();
              const model = gltf.scene;
              const box = new THREE.Box3().setFromObject(model);
              const size = box.getSize(new THREE.Vector3());
              const maxDim = Math.max(size.x, size.y, size.z);
              model.scale.setScalar(2.0 / Math.max(maxDim, 0.001));
              const centeredBox = new THREE.Box3().setFromObject(model);
              const center = centeredBox.getCenter(new THREE.Vector3());
              model.position.sub(center);
              const groundedBox = new THREE.Box3().setFromObject(model);
              model.position.y -= groundedBox.min.y;
              model.rotation.y = Math.PI * 0.25;
              miniScene.add(model);

              miniRenderer.render(miniScene, miniCam);
              const img = document.createElement('img');
              img.src = miniRenderer.domElement.toDataURL('image/jpeg', 0.9);
              img.style.cssText = 'width:100%;height:100%;display:block;object-fit:cover;border-radius:10px 10px 0 0;';
              cvs.parentNode.replaceChild(img, cvs);

              miniRenderer.dispose();
              miniScene.traverse((obj) => {
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) {
                  const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
                  materials.forEach((material) => {
                    if (material.map) material.map.dispose();
                    material.dispose();
                  });
                }
              });
            }, undefined, () => {
              spinner.textContent = '❌';
            });
          } catch {
            spinner.textContent = '❌';
          }
        };

        if (window.IntersectionObserver) {
          const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
              observer.disconnect();
              loadPreview();
            }
          }, { root: overlay, threshold: 0.1 });
          observer.observe(card);
        } else {
          loadPreview();
        }
      });
    }

    renderGrid();
    document.body.appendChild(overlay);
  });
}
