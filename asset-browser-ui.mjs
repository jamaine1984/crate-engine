import * as THREE from 'three';

let context = {
  loadAssetCatalog: async () => ({}),
  getCharacterCount: async () => 0,
  showCharacterGallery: () => Promise.resolve(null),
  getGltfLoader: () => null,
  resolveAssetUrl: (url) => url,
  showToast: () => {},
};

const CAT_META = {
  characters: { icon: '🧑', color: '#ffd700', label: 'Characters' },
  weapons: { icon: '⚔️', color: '#ef4444', label: 'Weapons' },
  buildings: { icon: '🏠', color: '#8b5cf6', label: 'Buildings' },
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

let thumbRenderer = null;

function normalizeModelUrl(file) {
  const raw = String(file || '').trim();
  if (!raw) return '';
  if (/^(?:https?:|data:|blob:)/i.test(raw)) return raw;
  if (/^\/?models\//i.test(raw)) return raw.startsWith('/') ? raw : '/' + raw;
  if (raw.startsWith('/')) return raw;
  return '/models/' + (raw.endsWith('.glb') ? raw : raw + '.glb');
}

function resolveModelUrl(file) {
  const normalized = normalizeModelUrl(file);
  return context.resolveAssetUrl?.(normalized) || window._crateAssetUrl?.(normalized) || normalized;
}

export function setAssetBrowserContext(nextContext = {}) {
  context = { ...context, ...nextContext };
}

export function invalidateAssetCatalog() {}

function getThumbRenderer() {
  if (!thumbRenderer) {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 260;
    thumbRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    thumbRenderer.setSize(320, 260);
    thumbRenderer.setClearColor(0x0d0d0d, 1);
  }
  return thumbRenderer;
}

function renderThumb(file, container) {
  const loader = context.getGltfLoader?.();
  if (!loader) {
    container.textContent = '❌';
    return;
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 320 / 260, 0.1, 100);
  camera.position.set(0, 1.2, 3.5);
  camera.lookAt(0, 0.6, 0);
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));

  const light = new THREE.DirectionalLight(0xffffff, 1.2);
  light.position.set(2, 4, 3);
  scene.add(light);

  loader.load(resolveModelUrl(file), (gltf) => {
    const model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    model.scale.setScalar(2 / Math.max(Math.max(size.x, size.y, size.z), 0.001));

    const centeredBox = new THREE.Box3().setFromObject(model);
    const center = centeredBox.getCenter(new THREE.Vector3());
    model.position.sub(center);

    const groundedBox = new THREE.Box3().setFromObject(model);
    model.position.y -= groundedBox.min.y;
    model.rotation.y = Math.PI * 0.25;
    scene.add(model);

    const renderer = getThumbRenderer();
    renderer.render(scene, camera);

    const image = document.createElement('img');
    image.src = renderer.domElement.toDataURL('image/jpeg', 0.8);
    image.style.cssText = 'width:100%;height:130px;display:block;object-fit:cover;';
    container.replaceWith(image);

    scene.traverse((obj) => {
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
    container.title = 'Preview unavailable';
    container.style.fontSize = '11px';
    container.style.padding = '10px';
    container.textContent = '❌';
  });
}

export function showGallery(category, options = {}) {
  return new Promise(async (resolve) => {
    const catalog = await context.loadAssetCatalog?.();
    const items = catalog?.[category];
    if (!items || items.length === 0) {
      resolve(null);
      return;
    }

    const meta = CAT_META[category] || { icon: '📦', color: '#888', label: category };
    let searchTerm = '';
    let currentPage = 0;
    const pageSize = 30;

    const overlay = document.createElement('div');
    overlay.id = 'asset-gallery-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.94);z-index:2147483647;display:flex;flex-direction:column;font-family:monospace;color:#e0e0e0;';

    const header = document.createElement('div');
    header.style.cssText = 'padding:16px 24px;display:flex;align-items:center;gap:16px;border-bottom:1px solid #222;flex-shrink:0;';
    header.innerHTML = '<div style="font-size:24px;color:' + meta.color + ';">' + meta.icon + ' ' + meta.label + '</div><div id="gal-count" style="font-size:13px;color:#666;">' + items.length + ' models</div>';

    const searchInput = document.createElement('input');
    searchInput.placeholder = '🔍 Search...';
    searchInput.style.cssText = 'margin-left:auto;padding:8px 14px;background:#1a1a1a;border:1px solid #333;border-radius:8px;color:#e0e0e0;font-family:monospace;font-size:13px;width:220px;outline:none;';
    searchInput.oninput = () => {
      searchTerm = searchInput.value.toLowerCase();
      currentPage = 0;
      renderItems();
    };
    header.appendChild(searchInput);

    const closeBtn = document.createElement('div');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'font-size:24px;color:#666;cursor:pointer;margin-left:16px;';
    closeBtn.onclick = () => {
      overlay.remove();
      resolve(null);
    };
    header.appendChild(closeBtn);
    overlay.appendChild(header);

    const scrollArea = document.createElement('div');
    scrollArea.style.cssText = 'flex:1;overflow-y:auto;padding:20px;';

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,160px);gap:14px;justify-content:center;max-width:1100px;margin:0 auto;';
    scrollArea.appendChild(grid);

    const pager = document.createElement('div');
    pager.style.cssText = 'display:flex;justify-content:center;gap:10px;padding:16px;align-items:center;';
    scrollArea.appendChild(pager);

    overlay.appendChild(scrollArea);

    function getFilteredItems() {
      return searchTerm ? items.filter((item) => item.name.toLowerCase().includes(searchTerm)) : items;
    }

    function renderItems() {
      grid.innerHTML = '';
      const filtered = getFilteredItems();
      const totalPages = Math.ceil(filtered.length / pageSize);
      const pageItems = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

      const countEl = document.getElementById('gal-count');
      if (countEl) {
        countEl.textContent = (searchTerm ? filtered.length + ' of ' : '') + items.length + ' models';
      }

      pageItems.forEach((item) => {
        const card = document.createElement('div');
        card.className = 'asset-gallery-card';
        card.dataset.assetCard = 'true';
        card.dataset.assetFile = item.file || '';
        card.dataset.assetPath = item.path || '';
        card.dataset.assetName = item.name || '';
        card.style.cssText = 'background:#111;border:2px solid transparent;border-radius:10px;overflow:hidden;cursor:pointer;transition:all 0.2s;';
        card.onmouseenter = () => {
          card.style.borderColor = meta.color;
          card.style.transform = 'translateY(-3px)';
        };
        card.onmouseleave = () => {
          card.style.borderColor = 'transparent';
          card.style.transform = 'none';
        };

        const thumb = document.createElement('div');
        thumb.style.cssText = 'width:100%;height:130px;background:#0d0d0d;display:flex;align-items:center;justify-content:center;color:#444;font-size:32px;';
        thumb.textContent = meta.icon;
        card.appendChild(thumb);

        const observer = new IntersectionObserver((entries) => {
          if (entries[0].isIntersecting) {
            observer.disconnect();
            renderThumb(item.path || item.file, thumb);
          }
        }, { root: scrollArea, threshold: 0.1 });
        observer.observe(card);

        const nameEl = document.createElement('div');
        nameEl.style.cssText = 'min-height:38px;padding:7px 10px;font-size:11px;line-height:14px;color:#bbb;white-space:normal;overflow-wrap:anywhere;display:flex;align-items:center;';
        nameEl.textContent = item.name;
        nameEl.title = item.name;
        card.appendChild(nameEl);

        card.onclick = () => {
          overlay.remove();
          resolve({ file: item.file, name: item.name, category, path: item.path || null });
        };

        grid.appendChild(card);
      });

      pager.innerHTML = '';
      if (totalPages > 1) {
        const makeButton = (text, enabled, onClick) => {
          const button = document.createElement('button');
          button.textContent = text;
          button.style.cssText = 'padding:6px 14px;background:#1a1a1a;border:1px solid #333;border-radius:6px;color:#aaa;cursor:pointer;font-family:monospace;' + (!enabled ? 'opacity:0.3;' : '');
          if (enabled) button.onclick = onClick;
          return button;
        };
        pager.appendChild(makeButton('← Prev', currentPage > 0, () => {
          currentPage--;
          renderItems();
          scrollArea.scrollTop = 0;
        }));
        const info = document.createElement('span');
        info.style.cssText = 'color:#666;font-size:13px;';
        info.textContent = 'Page ' + (currentPage + 1) + ' of ' + totalPages;
        pager.appendChild(info);
        pager.appendChild(makeButton('Next →', currentPage < totalPages - 1, () => {
          currentPage++;
          renderItems();
          scrollArea.scrollTop = 0;
        }));
      }
    }

    renderItems();
    document.body.appendChild(overlay);
    searchInput.focus();

    const escHandler = (event) => {
      if (event.key === 'Escape') {
        document.removeEventListener('keydown', escHandler);
        overlay.remove();
        resolve(null);
      }
    };
    document.addEventListener('keydown', escHandler);
  });
}

export function showCategoryPicker() {
  return new Promise(async (resolve) => {
    context.showToast?.('📦 Opening asset library...');
    let catalog;
    try {
      catalog = await context.loadAssetCatalog?.();
    } catch {
      catalog = {};
    }

    const characterCount = await context.getCharacterCount?.();
    const categories = [...new Set(['characters', ...Object.keys(catalog || {})])];
    const totalModels = categories.reduce((sum, category) => {
      if (category === 'characters') return sum + (Number(characterCount) || 0);
      return sum + (catalog?.[category]?.length || 0);
    }, 0);
    const overlay = document.createElement('div');
    overlay.id = '_catPicker';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.96);z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:monospace;';

    const header = document.createElement('div');
    header.style.cssText = 'text-align:center;padding:24px 24px 16px;flex-shrink:0;width:100%;';
    header.innerHTML = '<div style="font-size:28px;color:#ffd700;margin-bottom:6px;">📦 ASSET LIBRARY</div><div style="font-size:13px;color:#555;margin-bottom:16px;">4,122 models across 26 categories</div><input id="_catSearch" placeholder="🔍  Search categories..." style="background:#111;border:1px solid #333;color:#fff;padding:8px 14px;border-radius:8px;font-size:13px;width:260px;outline:none;" />';
    overlay.appendChild(header);
    const summaryEl = header.querySelector('div:nth-child(2)');
    if (summaryEl) summaryEl.textContent = totalModels.toLocaleString() + ' models across ' + categories.length + ' categories';

    const scrollWrap = document.createElement('div');
    scrollWrap.style.cssText = 'flex:1;overflow-y:auto;width:100%;padding:0 24px 24px;box-sizing:border-box;';
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,180px);gap:16px;justify-content:center;max-width:960px;margin:0 auto;';

    categories.forEach((category) => {
      const meta = CAT_META[category] || { icon: '📦', color: '#888', label: category };
      const count = category === 'characters' ? characterCount : (catalog[category]?.length || 0);
      if (!count) return;

      const card = document.createElement('div');
      card.dataset.cat = (category + ' ' + meta.label).toLowerCase();
      card.dataset.assetCategory = category;
      card.style.cssText = 'padding:24px 16px;background:rgba(255,255,255,0.03);border:2px solid ' + meta.color + '30;border-radius:8px;cursor:pointer;text-align:center;transition:all 0.2s;';
      card.onmouseenter = () => {
        card.style.borderColor = meta.color;
        card.style.transform = 'scale(1.04)';
      };
      card.onmouseleave = () => {
        card.style.borderColor = meta.color + '30';
        card.style.transform = 'scale(1)';
      };
      card.innerHTML = '<div style="font-size:40px;margin-bottom:8px;">' + meta.icon + '</div><div style="font-size:15px;font-weight:bold;color:' + meta.color + ';margin-bottom:4px;">' + meta.label + '</div><div style="font-size:12px;color:#555;">' + count + ' models</div>';
      card.onclick = () => {
        overlay.remove();
        if (category === 'characters') {
          context.showCharacterGallery?.().then(resolve);
        } else {
          showGallery(category).then(resolve);
        }
      };
      grid.appendChild(card);
    });

    scrollWrap.appendChild(grid);
    overlay.appendChild(scrollWrap);

    setTimeout(() => {
      const searchInput = document.getElementById('_catSearch');
      if (searchInput) {
        searchInput.addEventListener('input', () => {
          const query = searchInput.value.toLowerCase();
          grid.querySelectorAll('[data-cat]').forEach((card) => {
            card.style.display = card.dataset.cat.includes(query) || !query ? '' : 'none';
          });
        });
      }
    }, 50);

    const closeBtn = document.createElement('div');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'position:fixed;top:15px;right:20px;font-size:28px;color:#fff;cursor:pointer;z-index:2147483647;background:rgba(0,0,0,0.5);border-radius:50%;width:40px;height:40px;display:flex;align-items:center;justify-content:center;';
    closeBtn.onclick = () => {
      overlay.remove();
      resolve(null);
    };
    overlay.appendChild(closeBtn);

    document.body.appendChild(overlay);
    const escHandler = (event) => {
      if (event.key === 'Escape') {
        document.removeEventListener('keydown', escHandler);
        overlay.remove();
        resolve(null);
      }
    };
    document.addEventListener('keydown', escHandler);
  });
}
