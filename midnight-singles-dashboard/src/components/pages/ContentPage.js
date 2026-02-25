'use client';
import { useState, useEffect } from 'react';
import { Image, Download, Copy, Send, ThumbsUp, ThumbsDown, Film, Trash2, Search } from 'lucide-react';
import { getImageLibrary, getContentLog, updateContent } from '@/lib/store';

export default function ContentPage() {
  const [images, setImages] = useState([]);
  const [content, setContent] = useState([]);
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [copied, setCopied] = useState(null);

  useEffect(() => {
    setImages(getImageLibrary());
    setContent(getContentLog());
  }, []);

  const handleCopy = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const downloadImage = (dataUrl, name) => {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${name}.png`;
    a.click();
  };

  const handleApprove = (id) => { const u = updateContent(id, { status: 'approved' }); setContent(u); };
  const handleReject = (id) => { const u = updateContent(id, { status: 'rejected' }); setContent(u); };
  const handlePost = (id) => { const u = updateContent(id, { status: 'posted', postedAt: new Date().toISOString() }); setContent(u); };

  const stats = {
    total: content.length,
    images: images.length,
    pending: content.filter(c => c.status === 'pending').length,
    approved: content.filter(c => c.status === 'approved').length,
    posted: content.filter(c => c.status === 'posted').length,
    youtube: content.filter(c => c.platform === 'youtube').length,
    tiktok: content.filter(c => c.platform === 'tiktok').length,
  };

  const filteredContent = content.filter(c => {
    if (tab === 'approved') return c.status === 'approved';
    if (tab === 'posted') return c.status === 'posted';
    if (tab === 'youtube') return c.platform === 'youtube';
    if (tab === 'tiktok') return c.platform === 'tiktok';
    if (tab === 'images') return false;
    return true;
  }).filter(c => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (c.script?.hook?.toLowerCase().includes(s) || c.script?.caption?.toLowerCase().includes(s) || c.theme?.includes(s));
  });

  const filteredImages = images.filter(img => {
    if (!search) return true;
    return img.prompt?.toLowerCase().includes(search.toLowerCase()) || img.theme?.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <>
      {/* Stats */}
      <div className="stats-grid" style={{ marginBottom: 20 }}>
        {[
          { label: 'Total Content', value: stats.total, icon: '📋', color: 'var(--accent-purple)' },
          { label: 'Image Library', value: stats.images, icon: '🖼️', color: '#ec4899' },
          { label: 'Ready to Post', value: stats.approved, icon: '✅', color: '#10b981' },
          { label: 'Published', value: stats.posted, icon: '🚀', color: '#a78bfa' },
        ].map((s,i) => (
          <div className="stat-card" key={i}>
            <div className="stat-card-header"><span className="label">{s.label}</span><span className="icon" style={{ fontSize: 18 }}>{s.icon}</span></div>
            <div className="value" style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div style={{ marginBottom: 16, position: 'relative' }}>
        <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        <input type="text" placeholder="Search content, images, themes..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', padding: '10px 12px 10px 34px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13 }} />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { id: 'all', label: `📋 All (${stats.total})` },
          { id: 'images', label: `🖼️ Images (${stats.images})` },
          { id: 'approved', label: `✅ Ready (${stats.approved})` },
          { id: 'posted', label: `🚀 Posted (${stats.posted})` },
          { id: 'youtube', label: `▶ YouTube (${stats.youtube})` },
          { id: 'tiktok', label: `♪ TikTok (${stats.tiktok})` },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            background: tab === t.id ? 'var(--accent-purple)' : 'var(--bg-card)', border: '1px solid var(--border)',
            color: tab === t.id ? 'white' : 'var(--text-secondary)',
          }}>{t.label}</button>
        ))}
      </div>

      {/* Image Gallery */}
      {tab === 'images' ? (
        <div className="card">
          <div className="card-header"><h3>🖼️ Image Library — Reusable Across Posts</h3></div>
          <div className="card-body">
            {filteredImages.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>No images yet. Generate from Marketing Agent.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
                {filteredImages.map(img => (
                  <div key={img.id} style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
                    <img src={img.dataUrl} alt="" style={{ width: '100%', aspectRatio: '9/16', objectFit: 'cover' }} />
                    <div style={{ padding: 8 }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{img.theme || 'Custom'}</div>
                      <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{new Date(img.createdAt).toLocaleDateString()}</div>
                      <button onClick={() => downloadImage(img.dataUrl, `msi-${img.id}`)}
                        style={{ marginTop: 4, width: '100%', padding: 4, fontSize: 10, borderRadius: 4, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                        <Download size={10} /> Download
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Content List */
        <div className="card">
          <div className="card-header"><h3>{tab === 'all' ? '📋 All Content' : tab === 'approved' ? '✅ Ready to Post' : tab === 'posted' ? '🚀 Published' : tab === 'youtube' ? '▶ YouTube Content' : '♪ TikTok Content'}</h3></div>
          <div className="card-body">
            {filteredContent.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>No content in this category.</div>
            ) : filteredContent.map(item => (
              <div key={item.id} style={{ display: 'flex', gap: 14, padding: 14, marginBottom: 12, background: 'var(--bg-card)', borderRadius: 10, border: '1px solid var(--border)' }}>
                {/* Thumbnail */}
                {item.imageDataUrl ? (
                  <img src={item.imageDataUrl} alt="" style={{ width: 80, height: 142, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 80, height: 142, borderRadius: 8, background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px dashed var(--border)' }}>
                    <Image size={20} style={{ opacity: 0.2 }} />
                  </div>
                )}

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: item.platform === 'youtube' ? 'rgba(239,68,68,0.2)' : 'rgba(37,244,238,0.1)', color: item.platform === 'youtube' ? '#ef4444' : '#25f4ee' }}>
                      {item.platform === 'youtube' ? '▶ YT' : '♪ TT'}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{new Date(item.createdAt).toLocaleDateString()}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 10, padding: '2px 8px', borderRadius: 4, fontWeight: 600,
                      background: item.status === 'approved' ? 'rgba(16,185,129,0.15)' : item.status === 'posted' ? 'rgba(124,58,237,0.15)' : item.status === 'rejected' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                      color: item.status === 'approved' ? '#10b981' : item.status === 'posted' ? '#a78bfa' : item.status === 'rejected' ? '#ef4444' : '#f59e0b',
                    }}>{item.status}</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{item.script?.hook}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{item.script?.caption}</div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button onClick={() => handleCopy(item.script?.caption + '\n' + (item.script?.hashtags||[]).map(h=>'#'+h).join(' '), item.id)}
                      style={{ padding: '4px 10px', borderRadius: 4, fontSize: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
                      {copied === item.id ? '✅' : <><Copy size={10} /> Copy</>}
                    </button>
                    {item.imageDataUrl && (
                      <button onClick={() => downloadImage(item.imageDataUrl, `msi-${item.id}`)}
                        style={{ padding: '4px 10px', borderRadius: 4, fontSize: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
                        <Download size={10} /> Image
                      </button>
                    )}
                    {item.status === 'pending' && (
                      <>
                        <button onClick={() => handleApprove(item.id)} style={{ padding: '4px 10px', borderRadius: 4, fontSize: 10, background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981', cursor: 'pointer' }}>✅ Approve</button>
                        <button onClick={() => handleReject(item.id)} style={{ padding: '4px 10px', borderRadius: 4, fontSize: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', cursor: 'pointer' }}>❌ Reject</button>
                      </>
                    )}
                    {item.status === 'approved' && (
                      <button onClick={() => handlePost(item.id)} style={{ padding: '4px 12px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: 'var(--gradient-primary)', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
                        <Send size={10} /> Post
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
