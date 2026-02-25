'use client';
import { useState, useEffect } from 'react';
import { Sparkles, Image, ThumbsUp, ThumbsDown, Send, RotateCcw, Zap, Copy, Download } from 'lucide-react';
import { getConfig, generateImage } from '@/lib/store';

const csThemes = [
  { id: 'cs-launch-fast', name: '🚀 Launch Your App Fast' },
  { id: 'cs-affordable', name: '💰 Affordable App Development' },
  { id: 'cs-no-code', name: '🔧 No Code Needed' },
  { id: 'cs-white-label', name: '🏷️ White-Label Explained' },
  { id: 'cs-industries', name: '🏢 57 Industries Covered' },
  { id: 'cs-live-demos', name: '🎮 Try Before You Buy' },
  { id: 'cs-roi', name: '📈 App Business ROI' },
  { id: 'cs-testimonial', name: '⭐ Success Stories' },
];

function getCsContentLog() {
  if (typeof window === 'undefined') return [];
  const raw = localStorage.getItem('cs-content');
  return raw ? JSON.parse(raw) : [];
}
function saveCsContentLog(log) { localStorage.setItem('cs-content', JSON.stringify(log)); }
function addCsContent(entry) { const log = getCsContentLog(); log.unshift(entry); saveCsContentLog(log); return log; }
function updateCsContent(id, updates) { const log = getCsContentLog(); const i = log.findIndex(c=>c.id===id); if(i>=0) log[i]={...log[i],...updates}; saveCsContentLog(log); return log; }
function getCsImageLibrary() { if (typeof window === 'undefined') return []; const raw = localStorage.getItem('cs-images'); return raw ? JSON.parse(raw) : []; }
function addCsImage(entry) { const lib = getCsImageLibrary(); lib.unshift(entry); localStorage.setItem('cs-images', JSON.stringify(lib)); return lib; }

async function generateCsScript(apiKey, theme, platform) {
  const HOOKS = {
    'cs-launch-fast': ["Launch your own app in 15 days 🚀", "From idea to App Store in 2 weeks", "Your branded app, live in 15 days"],
    'cs-affordable': ["A full custom app for $1,000?? 💰", "Stop paying $50K for app development", "Why developers hate this $1K app service"],
    'cs-no-code': ["You don't need to code to own an app", "Zero coding. Full app. Your brand.", "They said you need $100K and a dev team 😂"],
    'cs-white-label': ["White-label apps explained in 15 seconds", "What if you could buy a proven app template?", "Same app that works. YOUR brand on it."],
    'cs-industries': ["57 app templates. Pick one. Launch it.", "Dating apps, fitness apps, church apps — all ready", "Whatever your business, there's an app for that"],
    'cs-live-demos': ["Try the full app before you pay a dime", "Live demos you can actually tap and swipe", "Would you buy an app you can't test first?"],
    'cs-roi': ["$1K app investment → $10K/month revenue", "The math on white-label apps is insane 📈", "100 users × $9.99/month = your app pays for itself"],
    'cs-testimonial': ["Launched my dating app in 2 weeks", "From zero to 500 users with a $1K app", "Best investment I ever made for my business"],
  };
  const hooks = HOOKS[theme] || HOOKS['cs-launch-fast'];
  const hook = hooks[Math.floor(Math.random()*hooks.length)];

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'anthropic/claude-opus-4.6',
      messages: [{ role: 'user', content: `You are a viral content creator for "CrateShip Studios" — a premium white-label app business (www.crateshipstudios.com).

Create a 15-second ${platform === 'youtube' ? 'YouTube Short' : 'TikTok'} script. Narrator voice-over with visuals (phone mockups, app screenshots, text overlays, business graphics — can include real-looking people using phones).

THEME: ${theme}
HOOK: "${hook}"

BUSINESS KEY POINTS:
- 57 production-ready white-label Flutter app templates
- Starting at $1,000 one-time payment
- Delivery in 15-60 days
- Industries: dating, healthcare, fitness, restaurant, real estate, church, salon, legal, dental, construction, cleaning, pet care, education + 40 more
- 4 live interactive demos on the website
- Your brand, your app, your customers
- Firebase backend included or $500 setup
- No coding required from the buyer
- Stripe secure payments

Return ONLY valid JSON:
{
  "hook": "narrator 2 sec",
  "body": "narrator 8-10 sec",
  "cta": "narrator 3 sec",
  "onScreenText": ["overlay1", "overlay2", "overlay3", "overlay4"],
  "imagePrompt": "Photorealistic image for the video — can include diverse entrepreneurs/business owners using phones, modern office/startup aesthetic, premium feel",
  "hashtags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "caption": "post caption with emojis"
}` }],
      temperature: 0.9,
    }),
  });
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  const m = content.match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]) : { hook, body: content, cta: 'Visit crateshipstudios.com', hashtags: ['whitelabel','apps'], caption: hook };
}

export default function CrateShipMarketing() {
  const [generating, setGenerating] = useState(false);
  const [contentLog, setContentLog] = useState([]);
  const [error, setError] = useState('');
  const [selectedTheme, setSelectedTheme] = useState('cs-launch-fast');
  const [selectedPlatform, setSelectedPlatform] = useState('tiktok');
  const [filter, setFilter] = useState('all');
  const [generatingImageFor, setGeneratingImageFor] = useState(null);
  const [copied, setCopied] = useState(null);
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [batchProgress, setBatchProgress] = useState('');

  useEffect(() => { setContentLog(getCsContentLog()); }, []);
  const config = typeof window !== 'undefined' ? getConfig() : {};
  const hasKey = !!config.openRouterKey;

  const handleGenerate = async () => {
    if (!hasKey) { setError('Add OpenRouter key in Settings'); return; }
    setGenerating(true); setError('');
    try {
      const script = await generateCsScript(config.openRouterKey, selectedTheme, selectedPlatform);
      const entry = { id: `cs-${selectedPlatform}-${Date.now()}`, platform: selectedPlatform, theme: selectedTheme, script, status: 'pending', imageStatus: 'none', createdAt: new Date().toISOString() };
      let updated = addCsContent(entry);
      // Auto-generate image
      const imgResult = await generateImage(config.openRouterKey, script.imagePrompt || 'Entrepreneur looking at phone with app, modern aesthetic');
      if (imgResult.success) {
        addCsImage({ id: `csimg-${Date.now()}`, dataUrl: imgResult.dataUrl, prompt: script.imagePrompt, contentId: entry.id, theme: selectedTheme, createdAt: new Date().toISOString() });
        updated = updateCsContent(entry.id, { imageStatus: 'generated', imageDataUrl: imgResult.dataUrl });
      }
      setContentLog(updated);
    } catch (e) { setError(e.message); }
    setGenerating(false);
  };

  const handleApprove = (id) => setContentLog(updateCsContent(id, { status: 'approved' }));
  const handleReject = (id) => setContentLog(updateCsContent(id, { status: 'rejected' }));
  const handlePost = (id) => setContentLog(updateCsContent(id, { status: 'posted', postedAt: new Date().toISOString() }));
  const handleCopy = (text, id) => { navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(null), 2000); };
  const downloadImage = (url, name) => { const a = document.createElement('a'); a.href = url; a.download = `${name}.png`; a.click(); };

  const handleBatch = async () => {
    if (!hasKey) return;
    setBatchGenerating(true);
    const schedule = [
      { platform: 'youtube', theme: csThemes[Math.floor(Math.random()*csThemes.length)].id },
      { platform: 'youtube', theme: csThemes[Math.floor(Math.random()*csThemes.length)].id },
      { platform: 'tiktok', theme: csThemes[Math.floor(Math.random()*csThemes.length)].id },
      { platform: 'tiktok', theme: csThemes[Math.floor(Math.random()*csThemes.length)].id },
      { platform: 'tiktok', theme: csThemes[Math.floor(Math.random()*csThemes.length)].id },
    ];
    for (let i = 0; i < schedule.length; i++) {
      setBatchProgress(`${i+1}/5 generating...`);
      try {
        const s = schedule[i];
        const script = await generateCsScript(config.openRouterKey, s.theme, s.platform);
        const entry = { id: `cs-${s.platform}-${Date.now()}`, platform: s.platform, theme: s.theme, script, status: 'pending', imageStatus: 'none', createdAt: new Date().toISOString() };
        addCsContent(entry);
        const imgResult = await generateImage(config.openRouterKey, script.imagePrompt || 'Tech entrepreneur, modern office, phone mockup');
        if (imgResult.success) {
          addCsImage({ id: `csimg-${Date.now()}`, dataUrl: imgResult.dataUrl, prompt: script.imagePrompt, contentId: entry.id, createdAt: new Date().toISOString() });
          updateCsContent(entry.id, { imageStatus: 'generated', imageDataUrl: imgResult.dataUrl });
        }
      } catch (e) { console.error(e); }
    }
    setContentLog(getCsContentLog());
    setBatchGenerating(false); setBatchProgress('');
  };

  const filtered = contentLog.filter(c => filter === 'all' || c.status === filter);
  const statusConfig = { pending: { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b', label: '⏳ Pending' }, approved: { bg: 'rgba(16,185,129,0.15)', color: '#10b981', label: '✅ Approved' }, rejected: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', label: '❌ Rejected' }, posted: { bg: 'rgba(124,58,237,0.15)', color: '#a78bfa', label: '🚀 Posted' } };

  return (
    <>
      <div className="section-grid equal" style={{ marginBottom: 24 }}>
        <div className="card">
          <div className="card-header"><h3>⚡ Generate CrateShip Content</h3></div>
          <div className="card-body">
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>Theme</label>
              <select value={selectedTheme} onChange={e => setSelectedTheme(e.target.value)} style={{ width: '100%', padding: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13 }}>
                {csThemes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>Platform</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {['youtube', 'tiktok'].map(p => (
                  <button key={p} onClick={() => setSelectedPlatform(p)} style={{ flex: 1, padding: 10, borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13, border: selectedPlatform === p ? 'none' : '1px solid var(--border)', background: selectedPlatform === p ? (p === 'youtube' ? 'rgba(239,68,68,0.2)' : 'rgba(37,244,238,0.1)') : 'var(--bg-secondary)', color: selectedPlatform === p ? (p === 'youtube' ? '#ef4444' : '#25f4ee') : 'var(--text-muted)' }}>
                    {p === 'youtube' ? '▶ YouTube Short' : '♪ TikTok'}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={handleGenerate} disabled={generating} className="topbar-btn primary" style={{ width: '100%', justifyContent: 'center', padding: 12, fontSize: 14 }}>
              {generating ? '⏳ Generating Script + Image...' : <><Sparkles size={16} /> Generate Content</>}
            </button>
            <button onClick={handleBatch} disabled={batchGenerating} style={{ width: '100%', padding: 10, marginTop: 8, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'var(--gradient-gold)', border: 'none', color: 'white' }}>
              {batchGenerating ? batchProgress : <><Zap size={14} /> Batch: 2 YT + 3 TT with Images</>}
            </button>
            {error && <p style={{ color: 'var(--accent-red)', fontSize: 12, marginTop: 8 }}>{error}</p>}
          </div>
        </div>
        <div className="card">
          <div className="card-header"><h3>📊 CrateShip Stats</h3></div>
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { label: 'Pending', count: contentLog.filter(c=>c.status==='pending').length, color: '#f59e0b' },
                { label: 'Approved', count: contentLog.filter(c=>c.status==='approved').length, color: '#10b981' },
                { label: 'Posted', count: contentLog.filter(c=>c.status==='posted').length, color: '#a78bfa' },
                { label: 'Total', count: contentLog.length, color: '#f59e0b' },
              ].map(s => (
                <div key={s.label} style={{ padding: 12, background: 'var(--bg-secondary)', borderRadius: 8, textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.count}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Filters + Content */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {['all','pending','approved','posted'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: filter===f ? '#f59e0b' : 'var(--bg-card)', border: '1px solid var(--border)', color: filter===f ? 'white' : 'var(--text-secondary)' }}>
            {f.charAt(0).toUpperCase()+f.slice(1)} ({contentLog.filter(c=>f==='all'||c.status===f).length})
          </button>
        ))}
      </div>

      <div className="card">
        <div className="card-header"><h3>📋 CrateShip Content ({filtered.length})</h3></div>
        <div className="card-body">
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>No content yet. Generate above!</div>
          ) : filtered.map(item => {
            const st = statusConfig[item.status] || statusConfig.pending;
            return (
              <div key={item.id} style={{ padding: 16, marginBottom: 16, background: 'var(--bg-secondary)', borderRadius: 12, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <span style={{ padding: '3px 10px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: item.platform === 'youtube' ? 'rgba(239,68,68,0.2)' : 'rgba(37,244,238,0.1)', color: item.platform === 'youtube' ? '#ef4444' : '#25f4ee' }}>{item.platform === 'youtube' ? '▶ YT' : '♪ TT'}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 11, padding: '3px 12px', borderRadius: 6, fontWeight: 600, background: st.bg, color: st.color }}>{st.label}</span>
                </div>
                <div style={{ display: 'flex', gap: 16, marginBottom: 14 }}>
                  {item.imageDataUrl && <img src={item.imageDataUrl} alt="" style={{ width: 140, aspectRatio: '9/16', objectFit: 'cover', borderRadius: 10, border: '1px solid var(--border)', flexShrink: 0 }} />}
                  <div style={{ flex: 1, fontSize: 12 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>🎤 {item.script?.hook}</div>
                    <div style={{ color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 6 }}>{item.script?.body}</div>
                    <div style={{ fontWeight: 600, color: 'var(--accent-green)' }}>📢 {item.script?.cta}</div>
                    {item.script?.caption && <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>✏️ {item.script.caption}</div>}
                    {item.script?.hashtags && <div style={{ marginTop: 4, color: 'var(--accent-purple-light)', fontSize: 11 }}>{item.script.hashtags.map(h=>'#'+h).join(' ')}</div>}
                    <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                      <button onClick={() => handleCopy(item.script?.caption+'\n'+(item.script?.hashtags||[]).map(h=>'#'+h).join(' '), item.id)} style={{ padding: '3px 8px', borderRadius: 4, fontSize: 10, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)', cursor: 'pointer' }}>{copied===item.id ? '✅' : '📋 Copy'}</button>
                      {item.imageDataUrl && <button onClick={() => downloadImage(item.imageDataUrl, `cs-${item.id}`)} style={{ padding: '3px 8px', borderRadius: 4, fontSize: 10, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)', cursor: 'pointer' }}>💾 Image</button>}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                  {item.status === 'pending' && <>
                    <button onClick={() => handleApprove(item.id)} style={{ padding: '8px 18px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)', color: '#10b981' }}>✅ Approve</button>
                    <button onClick={() => handleReject(item.id)} style={{ padding: '8px 18px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}>❌ Reject</button>
                  </>}
                  {item.status === 'approved' && <button onClick={() => handlePost(item.id)} style={{ padding: '8px 24px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', background: 'var(--gradient-gold)', border: 'none', color: 'white' }}><Send size={14} /> Post to {item.platform === 'youtube' ? 'YouTube' : 'TikTok'}</button>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
