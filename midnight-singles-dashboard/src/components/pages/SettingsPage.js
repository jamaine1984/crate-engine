'use client';
import { useState, useEffect } from 'react';
import { Save, Eye, EyeOff, Check } from 'lucide-react';
import { getConfig, saveConfig } from '@/lib/store';

export default function SettingsPage() {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [videoGen, setVideoGen] = useState('ffmpeg_fallback');

  useEffect(() => {
    const c = getConfig();
    if (c.openRouterKey) setApiKey(c.openRouterKey);
    if (c.videoGenerator) setVideoGen(c.videoGenerator);
  }, []);

  const handleSave = () => {
    saveConfig({ openRouterKey: apiKey, videoGenerator: videoGen });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const videoOptions = [
    { id: 'seeddance2', name: 'SeedDance 2.0', cost: 'TBD', status: '🔍 Researching' },
    { id: 'kling', name: 'Kling AI 1.6', cost: '~$0.20/vid', status: '✅ Available' },
    { id: 'minimax', name: 'MiniMax Video-01', cost: '~$0.10/vid', status: '✅ Available' },
    { id: 'pika', name: 'Pika 2.0', cost: '~$0.15/vid', status: '✅ Available' },
    { id: 'runway', name: 'Runway Gen-3', cost: '~$0.75/vid', status: '✅ Expensive' },
    { id: 'ffmpeg_fallback', name: 'Image Slideshow (ffmpeg)', cost: 'Free', status: '✅ Ready' },
  ];

  return (
    <>
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header"><h3>🔑 API Keys</h3></div>
        <div className="card-body">
          <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 8 }}>OpenRouter API Key</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <input type={showKey ? 'text' : 'password'} value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="sk-or-v1-..."
                style={{ width: '100%', padding: '10px 40px 10px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, outline: 'none' }} />
              <button onClick={() => setShowKey(!showKey)} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <button onClick={handleSave} className="topbar-btn primary">{saved ? <><Check size={14} /> Saved!</> : <><Save size={14} /> Save</>}</button>
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>Get your key at <a href="https://openrouter.ai/keys" target="_blank" style={{ color: 'var(--accent-purple-light)' }}>openrouter.ai/keys</a></p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header"><h3>🎬 Video Generator</h3></div>
        <div className="card-body">
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>Select AI model for 15-second videos</p>
          {videoOptions.map(opt => (
            <div key={opt.id} onClick={() => { setVideoGen(opt.id); saveConfig({ videoGenerator: opt.id }); }} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 8, marginBottom: 6, cursor: 'pointer',
              border: videoGen === opt.id ? '1px solid var(--accent-purple)' : '1px solid var(--border)',
              background: videoGen === opt.id ? 'rgba(124,58,237,0.08)' : 'var(--bg-secondary)',
            }}>
              <div style={{ width: 18, height: 18, borderRadius: '50%', border: videoGen === opt.id ? '5px solid var(--accent-purple)' : '2px solid var(--border)' }} />
              <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{opt.name}</div>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{opt.cost}</span>
              <span style={{ fontSize: 11 }}>{opt.status}</span>
            </div>
          ))}
          <div style={{ marginTop: 20, padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, fontSize: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>💰 Daily Cost (5 videos/day)</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {[{ gen: 'MiniMax', daily: '$0.50', monthly: '$15' }, { gen: 'Kling', daily: '$1.00', monthly: '$30' }, { gen: 'Runway', daily: '$3.75', monthly: '$112' }].map(c => (
                <div key={c.gen} style={{ textAlign: 'center', padding: 8, background: 'var(--bg-card)', borderRadius: 6 }}>
                  <div style={{ fontWeight: 600 }}>{c.gen}</div>
                  <div style={{ color: 'var(--accent-green)' }}>{c.daily}/day</div>
                  <div style={{ color: 'var(--text-muted)' }}>{c.monthly}/mo</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="section-grid equal">
        <div className="card">
          <div className="card-header"><h3>⚙️ General</h3></div>
          <div className="card-body" style={{ fontSize: 13 }}>
            {[{ label: 'App Name', value: 'Midnight Singles International' }, { label: 'Timezone', value: 'PST' }].map((s, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(42,42,64,0.3)' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{s.label}</span><span style={{ fontWeight: 500 }}>{s.value}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-header"><h3>📅 Posting Schedule (PST)</h3></div>
          <div className="card-body" style={{ fontSize: 13 }}>
            <div style={{ marginBottom: 12 }}><div style={{ fontWeight: 600, color: '#ef4444', marginBottom: 4 }}>▶ YouTube Shorts (2/day)</div><div style={{ color: 'var(--text-secondary)' }}>10:00 AM · 6:00 PM</div></div>
            <div><div style={{ fontWeight: 600, color: '#25f4ee', marginBottom: 4 }}>♪ TikTok (3/day)</div><div style={{ color: 'var(--text-secondary)' }}>12:00 PM · 4:00 PM · 9:00 PM</div></div>
          </div>
        </div>
      </div>
    </>
  );
}
