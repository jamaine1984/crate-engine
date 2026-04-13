// Crate Engine Auth & API Client
const API = 'https://api.crateshipgames.com';
const AUTH_TOKEN_KEY = 'crate_token';
const AUTH_USER_KEY = 'crate_user';

function readSessionValue(key, migrateLegacy = false) {
  const sessionValue = sessionStorage.getItem(key);
  if (sessionValue !== null) return sessionValue;
  if (!migrateLegacy) return null;
  const legacyValue = localStorage.getItem(key);
  if (legacyValue !== null) {
    sessionStorage.setItem(key, legacyValue);
    localStorage.removeItem(key);
    return legacyValue;
  }
  return null;
}

function readSessionJSON(key, migrateLegacy = false) {
  const value = readSessionValue(key, migrateLegacy);
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function writeSessionValue(key, value) {
  if (value === null || value === undefined || value === '') {
    sessionStorage.removeItem(key);
  } else {
    sessionStorage.setItem(key, value);
  }
  localStorage.removeItem(key);
}

class CrateAuth {
  constructor() {
    this.token = readSessionValue(AUTH_TOKEN_KEY, true);
    this.user = readSessionJSON(AUTH_USER_KEY, true);
  }

  get isLoggedIn() { return !!this.token && !!this.user; }
  get plan() { return this.user?.plan || 'free'; }
  get isPro() { return this.plan === 'pro' || this.plan === 'premium'; }
  get isPremium() { return this.plan === 'premium'; }

  async _fetch(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    if (this.token) headers['Authorization'] = 'Bearer ' + this.token;
    const res = await fetch(API + path, { ...opts, headers });
    return res.json();
  }

  async register(email, password, name) {
    const data = await this._fetch('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, password, name }) });
    if (data.token) { this._save(data.token, data.user); }
    return data;
  }

  async login(email, password) {
    const data = await this._fetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    if (data.token) { this._save(data.token, data.user); }
    return data;
  }

  logout() {
    this.token = null; this.user = null;
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
    sessionStorage.removeItem(AUTH_USER_KEY);
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
  }

  async refreshUser() {
    if (!this.token) return null;
    const data = await this._fetch('/api/auth/me');
    if (data.user) {
      this.user = data.user;
      writeSessionValue(AUTH_USER_KEY, JSON.stringify(data.user));
    }
    return data.user;
  }

  _save(token, user) {
    this.token = token; this.user = user;
    writeSessionValue(AUTH_TOKEN_KEY, token);
    writeSessionValue(AUTH_USER_KEY, JSON.stringify(user));
  }

  // === PUBLISH ===
  async publishGame(gameData) {
    return this._fetch('/api/games/publish', { method: 'POST', body: JSON.stringify(gameData) });
  }

  async getGame(slug) {
    return this._fetch('/api/games/' + slug);
  }

  async listGames() {
    return this._fetch('/api/games/');
  }

  // === MARKETPLACE ===
  async uploadModel(modelData) {
    return this._fetch('/api/marketplace/upload', { method: 'POST', body: JSON.stringify(modelData) });
  }

  async browseMarketplace(category, search) {
    let q = '/api/marketplace?';
    if (category) q += 'category=' + encodeURIComponent(category) + '&';
    if (search) q += 'search=' + encodeURIComponent(search);
    return this._fetch(q);
  }

  async purchaseModel(modelId) {
    return this._fetch('/api/marketplace/purchase', { method: 'POST', body: JSON.stringify({ modelId }) });
  }

  async getLibrary() {
    return this._fetch('/api/library');
  }

  async downloadModel(modelId) {
    return this._fetch('/api/library/download', { method: 'POST', body: JSON.stringify({ modelId }) });
  }

  // === SUBSCRIPTIONS ===
  async subscribe(plan) {
    return this._fetch('/api/subscribe', { method: 'POST', body: JSON.stringify({ plan }) });
  }

  // === AUTH UI ===
  showAuthModal(onSuccess) {
    const old = document.getElementById('auth-modal');
    if (old) old.remove();

    const modal = document.createElement('div');
    modal.id = 'auth-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:10010;display:flex;align-items:center;justify-content:center;font-family:Inter,system-ui,sans-serif;';

    let isLogin = true;
    const render = () => {
      modal.innerHTML = `
        <div style="background:#111;border:1px solid #252525;border-radius:16px;padding:32px;max-width:400px;width:90%;text-align:center">
          <div style="font-size:1.5rem;margin-bottom:4px">${isLogin ? '👋 Welcome Back' : '🚀 Create Account'}</div>
          <p style="color:#888;font-size:0.8rem;margin-bottom:20px">${isLogin ? 'Log in to your Crate Engine account' : 'Join thousands of creators'}<br><span style="font-size:0.72rem;color:#666">Session login only on this browser for safer local use.</span></p>
          ${!isLogin ? '<input id="auth-name" placeholder="Your name" style="width:100%;padding:12px;background:#0a0a0f;border:1px solid #333;border-radius:8px;color:#fff;font-family:inherit;font-size:0.85rem;margin-bottom:10px;outline:none">' : ''}
          <input id="auth-email" type="email" placeholder="Email" style="width:100%;padding:12px;background:#0a0a0f;border:1px solid #333;border-radius:8px;color:#fff;font-family:inherit;font-size:0.85rem;margin-bottom:10px;outline:none">
          <input id="auth-pass" type="password" placeholder="Password" style="width:100%;padding:12px;background:#0a0a0f;border:1px solid #333;border-radius:8px;color:#fff;font-family:inherit;font-size:0.85rem;margin-bottom:16px;outline:none">
          <div id="auth-error" style="color:#ef4444;font-size:0.8rem;margin-bottom:10px;display:none"></div>
          <button id="auth-submit" style="width:100%;padding:14px;background:linear-gradient(135deg,#ff6b35,#f59e0b);color:#000;border:none;border-radius:10px;font-weight:700;font-size:0.95rem;cursor:pointer;font-family:inherit">${isLogin ? 'Log In' : 'Create Account'}</button>
          <div style="margin-top:14px;font-size:0.8rem;color:#888">
            ${isLogin ? "Don't have an account?" : 'Already have an account?'}
            <span id="auth-toggle" style="color:#ff6b35;cursor:pointer;font-weight:600">${isLogin ? 'Sign Up' : 'Log In'}</span>
          </div>
          <div id="auth-close" style="position:absolute;top:15px;right:20px;font-size:24px;color:#666;cursor:pointer">✕</div>
        </div>`;

      modal.querySelector('#auth-toggle').onclick = () => { isLogin = !isLogin; render(); };
      modal.querySelector('#auth-close').onclick = () => modal.remove();
      modal.onclick = e => { if (e.target === modal) modal.remove(); };

      modal.querySelector('#auth-submit').onclick = async () => {
        const email = modal.querySelector('#auth-email').value.trim();
        const pass = modal.querySelector('#auth-pass').value;
        const name = modal.querySelector('#auth-name')?.value.trim();
        const errEl = modal.querySelector('#auth-error');
        const btn = modal.querySelector('#auth-submit');

        if (!email || !pass) { errEl.textContent = 'Email and password required'; errEl.style.display = 'block'; return; }
        btn.textContent = '⏳...'; btn.style.opacity = '0.6';

        const data = isLogin ? await this.login(email, pass) : await this.register(email, pass, name);
        if (data.error) {
          errEl.textContent = data.error; errEl.style.display = 'block';
          btn.textContent = isLogin ? 'Log In' : 'Create Account'; btn.style.opacity = '1';
        } else {
          modal.remove();
          if (onSuccess) onSuccess(data.user);
        }
      };
    };
    render();
    document.body.appendChild(modal);
  }

  // Account badge for nav
  renderAccountBadge(container) {
    if (!container) return;
    if (this.isLoggedIn) {
      const planColors = { free: '#888', pro: '#ff6b35', premium: '#f59e0b' };
      container.innerHTML = `<span style="color:${planColors[this.plan]||'#888'};font-weight:700;font-size:0.8rem;cursor:pointer" id="account-badge">👤 ${this.user.name} <span style="font-size:0.65rem;padding:2px 6px;background:${planColors[this.plan]}22;border-radius:4px">${this.plan.toUpperCase()}</span></span>`;
      container.querySelector('#account-badge').onclick = () => this._showAccountMenu();
    } else {
      container.innerHTML = '<button id="login-btn" style="padding:6px 16px;background:#ff6b35;color:#fff;border:none;border-radius:8px;font-weight:600;font-size:0.8rem;cursor:pointer;font-family:inherit">Log In</button>';
      container.querySelector('#login-btn').onclick = () => this.showAuthModal(() => this.renderAccountBadge(container));
    }
  }

  _showAccountMenu() {
    const old = document.getElementById('account-menu');
    if (old) { old.remove(); return; }
    const menu = document.createElement('div');
    menu.id = 'account-menu';
    menu.style.cssText = 'position:fixed;top:50px;right:20px;background:#111;border:1px solid #252525;border-radius:12px;padding:16px;z-index:10010;min-width:220px;font-family:Inter,system-ui,sans-serif;';
    const planColors = { free: '#888', pro: '#ff6b35', premium: '#f59e0b' };
    menu.innerHTML = `
      <div style="font-weight:700;margin-bottom:4px">${this.user.name}</div>
      <div style="font-size:0.75rem;color:#888;margin-bottom:12px">${this.user.email}</div>
      <div style="font-size:0.8rem;color:${planColors[this.plan]};font-weight:600;margin-bottom:12px;padding:6px 10px;background:${planColors[this.plan]}11;border-radius:6px">${this.plan === 'free' ? '🆓 Free Plan' : this.plan === 'pro' ? '⚡ Pro Plan — $4.99/mo' : '💎 Premium Plan — $14.99/mo'}</div>
      ${this.user.earnings ? '<div style="font-size:0.8rem;color:#4ade80;margin-bottom:12px">💰 Creator earnings: $' + (this.user.earnings || 0).toFixed(2) + '</div>' : ''}
      <div style="font-size:0.8rem;color:#888;margin-bottom:8px">📚 Library: ${(this.user.library || []).length} models</div>
      ${this.plan === 'free' ? '<button onclick="window._crateAuth.subscribe(\'pro\').then(d=>{if(d.checkoutUrl)window.location=d.checkoutUrl})" style="width:100%;padding:10px;background:#ff6b35;color:#000;border:none;border-radius:8px;font-weight:700;cursor:pointer;margin-bottom:6px;font-family:inherit">⚡ Upgrade to Pro — $4.99/mo</button>' : ''}
      ${this.plan !== 'premium' ? '<button onclick="window._crateAuth.subscribe(\'premium\').then(d=>{if(d.checkoutUrl)window.location=d.checkoutUrl})" style="width:100%;padding:10px;background:#f59e0b;color:#000;border:none;border-radius:8px;font-weight:700;cursor:pointer;margin-bottom:6px;font-family:inherit">💎 Upgrade to Premium — $14.99/mo</button>' : ''}
      <button onclick="window._crateAuth.logout();location.reload()" style="width:100%;padding:8px;background:#222;color:#888;border:1px solid #333;border-radius:8px;cursor:pointer;font-family:inherit;margin-top:4px">Log Out</button>`;
    document.body.appendChild(menu);
    setTimeout(() => document.addEventListener('click', function h(e) { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', h); } }, { once: false }), 100);
  }
}

const auth = new CrateAuth();
window._crateAuth = auth;
export default auth;
