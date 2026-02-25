'use client';
import { useState, useEffect } from 'react';
import { Image, Download, Copy, Send } from 'lucide-react';

function getCsContentLog() { if (typeof window === 'undefined') return []; const r = localStorage.getItem('cs-content'); return r ? JSON.parse(r) : []; }
function getCsImages() { if (typeof window === 'undefined') return []; const r = localStorage.getItem('cs-images'); return r ? JSON.parse(r) : []; }
function updateCsContent(id, u) { const log = getCsContentLog(); const i = log.findIndex(c=>c.id===id); if(i>=0) log[i]={...log[i],...u}; localStorage.setItem('cs-content', JSON.stringify(log)); return log; }

export default function CrateShipContent() {
  const [content, setContent] = useState([]);
  const [images, setImages] = useState([]);
  const [tab, setTab] = useState('all');
  useEffect(() => { setContent(getCsContentLog()); setImages(getCsImages()); }, []);

  const downloadImage = (url, name) => { const a = document.createElement('a'); a.href = url; a.download = `${name}.png`; a.click(); };
  const handleApprove = (id) => setContent(updateCsContent(id, { status: 'approved' }));
  const handlePost = (id) => setContent(updateCsContent(id, { status: 'posted' }));

  return (
    <>
      <div className="stats-grid" style={{ marginBottom: 20 }}>
        {[
          { label: 'Total Content', value: content.length, icon: '📋' },
          { label: 'Images', value: images.length, icon: '🖼️' },
          { label: 'Ready to Post', value: content.filter(c=>c.status==='approved').length, icon: '✅' },
          { label: 'Published', value: content.filter(c=>c.status==='posted').length, icon: '🚀' },
        ].map((s,i) => (
          <div className="stat-card" key={i}><div className="stat-card-header"><span className="label">{s.label}</span><span style={{ fontSize: 18 }}>{s.icon}</span></div><div className="value">{s.value}</div></div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {['all','images'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: tab===t ? '#f59e0b' : 'var(--bg-card)', border: '1px solid var(--border)', color: tab===t ? 'white' : 'var(--text-secondary)' }}>
            {t === 'all' ? `📋 All (${content.length})` : `🖼️ Images (${images.length})`}
          </button>
        ))}
      </div>

      {tab === 'images' ? (
        <div className="card"><div className="card-body">
          {images.length === 0 ? <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>No images yet.</div> : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
              {images.map(img => (
                <div key={img.id} style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
                  <img src={img.dataUrl} alt="" style={{ width: '100%', aspectRatio: '9/16', objectFit: 'cover' }} />
                  <div style={{ padding: 6 }}>
                    <button onClick={() => downloadImage(img.dataUrl, img.id)} style={{ width: '100%', padding: 4, fontSize: 10, borderRadius: 4, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)', cursor: 'pointer' }}>💾 Download</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div></div>
      ) : (
        <div className="card"><div className="card-body">
          {content.length === 0 ? <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>No content. Generate from Marketing Agent.</div> : content.map(item => (
            <div key={item.id} style={{ display: 'flex', gap: 14, padding: 14, marginBottom: 12, background: 'var(--bg-card)', borderRadius: 10, border: '1px solid var(--border)' }}>
              {item.imageDataUrl && <img src={item.imageDataUrl} alt="" style={{ width: 80, height: 142, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: item.platform==='youtube'?'rgba(239,68,68,0.2)':'rgba(37,244,238,0.1)', color: item.platform==='youtube'?'#ef4444':'#25f4ee' }}>{item.platform==='youtube'?'▶ YT':'♪ TT'}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 600, color: item.status==='approved'?'#10b981':item.status==='posted'?'#a78bfa':'#f59e0b' }}>{item.status}</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{item.script?.hook}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{item.script?.caption}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  {item.status === 'pending' && <button onClick={() => handleApprove(item.id)} style={{ padding: '4px 10px', borderRadius: 4, fontSize: 10, background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981', cursor: 'pointer' }}>✅ Approve</button>}
                  {item.status === 'approved' && <button onClick={() => handlePost(item.id)} style={{ padding: '4px 10px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: 'var(--gradient-gold)', border: 'none', color: 'white', cursor: 'pointer' }}>🚀 Post</button>}
                </div>
              </div>
            </div>
          ))}
        </div></div>
      )}
    </>
  );
}
