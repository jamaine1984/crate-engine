'use client';
import { useState, useEffect } from 'react';
import { ExternalLink, Copy, Save, Eye } from 'lucide-react';

const DEFAULT_LINKS = [
  { id: 1, label: '📲 Download on App Store', url: '', enabled: true },
  { id: 2, label: '📲 Download on Google Play', url: '', enabled: false },
  { id: 3, label: '🌐 Visit Our Website', url: 'https://midnight-singles-international.web.app', enabled: true },
  { id: 4, label: '▶️ Watch on YouTube', url: 'https://youtube.com/@midnightsinglesinternational', enabled: true },
  { id: 5, label: '♪ Follow on TikTok', url: '', enabled: false },
  { id: 6, label: '💬 Join Our Community', url: '', enabled: false },
];

export default function LinkBioPage() {
  const [links, setLinks] = useState(DEFAULT_LINKS);
  const [bio, setBio] = useState('🌙 Midnight Singles International\n💜 FREE dating app with Video Speed Dating\n🎥 1 Free Video Minute on Signup\n🌍 Meet people worldwide');
  const [preview, setPreview] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('msi-bio-links');
    if (saved) { const d = JSON.parse(saved); setLinks(d.links || DEFAULT_LINKS); setBio(d.bio || ''); }
  }, []);

  const handleSave = () => {
    localStorage.setItem('msi-bio-links', JSON.stringify({ links, bio }));
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  const updateLink = (id, field, value) => {
    setLinks(links.map(l => l.id === id ? { ...l, [field]: value } : l));
  };

  const copyBioText = () => {
    const text = bio + '\n\n' + links.filter(l => l.enabled && l.url).map(l => `${l.label}\n${l.url}`).join('\n\n');
    navigator.clipboard.writeText(text);
  };

  return (
    <>
      <div className="section-grid equal">
        {/* Editor */}
        <div className="card">
          <div className="card-header">
            <h3>✏️ Link in Bio Editor</h3>
            <button onClick={handleSave} className="topbar-btn primary" style={{ fontSize: 11 }}>
              {saved ? '✅ Saved!' : <><Save size={12} /> Save</>}
            </button>
          </div>
          <div className="card-body">
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>Bio Text</label>
            <textarea value={bio} onChange={e => setBio(e.target.value)} rows={4}
              style={{ width: '100%', padding: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, resize: 'vertical', fontFamily: 'inherit', marginBottom: 16 }} />

            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 10 }}>Links</label>
            {links.map(link => (
              <div key={link.id} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                <label className="toggle" style={{ flexShrink: 0 }}>
                  <input type="checkbox" checked={link.enabled} onChange={e => updateLink(link.id, 'enabled', e.target.checked)} />
                  <span className="slider" />
                </label>
                <input value={link.label} onChange={e => updateLink(link.id, 'label', e.target.value)}
                  style={{ flex: 1, padding: 8, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12 }} />
                <input value={link.url} onChange={e => updateLink(link.id, 'url', e.target.value)} placeholder="https://..."
                  style={{ flex: 2, padding: 8, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12 }} />
              </div>
            ))}

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={copyBioText} className="topbar-btn"><Copy size={12} /> Copy All Text</button>
              <button onClick={() => setPreview(!preview)} className="topbar-btn"><Eye size={12} /> {preview ? 'Hide' : 'Show'} Preview</button>
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="card">
          <div className="card-header"><h3>📱 Preview</h3></div>
          <div className="card-body" style={{ display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: 320, background: 'var(--bg-primary)', borderRadius: 20, padding: 24, border: '2px solid var(--border)' }}>
              {/* Profile */}
              <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--gradient-primary)', margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36 }}>🌙</div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>Midnight Singles</div>
                <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--accent-purple-light)' }}>International</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8, whiteSpace: 'pre-line', lineHeight: 1.5 }}>{bio}</div>
              </div>

              {/* Links */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {links.filter(l => l.enabled).map(link => (
                  <a key={link.id} href={link.url || '#'} target="_blank" className="bio-link-card" style={{ textDecoration: 'none', color: 'var(--text-primary)' }}>
                    {link.label}
                  </a>
                ))}
              </div>

              <div style={{ textAlign: 'center', marginTop: 16, fontSize: 10, color: 'var(--text-muted)' }}>
                Powered by Midnight Singles Command Center
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-header"><h3>💡 Pro Tips</h3></div>
        <div className="card-body" style={{ fontSize: 13 }}>
          <div style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '1px solid rgba(42,42,64,0.3)' }}>
            <span>📌</span><div>Put this link in your <strong>YouTube channel description</strong> and every video description</div>
          </div>
          <div style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '1px solid rgba(42,42,64,0.3)' }}>
            <span>📌</span><div>Set as your <strong>TikTok bio link</strong> once the account is created</div>
          </div>
          <div style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '1px solid rgba(42,42,64,0.3)' }}>
            <span>📌</span><div>Update the <strong>App Store link</strong> as soon as the app is live</div>
          </div>
          <div style={{ display: 'flex', gap: 12, padding: '8px 0' }}>
            <span>📌</span><div>Add your <strong>TikTok URL</strong> once the account is created</div>
          </div>
        </div>
      </div>
    </>
  );
}
