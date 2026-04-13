const CREDIT_STORAGE_KEY = 'crate-credits';
const DEFAULT_CREDITS = { plan: 'free', credits: 5, used: 0 };
const QUALITY_COSTS = { draft: 0.5, standard: 1, hd: 2 };

let context = {
  getMeshyApiKey: () => '',
  getMeshyApiBase: () => 'https://api.meshy.ai',
  showMeshyKeyModal: () => {},
  showToast: () => {},
  getCharacterController: () => null,
  getGltfLoader: () => null,
  getTHREE: () => globalThis.THREE,
  addObj: () => {},
  getModelDB: () => null,
  invalidateAssetCatalog: () => {},
};

function toast(message, duration) {
  context.showToast?.(message, duration);
}

function normalizeCredits(raw) {
  const plan = typeof raw?.plan === 'string' && raw.plan ? raw.plan : DEFAULT_CREDITS.plan;
  const credits = Number.isFinite(Number(raw?.credits)) ? Math.max(0, Number(raw.credits)) : DEFAULT_CREDITS.credits;
  const used = Number.isFinite(Number(raw?.used)) ? Math.max(0, Number(raw.used)) : DEFAULT_CREDITS.used;
  return { plan, credits, used };
}

function ensureCreditsState() {
  if (!window._userCredits) {
    try {
      window._userCredits = normalizeCredits(JSON.parse(localStorage.getItem(CREDIT_STORAGE_KEY) || 'null'));
    } catch {
      window._userCredits = { ...DEFAULT_CREDITS };
    }
  } else {
    window._userCredits = normalizeCredits(window._userCredits);
  }
  return window._userCredits;
}

function saveCredits() {
  localStorage.setItem(CREDIT_STORAGE_KEY, JSON.stringify(ensureCreditsState()));
}

function getCreditsRemaining() {
  const credits = ensureCreditsState();
  return Math.max(0, credits.credits - credits.used);
}

function useCredits(amount) {
  const credits = ensureCreditsState();
  credits.used = Math.min(credits.credits, credits.used + amount);
  window._userCredits = credits;
  saveCredits();
}

function setResultBlob(blob) {
  if (window._gen3dResultUrl) {
    URL.revokeObjectURL(window._gen3dResultUrl);
  }
  window._gen3dResultBlob = blob;
  window._gen3dResultUrl = blob ? URL.createObjectURL(blob) : null;
}

function ensureGeneratorState() {
  ensureCreditsState();
  if (typeof window._gen3dImage === 'undefined') window._gen3dImage = null;
  if (!window._gen3dQuality) window._gen3dQuality = 'standard';
  if (typeof window._gen3dResultBlob === 'undefined') window._gen3dResultBlob = null;
  if (typeof window._gen3dResultUrl === 'undefined') window._gen3dResultUrl = null;
}

function getQualityButtonMarkup(quality, title, subtitle) {
  const selected = window._gen3dQuality === quality;
  return `
    <button class="gen3d-quality${selected ? ' selected' : ''}" data-quality="${quality}" data-cost="${QUALITY_COSTS[quality]}" onclick="selectGen3dQuality(this)" style="flex:1;padding:8px;border:${selected ? '1px solid #6366f1' : '1px solid #333'};border-radius:8px;background:${selected ? '#1a1a3e' : '#0d0d1a'};color:${selected ? '#fff' : '#aaa'};cursor:pointer;font-size:12px;text-align:center">
      <div style="font-weight:600">${title}${selected ? ' ✓' : ''}</div>
      <div style="color:${selected ? '#888' : '#666'};font-size:11px">${subtitle}</div>
    </button>
  `;
}

export function showGeneratorModal() {
  ensureGeneratorState();
  const existing = document.getElementById('gen3d-modal');
  if (existing) existing.remove();

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
              <span style="color:#fbbf24">⚡</span> <strong id="gen3d-credits-count">${credits}</strong> credits left
            </div>
          </div>
        </div>

        <div style="padding:20px 28px">
          <div style="display:flex;gap:8px;margin-bottom:20px">
            <button id="gen3d-tab-img" onclick="document.getElementById('gen3d-img-section').style.display='block';document.getElementById('gen3d-txt-section').style.display='none';this.style.background='#6366f1';document.getElementById('gen3d-tab-txt').style.background='#2a2a4a'" style="flex:1;padding:10px;border:none;border-radius:8px;background:#6366f1;color:#fff;cursor:pointer;font-size:14px;font-weight:600">📷 Image to 3D</button>
            <button id="gen3d-tab-txt" onclick="document.getElementById('gen3d-txt-section').style.display='block';document.getElementById('gen3d-img-section').style.display='none';this.style.background='#6366f1';document.getElementById('gen3d-tab-img').style.background='#2a2a4a'" style="flex:1;padding:10px;border:none;border-radius:8px;background:#2a2a4a;color:#fff;cursor:pointer;font-size:14px;font-weight:600">✏️ Text to 3D</button>
          </div>

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
                <div style="color:#666;font-size:12px;margin-top:4px">PNG, JPG - any object, character, prop</div>
              </div>
            </div>
            <input type="file" id="gen3d-file-input" accept="image/*" style="display:none" onchange="handleGen3dFile(this.files[0])">
          </div>

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

          <div style="margin-top:16px;display:flex;gap:8px">
            ${getQualityButtonMarkup('draft', 'Draft', 'Preview only · ~30s')}
            ${getQualityButtonMarkup('standard', 'Standard', 'Full quality · ~60s')}
            ${getQualityButtonMarkup('hd', 'HD', 'HD + PBR · ~90s')}
          </div>

          <button id="gen3d-btn" onclick="startGeneration()" style="width:100%;margin-top:16px;padding:14px;border:none;border-radius:10px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-size:16px;font-weight:700;cursor:pointer;transition:transform 0.1s" onmousedown="this.style.transform='scale(0.98)'" onmouseup="this.style.transform='scale(1)'">
            🚀 Generate 3D Model
          </button>

          <div id="gen3d-progress" style="display:none;margin-top:16px;text-align:center">
            <div style="width:100%;height:4px;background:#2a2a4a;border-radius:2px;overflow:hidden">
              <div id="gen3d-progress-bar" style="width:0%;height:100%;background:linear-gradient(90deg,#6366f1,#8b5cf6);transition:width 0.3s;border-radius:2px"></div>
            </div>
            <div id="gen3d-status" style="color:#888;font-size:13px;margin-top:8px">Preparing...</div>
          </div>

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

        ${ensureCreditsState().plan === 'free' ? `
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

export function selectGen3dQuality(btn) {
  document.querySelectorAll('.gen3d-quality').forEach((candidate) => {
    candidate.style.border = '1px solid #333';
    candidate.style.background = '#0d0d1a';
    candidate.style.color = '#aaa';
    candidate.innerHTML = candidate.innerHTML.replace(' ✓', '');
  });
  btn.style.border = '1px solid #6366f1';
  btn.style.background = '#1a1a3e';
  btn.style.color = '#fff';
  btn.querySelector('div').textContent += ' ✓';
  window._gen3dQuality = btn.dataset.quality || 'standard';
}

export function handleGen3dFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    window._gen3dImage = event.target?.result || null;
    const preview = document.getElementById('gen3d-preview');
    if (preview && window._gen3dImage) {
      preview.innerHTML = `<img src="${window._gen3dImage}" style="max-width:200px;max-height:200px;border-radius:8px;object-fit:contain">`;
      preview.style.display = 'block';
    }
    const uploadText = document.getElementById('gen3d-upload-text');
    if (uploadText) {
      uploadText.innerHTML = `<div style="color:#4ade80;font-size:13px;margin-top:8px">✓ ${file.name} - click to change</div>`;
    }
  };
  reader.readAsDataURL(file);
}

export function handleGen3dDrop(event) {
  const file = event?.dataTransfer?.files?.[0];
  if (file) handleGen3dFile(file);
}

export async function startGeneration() {
  ensureGeneratorState();
  const isTextMode = document.getElementById('gen3d-txt-section')?.style.display !== 'none';
  const textPrompt = isTextMode ? (document.getElementById('gen3d-text-prompt')?.value || '').trim() : '';
  if (!isTextMode && !window._gen3dImage) {
    toast('Upload an image first!');
    return;
  }
  if (isTextMode && !textPrompt) {
    toast('Enter a description first!');
    return;
  }

  const cost = QUALITY_COSTS[window._gen3dQuality] || 1;
  if (getCreditsRemaining() < cost) {
    toast('Not enough credits! Upgrade your plan.');
    return;
  }

  const btn = document.getElementById('gen3d-btn');
  const progress = document.getElementById('gen3d-progress');
  const progressBar = document.getElementById('gen3d-progress-bar');
  const status = document.getElementById('gen3d-status');
  const result = document.getElementById('gen3d-result');
  const creditsCount = document.getElementById('gen3d-credits-count');

  if (!btn || !progress || !progressBar || !status || !result) return;

  btn.disabled = true;
  btn.textContent = '⏳ Generating...';
  btn.style.opacity = '0.6';
  progress.style.display = 'block';
  result.style.display = 'none';

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
    const apiKey = context.getMeshyApiKey?.() || '';
    if (!apiKey) {
      clearInterval(progressInterval);
      status.textContent = '🔑 Please set your Meshy API key first!';
      progressBar.style.width = '0%';
      btn.disabled = false;
      btn.textContent = '🚀 Generate 3D Model';
      btn.style.opacity = '1';
      context.showMeshyKeyModal?.();
      return;
    }

    const apiBase = context.getMeshyApiBase?.() || 'https://api.meshy.ai';
    const headers = { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' };

    let taskId;
    if (isTextMode) {
      status.textContent = '📝 Creating preview from your description...';
      const previewResp = await fetch(apiBase + '/openapi/v2/text-to-3d', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          mode: 'preview',
          prompt: textPrompt,
          negative_prompt: 'low quality, low resolution, ugly, blurry',
          should_remesh: true,
        }),
      });
      if (!previewResp.ok) {
        const error = await previewResp.json().catch(() => ({}));
        throw new Error(error.message || 'Meshy API error: ' + previewResp.status);
      }
      const previewData = await previewResp.json();
      taskId = previewData.result;

      let previewTask;
      let previewPollCount = 0;
      while (true) {
        if (++previewPollCount > 100) throw new Error('Generation timed out after 5 minutes');
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const pollResp = await fetch(apiBase + '/openapi/v2/text-to-3d/' + taskId, {
          headers: { Authorization: 'Bearer ' + apiKey },
        });
        previewTask = await pollResp.json();
        if (previewTask.status === 'SUCCEEDED') break;
        if (previewTask.status === 'FAILED') {
          throw new Error('Preview failed: ' + (previewTask.task_error?.message || 'unknown'));
        }
        pct = Math.min(10 + (previewTask.progress || 0) * 0.4, 50);
        progressBar.style.width = pct + '%';
        status.textContent = '🎨 Building preview... ' + (previewTask.progress || 0) + '%';
      }

      if (window._gen3dQuality !== 'draft') {
        status.textContent = '✨ Refining with textures...';
        const refineResp = await fetch(apiBase + '/openapi/v2/text-to-3d', {
          method: 'POST',
          headers,
          body: JSON.stringify({ mode: 'refine', preview_task_id: taskId }),
        });
        if (!refineResp.ok) {
          const error = await refineResp.json().catch(() => ({}));
          throw new Error(error.message || 'Refine error: ' + refineResp.status);
        }
        const refineData = await refineResp.json();
        taskId = refineData.result;

        let refinePollCount = 0;
        while (true) {
          if (++refinePollCount > 100) throw new Error('Refine timed out after 5 minutes');
          await new Promise((resolve) => setTimeout(resolve, 3000));
          const pollResp = await fetch(apiBase + '/openapi/v2/text-to-3d/' + taskId, {
            headers: { Authorization: 'Bearer ' + apiKey },
          });
          const refineTask = await pollResp.json();
          if (refineTask.status === 'SUCCEEDED') {
            previewTask = refineTask;
            break;
          }
          if (refineTask.status === 'FAILED') {
            throw new Error('Refine failed: ' + (refineTask.task_error?.message || 'unknown'));
          }
          pct = Math.min(50 + (refineTask.progress || 0) * 0.45, 95);
          progressBar.style.width = pct + '%';
          status.textContent = '✨ Refining... ' + (refineTask.progress || 0) + '%';
        }
      }

      const glbUrl = previewTask?.model_urls?.glb;
      if (!glbUrl) throw new Error('No GLB URL in response');
      const glbResp = await fetch(glbUrl);
      const glbBlob = await glbResp.blob();
      setResultBlob(glbBlob);
    } else {
      status.textContent = '🧠 Sending image to Meshy AI...';
      const imgResp = await fetch(apiBase + '/openapi/v1/image-to-3d', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          image_url: window._gen3dImage,
          enable_pbr: true,
          should_remesh: window._gen3dQuality !== 'draft',
          should_texture: true,
        }),
      });
      if (!imgResp.ok) {
        const error = await imgResp.json().catch(() => ({}));
        throw new Error(error.message || 'Meshy API error: ' + imgResp.status);
      }
      const imgData = await imgResp.json();
      taskId = imgData.result;

      let imgTask;
      let imagePollCount = 0;
      while (true) {
        if (++imagePollCount > 100) throw new Error('Image-to-3D timed out after 5 minutes');
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const pollResp = await fetch(apiBase + '/openapi/v1/image-to-3d/' + taskId, {
          headers: { Authorization: 'Bearer ' + apiKey },
        });
        imgTask = await pollResp.json();
        if (imgTask.status === 'SUCCEEDED') break;
        if (imgTask.status === 'FAILED') {
          throw new Error('Generation failed: ' + (imgTask.task_error?.message || 'unknown'));
        }
        pct = Math.min(5 + (imgTask.progress || 0) * 0.9, 95);
        progressBar.style.width = pct + '%';
        status.textContent = '🧠 Generating 3D model... ' + (imgTask.progress || 0) + '%';
      }

      const glbUrl = imgTask?.model_urls?.glb;
      if (!glbUrl) throw new Error('No GLB URL in response');
      const glbResp = await fetch(glbUrl);
      const glbBlob = await glbResp.blob();
      setResultBlob(glbBlob);
    }

    useCredits(cost);
    if (creditsCount) creditsCount.textContent = String(getCreditsRemaining());
    clearInterval(progressInterval);
    progressBar.style.width = '100%';
    const sizeMb = window._gen3dResultBlob ? (window._gen3dResultBlob.size / 1048576).toFixed(1) : '?';
    status.textContent = '✅ Done! ' + sizeMb + 'MB GLB model';
    result.style.display = 'block';
  } catch (err) {
    clearInterval(progressInterval);
    status.textContent = '❌ Error: ' + err.message;
    progressBar.style.width = '0%';
  }

  btn.disabled = false;
  btn.textContent = '🚀 Generate 3D Model';
  btn.style.opacity = '1';
}

export function gen3dAddToScene() {
  if (!window._gen3dResultUrl) return;
  const loader = context.getGltfLoader?.();
  const THREE = context.getTHREE?.();
  if (!loader || !THREE) {
    toast('3D loader is not ready yet.');
    return;
  }

  const name = 'generated_' + Date.now();
  loader.load(
    window._gen3dResultUrl,
    (gltf) => {
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      if (maxDim > 0.001) model.scale.setScalar(2.0 / maxDim);
      model.castShadow = true;
      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      model.userData.name = name;
      model.userData.isGLB = true;
      const controller = context.getCharacterController?.();
      const px = (controller?.position?.x || 0) + (Math.random() - 0.5) * 6;
      const pz = (controller?.position?.z || 0) + (Math.random() - 0.5) * 6;
      context.addObj?.(name, model, px, pz);
      toast('✓ 3D model added to scene!');
    },
    undefined,
    (err) => {
      console.error('[3D Generator] Failed to load generated GLB:', err);
      toast('❌ Failed to add generated model to scene');
    },
  );

  document.getElementById('gen3d-modal')?.remove();
}

export function gen3dDownload() {
  if (!window._gen3dResultBlob) return;
  const downloadUrl = URL.createObjectURL(window._gen3dResultBlob);
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = 'crate-engine-model-' + Date.now() + '.glb';
  link.click();
  setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
  toast('💾 GLB downloaded!');
}

export async function gen3dSellOnMarketplace() {
  if (!window._gen3dResultBlob) return;
  const modelDb = context.getModelDB?.();
  if (!modelDb?.save) {
    toast('Marketplace storage is not ready yet.');
    return;
  }

  const listingId = 'listing_' + Date.now();
  const listingName = prompt('Name your model:', 'AI Generated Model') || 'AI Generated Model';
  await modelDb.save(listingId, listingName, 'premium', window._gen3dResultBlob);
  context.invalidateAssetCatalog?.();

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
  toast('💰 Listed on marketplace! Model saved to your library too.');
  document.getElementById('gen3d-modal')?.remove();
}

export function gen3dSaveToLibrary() {
  if (!window._gen3dResultBlob) return;
  const modelDb = context.getModelDB?.();
  if (!modelDb?.save) {
    toast('Model library is not ready yet.');
    return;
  }

  const modelName = prompt('Name this model:', 'AI Model ' + new Date().toLocaleDateString()) || 'AI Model';
  const category = prompt('Category (characters, weapons, buildings, vehicles, furniture, nature, scifi, food):', 'food') || 'food';
  const normalizedCategory = category.toLowerCase();
  const modelId = 'user_' + Date.now();

  modelDb.save(modelId, modelName, normalizedCategory, window._gen3dResultBlob).then(() => {
    context.invalidateAssetCatalog?.();
    toast('📚 Saved to library! Find it in "' + category + '" category.');
  });

  const reader = new FileReader();
  reader.onload = () => {
    const saved = JSON.parse(localStorage.getItem('crate-user-models') || '[]');
    saved.push({
      id: modelId,
      name: modelName,
      category: normalizedCategory,
      data_b64: String(reader.result || '').split(',')[1],
      created: new Date().toISOString(),
    });
    localStorage.setItem('crate-user-models', JSON.stringify(saved));
  };
  reader.readAsDataURL(window._gen3dResultBlob);

  document.getElementById('gen3d-modal')?.remove();
}

export function showPricingModal() {
  const existing = document.getElementById('pricing-modal');
  if (existing) existing.remove();
  const modal = document.createElement('div');
  modal.id = 'pricing-modal';
  modal.innerHTML = `
    <div style="position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:100001;display:flex;align-items:center;justify-content:center;font-family:-apple-system,sans-serif" onclick="if(event.target===this)this.remove()">
      <div style="background:#1a1a2e;border-radius:16px;width:720px;padding:32px;color:#fff">
        <h2 style="text-align:center;margin:0 0 8px">⚡ Crate Engine Plans</h2>
        <p style="text-align:center;color:#888;margin:0 0 24px;font-size:14px">Generate 3D models. Sell on marketplace. Build games.</p>
        <div style="display:flex;gap:16px">
          ${[
            { name: 'Starter', price: '4.99', credits: '100', models: '100 standard / 50 HD', color: '#3b82f6' },
            { name: 'Pro', price: '14.99', credits: '500', models: '500 standard / 250 HD', color: '#8b5cf6', pop: true },
            { name: 'Studio', price: '39.99', credits: '2,000', models: '2,000 standard / 1,000 HD', color: '#f59e0b' },
          ].map((plan) => `
            <div style="flex:1;background:${plan.pop ? '#1a1a4e' : '#0d0d1a'};border:${plan.pop ? '2px solid #8b5cf6' : '1px solid #333'};border-radius:12px;padding:20px;text-align:center;position:relative">
              ${plan.pop ? '<div style="position:absolute;top:-10px;left:50%;transform:translateX(-50%);background:#8b5cf6;padding:2px 12px;border-radius:10px;font-size:11px;font-weight:600">POPULAR</div>' : ''}
              <div style="font-size:18px;font-weight:700;color:${plan.color}">${plan.name}</div>
              <div style="font-size:32px;font-weight:800;margin:8px 0">$${plan.price}<span style="font-size:14px;color:#888">/mo</span></div>
              <div style="color:#aaa;font-size:13px;margin-bottom:12px">${plan.credits} credits/month</div>
              <div style="color:#888;font-size:12px;margin-bottom:16px">${plan.models}</div>
              <ul style="text-align:left;list-style:none;padding:0;margin:0 0 16px;font-size:12px;color:#aaa">
                <li style="margin:4px 0">✅ Image to 3D</li>
                <li style="margin:4px 0">✅ GLB/OBJ export</li>
                <li style="margin:4px 0">✅ Add to scene</li>
                <li style="margin:4px 0">✅ Sell on marketplace</li>
                ${plan.name !== 'Starter' ? '<li style="margin:4px 0">✅ HD quality</li>' : ''}
                ${plan.name === 'Studio' ? '<li style="margin:4px 0">✅ API access</li><li style="margin:4px 0">✅ Priority queue</li>' : ''}
              </ul>
              <button onclick="selectPlan('${plan.name.toLowerCase()}', ${plan.credits.replace(',', '')}, ${plan.price})" style="width:100%;padding:10px;border:none;border-radius:8px;background:${plan.color};color:#fff;font-weight:600;cursor:pointer">Choose ${plan.name}</button>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

export function selectPlan(plan, credits) {
  window._userCredits = normalizeCredits({ plan, credits, used: 0 });
  saveCredits();
  toast('✅ Plan activated! ' + credits + ' credits loaded.');
  document.getElementById('pricing-modal')?.remove();
  if (document.getElementById('gen3d-modal')) {
    document.getElementById('gen3d-modal').remove();
    showGeneratorModal();
  }
}

function registerWindowBindings() {
  ensureGeneratorState();
  window.selectGen3dQuality = selectGen3dQuality;
  window.handleGen3dFile = handleGen3dFile;
  window.handleGen3dDrop = handleGen3dDrop;
  window.startGeneration = startGeneration;
  window.gen3dAddToScene = gen3dAddToScene;
  window.gen3dDownload = gen3dDownload;
  window.gen3dSellOnMarketplace = gen3dSellOnMarketplace;
  window.gen3dSaveToLibrary = gen3dSaveToLibrary;
  window.showPricingModal = showPricingModal;
  window.selectPlan = selectPlan;
}

export function setGeneratorUiContext(nextContext = {}) {
  context = { ...context, ...nextContext };
  registerWindowBindings();
}

registerWindowBindings();
