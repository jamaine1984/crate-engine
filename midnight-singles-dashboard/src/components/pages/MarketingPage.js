'use client';
import { useState, useEffect } from 'react';
import { Bot, Sparkles, Image, ThumbsUp, ThumbsDown, Send, RotateCcw, Zap, Copy, Download } from 'lucide-react';
import { getConfig, getContentLog, addContent, updateContent, addImage, generateScript, generateImage, getImageLibrary } from '@/lib/store';

const themes = [
  { id: 'free-dating', name: '🆓 Free Dating Revolution' },
  { id: 'speed-dating', name: '🎥 Video Speed Dating' },
  { id: 'ai-matching', name: '🧠 AI Personality Matching' },
  { id: 'international', name: '🌍 International Connections' },
  { id: 'games-fun', name: '🎮 Icebreaker Games' },
  { id: 'verification', name: '✅ Real People Only' },
  { id: 'dating-tips', name: '💡 Dating Advice' },
  { id: 'gift-store', name: '🎁 Virtual Gifts' },
  { id: 'night-owl', name: '🦉 Night Owl / Night Shift' },
];

export default function MarketingPage() {
  const [generating, setGenerating] = useState(false);
  const [contentLog, setContentLog] = useState([]);
  const [error, setError] = useState('');
  const [selectedTheme, setSelectedTheme] = useState('free-dating');
  const [selectedPlatform, setSelectedPlatform] = useState('tiktok');
  const [filter, setFilter] = useState('all');
  const [genMode, setGenMode] = useState('both'); // 'script', 'image', 'both'
  const [customImagePrompt, setCustomImagePrompt] = useState('');
  const [generatingImageFor, setGeneratingImageFor] = useState(null);
  const [regenImageFor, setRegenImageFor] = useState(null);
  const [copied, setCopied] = useState(null);
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [batchProgress, setBatchProgress] = useState('');
  const [showNightOwl, setShowNightOwl] = useState(false);

  useEffect(() => { setContentLog(getContentLog()); }, []);

  const config = typeof window !== 'undefined' ? getConfig() : {};
  const hasKey = !!config.openRouterKey;

  // Generate script + image together
  const handleGenerate = async () => {
    if (!hasKey) { setError('Add your OpenRouter API key in Settings first.'); return; }
    setGenerating(true); setError('');
    try {
      const script = await generateScript(config.openRouterKey, selectedTheme, selectedPlatform);
      const entry = {
        id: `${selectedPlatform}-${Date.now()}`,
        platform: selectedPlatform,
        theme: selectedTheme,
        script,
        status: 'pending',
        imageStatus: 'none',
        createdAt: new Date().toISOString(),
      };

      // If mode is 'both' or 'image', also generate image
      if (genMode === 'both' || genMode === 'script') {
        const updated = addContent(entry);
        setContentLog(updated);
      }

      if (genMode === 'both') {
        // Auto-generate image from script's imagePrompt
        const imgResult = await generateImage(config.openRouterKey, script.imagePrompt || 'Attractive diverse people, midnight dating app aesthetic, cinematic');
        if (imgResult.success) {
          const imgEntry = { id: `img-${Date.now()}`, dataUrl: imgResult.dataUrl, prompt: script.imagePrompt, contentId: entry.id, theme: selectedTheme, createdAt: new Date().toISOString() };
          addImage(imgEntry);
          const updated2 = updateContent(entry.id, { imageStatus: 'generated', imageId: imgEntry.id, imageDataUrl: imgResult.dataUrl });
          setContentLog(updated2);
        }
      }
    } catch (e) { setError(e.message); }
    setGenerating(false);
  };

  // Standalone image generation
  const handleGenerateStandaloneImage = async () => {
    if (!hasKey || !customImagePrompt.trim()) return;
    setGenerating(true); setError('');
    try {
      const result = await generateImage(config.openRouterKey, customImagePrompt);
      if (result.success) {
        const imgEntry = { id: `img-${Date.now()}`, dataUrl: result.dataUrl, prompt: customImagePrompt, theme: 'custom', createdAt: new Date().toISOString() };
        addImage(imgEntry);
        setCustomImagePrompt('');
        alert('✅ Image saved to Content Library!');
      }
    } catch (e) { setError(e.message); }
    setGenerating(false);
  };

  // Regenerate image for a content piece
  const handleRegenImage = async (item) => {
    if (!hasKey) return;
    setRegenImageFor(item.id);
    try {
      const result = await generateImage(config.openRouterKey, item.script?.imagePrompt || 'Diverse attractive people, midnight dating vibe');
      if (result.success) {
        const imgEntry = { id: `img-${Date.now()}`, dataUrl: result.dataUrl, prompt: item.script?.imagePrompt, contentId: item.id, theme: item.theme, createdAt: new Date().toISOString() };
        addImage(imgEntry);
        const updated = updateContent(item.id, { imageStatus: 'generated', imageDataUrl: result.dataUrl });
        setContentLog(updated);
      }
    } catch (e) { setError(e.message); }
    setRegenImageFor(null);
  };

  // Generate image for items that don't have one
  const handleGenImageForItem = async (item) => {
    if (!hasKey) return;
    setGeneratingImageFor(item.id);
    try {
      const result = await generateImage(config.openRouterKey, item.script?.imagePrompt || 'Diverse attractive people, midnight dating vibe, cinematic');
      if (result.success) {
        const imgEntry = { id: `img-${Date.now()}`, dataUrl: result.dataUrl, prompt: item.script?.imagePrompt, contentId: item.id, theme: item.theme, createdAt: new Date().toISOString() };
        addImage(imgEntry);
        const updated = updateContent(item.id, { imageStatus: 'generated', imageDataUrl: result.dataUrl });
        setContentLog(updated);
      }
    } catch (e) { setError(e.message); }
    setGeneratingImageFor(null);
  };

  const handleApprove = (id) => setContentLog(updateContent(id, { status: 'approved' }));
  const handleReject = (id) => setContentLog(updateContent(id, { status: 'rejected' }));
  const handlePost = (id) => setContentLog(updateContent(id, { status: 'posted', postedAt: new Date().toISOString() }));
  const handleBackToPending = (id) => setContentLog(updateContent(id, { status: 'pending' }));

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

  // Batch generate 5 posts
  const handleBatchGenerate = async () => {
    if (!hasKey) { setError('Add API key in Settings'); return; }
    setBatchGenerating(true); setError('');
    const schedule = [
      { platform: 'youtube', theme: themes[Math.floor(Math.random()*themes.length)].id },
      { platform: 'youtube', theme: themes[Math.floor(Math.random()*themes.length)].id },
      { platform: 'tiktok', theme: themes[Math.floor(Math.random()*themes.length)].id },
      { platform: 'tiktok', theme: themes[Math.floor(Math.random()*themes.length)].id },
      { platform: 'tiktok', theme: themes[Math.floor(Math.random()*themes.length)].id },
    ];
    for (let i = 0; i < schedule.length; i++) {
      const s = schedule[i];
      setBatchProgress(`Generating ${i+1}/5 — ${s.platform === 'youtube' ? '▶ YT' : '♪ TT'} ${s.theme}...`);
      try {
        const script = await generateScript(config.openRouterKey, s.theme, s.platform);
        const entry = { id: `${s.platform}-${Date.now()}`, platform: s.platform, theme: s.theme, script, status: 'pending', imageStatus: 'none', createdAt: new Date().toISOString() };
        addContent(entry);
        // Generate image
        setBatchProgress(`Generating ${i+1}/5 — creating image...`);
        const imgResult = await generateImage(config.openRouterKey, script.imagePrompt || 'Diverse people, midnight dating, cinematic');
        if (imgResult.success) {
          const imgEntry = { id: `img-${Date.now()}`, dataUrl: imgResult.dataUrl, prompt: script.imagePrompt, contentId: entry.id, theme: s.theme, createdAt: new Date().toISOString() };
          addImage(imgEntry);
          updateContent(entry.id, { imageStatus: 'generated', imageDataUrl: imgResult.dataUrl });
        }
      } catch (e) { console.error(e); }
    }
    setContentLog(getContentLog());
    setBatchGenerating(false);
    setBatchProgress('');
  };

  const filtered = contentLog.filter(c => filter === 'all' || c.status === filter);

  const statusConfig = {
    pending: { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b', label: '⏳ Pending' },
    approved: { bg: 'rgba(16,185,129,0.15)', color: '#10b981', label: '✅ Approved' },
    rejected: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', label: '❌ Rejected' },
    posted: { bg: 'rgba(124,58,237,0.15)', color: '#a78bfa', label: '🚀 Posted' },
  };

  return (
    <>
      {/* Top Stats */}
      <div className="stats-grid" style={{ marginBottom: 20 }}>
        {[
          { label: 'Pending Review', count: contentLog.filter(c=>c.status==='pending').length, color: '#f59e0b', icon: '⏳' },
          { label: 'Approved', count: contentLog.filter(c=>c.status==='approved').length, color: '#10b981', icon: '✅' },
          { label: 'Posted', count: contentLog.filter(c=>c.status==='posted').length, color: '#a78bfa', icon: '🚀' },
          { label: 'Images Created', count: getImageLibrary().length, color: '#ec4899', icon: '🖼️' },
        ].map((s,i) => (
          <div className="stat-card" key={i}>
            <div className="stat-card-header"><span className="label">{s.label}</span><span className="icon" style={{ background: `${s.color}20`, fontSize: 18 }}>{s.icon}</span></div>
            <div className="value" style={{ color: s.color }}>{s.count}</div>
          </div>
        ))}
      </div>

      {/* 🦉 Night Owl Strategy Guide */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header" style={{ cursor: 'pointer' }} onClick={() => setShowNightOwl(!showNightOwl)}>
          <h3>🦉 Night Owl Marketing Strategy</h3>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{showNightOwl ? '▼ Collapse' : '▶ Expand'}</span>
        </div>
        {showNightOwl && (
          <div className="card-body" style={{ fontSize: 13, lineHeight: 1.8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {/* Core Concept */}
              <div style={{ padding: 16, background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border)' }}>
                <h4 style={{ marginBottom: 10, color: 'var(--accent-purple-light)' }}>🎯 Core Concept</h4>
                <p style={{ color: 'var(--text-secondary)', marginBottom: 8 }}>Target night shift workers and night owls who struggle to date because of their schedule. Nobody owns this niche.</p>
                <ul style={{ color: 'var(--text-secondary)', paddingLeft: 16 }}>
                  <li>Nurses, security guards, bartenders, warehouse crews</li>
                  <li>Hospital workers, truckers, first responders</li>
                  <li>Insomniacs, gamers, creatives who work late</li>
                  <li>"Dating is hard when your 9pm is someone else's 9am"</li>
                </ul>
              </div>

              {/* Content Pillars */}
              <div style={{ padding: 16, background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border)' }}>
                <h4 style={{ marginBottom: 10, color: '#f59e0b' }}>📱 Content Pillars</h4>
                <ul style={{ color: 'var(--text-secondary)', paddingLeft: 16 }}>
                  <li><strong>POV Videos:</strong> "You just got off a 12-hour shift and everyone's asleep except..."</li>
                  <li><strong>Storytime:</strong> "I matched with someone who actually gets my schedule"</li>
                  <li><strong>Duets/Stitches:</strong> React to mainstream dating advice that doesn't work for night workers</li>
                  <li><strong>Polls:</strong> "What's harder — dating on night shift or explaining your sleep schedule?"</li>
                  <li><strong>Before/After:</strong> Lonely scrolling at 3am vs. finding your person</li>
                  <li><strong>Midnight Confessions:</strong> Anonymous dating stories submitted by users</li>
                </ul>
              </div>

              {/* Posting Strategy */}
              <div style={{ padding: 16, background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border)' }}>
                <h4 style={{ marginBottom: 10, color: '#10b981' }}>⏰ Posting Strategy</h4>
                <ul style={{ color: 'var(--text-secondary)', paddingLeft: 16 }}>
                  <li><strong>Post between 11pm–3am</strong> — when your audience is scrolling</li>
                  <li>Comment on night shift creators to build community</li>
                  <li>Community first, app second — make night owls feel seen</li>
                  <li>Partner with micro-influencers: nurses, truckers, bartender TikTokers</li>
                </ul>
              </div>

              {/* Hashtags */}
              <div style={{ padding: 16, background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border)' }}>
                <h4 style={{ marginBottom: 10, color: '#ec4899' }}>🏷️ Key Hashtags</h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {['nightshift', 'nightowl', 'nightshiftlife', '3amthoughts', 'datingstruggles', 'singlesover30', 'nightshiftnurse', 'nightshiftworker', 'latenightvibes', 'midnightsingles', 'nightshiftdating', 'cantsleepcrew'].map(tag => (
                    <span key={tag} style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, background: 'rgba(124,58,237,0.15)', color: 'var(--accent-purple-light)' }}>#{tag}</span>
                  ))}
                </div>
              </div>

              {/* YouTube Strategy */}
              <div style={{ padding: 16, background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border)', gridColumn: '1 / -1' }}>
                <h4 style={{ marginBottom: 10, color: '#ef4444' }}>▶ YouTube Shorts Strategy</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, color: 'var(--text-secondary)' }}>
                  <div>
                    <strong>Short-Form (Shorts):</strong>
                    <ul style={{ paddingLeft: 16, marginTop: 4 }}>
                      <li>Same night owl POV content adapted for Shorts</li>
                      <li>"Day in the life of a night shift single"</li>
                      <li>App feature showcases with relatable scenarios</li>
                      <li>User testimonial clips (real or scripted)</li>
                    </ul>
                  </div>
                  <div>
                    <strong>Long-Form Ideas (future):</strong>
                    <ul style={{ paddingLeft: 16, marginTop: 4 }}>
                      <li>"I tried dating on night shift for 30 days"</li>
                      <li>Night shift workers share their love stories</li>
                      <li>"The loneliest jobs in America" (empathy → app pitch)</li>
                      <li>Speed dating events filmed live</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Growth Plays */}
              <div style={{ padding: 16, background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border)', gridColumn: '1 / -1' }}>
                <h4 style={{ marginBottom: 10, color: 'var(--accent-gold)' }}>🚀 Growth Plays</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, color: 'var(--text-secondary)' }}>
                  <div>
                    <strong>🤝 Partnerships</strong>
                    <ul style={{ paddingLeft: 16, marginTop: 4, fontSize: 12 }}>
                      <li>Night shift TikTok creators</li>
                      <li>Nurse influencers</li>
                      <li>Trucker vloggers</li>
                      <li>Bartender content creators</li>
                    </ul>
                  </div>
                  <div>
                    <strong>💬 Community Building</strong>
                    <ul style={{ paddingLeft: 16, marginTop: 4, fontSize: 12 }}>
                      <li>Comment on night shift content</li>
                      <li>UGC challenge: "Show your 3am view"</li>
                      <li>Night owl support threads</li>
                      <li>Build following BEFORE selling</li>
                    </ul>
                  </div>
                  <div>
                    <strong>🎯 Targeting</strong>
                    <ul style={{ paddingLeft: 16, marginTop: 4, fontSize: 12 }}>
                      <li>Healthcare workers</li>
                      <li>Warehouse/logistics</li>
                      <li>Security & first responders</li>
                      <li>Service industry (bartenders, servers)</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>


      {/* Generate Section */}
      <div className="section-grid equal" style={{ marginBottom: 24 }}>
        {/* Script + Image Generator */}
        <div className="card">
          <div className="card-header"><h3>⚡ Generate Content</h3></div>
          <div className="card-body">
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>Mode</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {[
                  { id: 'both', label: '📝+🖼️ Script & Image' },
                  { id: 'script', label: '📝 Script Only' },
                ].map(m => (
                  <button key={m.id} onClick={() => setGenMode(m.id)} style={{
                    flex: 1, padding: 8, borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    border: genMode === m.id ? '1px solid var(--accent-purple)' : '1px solid var(--border)',
                    background: genMode === m.id ? 'rgba(124,58,237,0.12)' : 'var(--bg-secondary)',
                    color: genMode === m.id ? 'var(--accent-purple-light)' : 'var(--text-muted)',
                  }}>{m.label}</button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>Theme</label>
              <select value={selectedTheme} onChange={e => setSelectedTheme(e.target.value)} style={{ width: '100%', padding: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13 }}>
                {themes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>Platform</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {['youtube', 'tiktok'].map(p => (
                  <button key={p} onClick={() => setSelectedPlatform(p)} style={{
                    flex: 1, padding: 10, borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13,
                    border: selectedPlatform === p ? 'none' : '1px solid var(--border)',
                    background: selectedPlatform === p ? (p === 'youtube' ? 'rgba(239,68,68,0.2)' : 'rgba(37,244,238,0.1)') : 'var(--bg-secondary)',
                    color: selectedPlatform === p ? (p === 'youtube' ? '#ef4444' : '#25f4ee') : 'var(--text-muted)',
                  }}>{p === 'youtube' ? '▶ YouTube Short' : '♪ TikTok'}</button>
                ))}
              </div>
            </div>
            <button onClick={handleGenerate} disabled={generating} className="topbar-btn primary" style={{ width: '100%', justifyContent: 'center', padding: 12, fontSize: 14 }}>
              {generating ? '⏳ Generating...' : <><Sparkles size={16} /> Generate {genMode === 'both' ? 'Script + Image' : 'Script'}</>}
            </button>
            <div style={{ marginTop: 10 }}>
              <button onClick={handleBatchGenerate} disabled={batchGenerating} style={{
                width: '100%', padding: 10, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: 'var(--gradient-gold)', border: 'none', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                {batchGenerating ? batchProgress : <><Zap size={14} /> Batch Generate (2 YT + 3 TT with Images)</>}
              </button>
            </div>
            {error && <p style={{ color: 'var(--accent-red)', fontSize: 12, marginTop: 8 }}>{error}</p>}
          </div>
        </div>

        {/* Standalone Image Creator */}
        <div className="card">
          <div className="card-header"><h3>🖼️ Create Standalone Image</h3></div>
          <div className="card-body">
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>Generate images for your content library — reuse across any post.</p>
            <textarea
              value={customImagePrompt}
              onChange={e => setCustomImagePrompt(e.target.value)}
              placeholder="Describe the image you want... e.g. 'A stylish diverse group of friends at a midnight rooftop party, city lights, purple and gold lighting, premium feel'"
              style={{ width: '100%', height: 120, padding: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, resize: 'vertical', fontFamily: 'inherit' }}
            />
            <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
              {['Couple video dating', 'Phone showing app UI', 'Diverse singles nightlife', 'Speed dating room', 'International flags globe'].map(q => (
                <button key={q} onClick={() => setCustomImagePrompt(q + ', midnight purple and gold tones, cinematic, ultra realistic, attractive diverse people')}
                  style={{ padding: '4px 10px', borderRadius: 6, fontSize: 10, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)', cursor: 'pointer' }}>{q}</button>
              ))}
            </div>
            <button onClick={handleGenerateStandaloneImage} disabled={generating || !customImagePrompt.trim()} className="topbar-btn primary" style={{ width: '100%', justifyContent: 'center', padding: 12, marginTop: 12 }}>
              {generating ? '⏳ Generating Image...' : <><Image size={14} /> Generate Image → Library</>}
            </button>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {['all', 'pending', 'approved', 'posted', 'rejected'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            background: filter === f ? 'var(--accent-purple)' : 'var(--bg-card)', border: '1px solid var(--border)',
            color: filter === f ? 'white' : 'var(--text-secondary)',
          }}>{f === 'all' ? `All (${contentLog.length})` : `${f.charAt(0).toUpperCase()+f.slice(1)} (${contentLog.filter(c=>c.status===f).length})`}</button>
        ))}
      </div>

      {/* Content Queue */}
      <div className="card">
        <div className="card-header"><h3>📋 Content Queue ({filtered.length})</h3></div>
        <div className="card-body">
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)', fontSize: 13 }}>
              {filter === 'all' ? '🎬 No content yet. Generate your first post above!' : `No ${filter} content.`}
            </div>
          ) : filtered.map((item) => {
            const st = statusConfig[item.status] || statusConfig.pending;
            return (
              <div key={item.id} style={{ padding: 16, marginBottom: 16, background: 'var(--bg-secondary)', borderRadius: 12, border: `1px solid ${item.status === 'approved' ? 'rgba(16,185,129,0.3)' : 'var(--border)'}` }}>
                {/* Header Row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <span style={{ padding: '3px 10px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: item.platform === 'youtube' ? 'rgba(239,68,68,0.2)' : 'rgba(37,244,238,0.1)', color: item.platform === 'youtube' ? '#ef4444' : '#25f4ee' }}>
                    {item.platform === 'youtube' ? '▶ YouTube Short' : '♪ TikTok'}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', padding: '3px 8px', background: 'var(--bg-card)', borderRadius: 4 }}>{themes.find(t=>t.id===item.theme)?.name || item.theme}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 11, padding: '3px 12px', borderRadius: 6, fontWeight: 600, background: st.bg, color: st.color }}>{st.label}</span>
                </div>

                {/* Content: Image + Script side by side */}
                <div style={{ display: 'flex', gap: 16, marginBottom: 14 }}>
                  {/* Image Column */}
                  <div style={{ width: 160, flexShrink: 0 }}>
                    {item.imageDataUrl ? (
                      <div style={{ position: 'relative' }}>
                        <img src={item.imageDataUrl} alt="" style={{ width: '100%', aspectRatio: '9/16', objectFit: 'cover', borderRadius: 10, border: '1px solid var(--border)' }} />
                        <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                          <button onClick={() => downloadImage(item.imageDataUrl, `msi-${item.id}`)} title="Download"
                            style={{ flex: 1, padding: 4, borderRadius: 4, fontSize: 10, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                            <Download size={10} /> Save
                          </button>
                          <button onClick={() => handleRegenImage(item)} disabled={regenImageFor === item.id} title="Regenerate"
                            style={{ flex: 1, padding: 4, borderRadius: 4, fontSize: 10, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                            {regenImageFor === item.id ? '⏳' : <><RotateCcw size={10} /> Redo</>}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => handleGenImageForItem(item)} disabled={generatingImageFor === item.id}
                        style={{ width: '100%', aspectRatio: '9/16', borderRadius: 10, border: '2px dashed var(--border)', background: 'var(--bg-card)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12, gap: 6 }}>
                        {generatingImageFor === item.id ? '⏳ Creating...' : <><Image size={24} style={{ opacity: 0.4 }} /><span>Generate<br/>Image</span></>}
                      </button>
                    )}
                  </div>

                  {/* Script Column */}
                  <div style={{ flex: 1, fontSize: 12 }}>
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>🎤 {item.script?.hook}</div>
                      <div style={{ color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 6 }}>{item.script?.body}</div>
                      <div style={{ fontWeight: 600, color: 'var(--accent-green)' }}>📢 {item.script?.cta}</div>
                    </div>
                    {item.script?.onScreenText && (
                      <div style={{ marginBottom: 8, padding: 8, background: 'var(--bg-card)', borderRadius: 6, fontSize: 11 }}>
                        <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--text-muted)' }}>📱 On-Screen Text:</div>
                        {item.script.onScreenText.map((t,i) => <div key={i} style={{ color: 'var(--text-secondary)' }}>• {t}</div>)}
                      </div>
                    )}
                    {item.script?.caption && (
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: 11, marginBottom: 2 }}>✏️ Caption:</div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{item.script.caption}</div>
                      </div>
                    )}
                    {item.script?.hashtags && (
                      <div style={{ color: 'var(--accent-purple-light)', fontSize: 11 }}>{item.script.hashtags.map(h => `#${h}`).join(' ')}</div>
                    )}
                    {/* Copy buttons */}
                    <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
                      <button onClick={() => handleCopy(item.script?.caption + '\n' + (item.script?.hashtags || []).map(h=>'#'+h).join(' '), 'cap-'+item.id)}
                        style={{ padding: '3px 8px', borderRadius: 4, fontSize: 10, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
                        {copied === 'cap-'+item.id ? '✅ Copied!' : <><Copy size={10} /> Caption + Tags</>}
                      </button>
                      <button onClick={() => handleCopy(`${item.script?.hook}\n\n${item.script?.body}\n\n${item.script?.cta}`, 'scr-'+item.id)}
                        style={{ padding: '3px 8px', borderRadius: 4, fontSize: 10, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
                        {copied === 'scr-'+item.id ? '✅ Copied!' : <><Copy size={10} /> Full Script</>}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Action Bar */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                  {item.status === 'pending' && (
                    <>
                      <button onClick={() => handleApprove(item.id)}
                        style={{ padding: '8px 18px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)', color: '#10b981' }}>
                        <ThumbsUp size={14} /> Approve
                      </button>
                      <button onClick={() => handleReject(item.id)}
                        style={{ padding: '8px 18px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}>
                        <ThumbsDown size={14} /> Reject
                      </button>
                    </>
                  )}
                  {item.status === 'approved' && (
                    <button onClick={() => handlePost(item.id)}
                      style={{ padding: '8px 24px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, background: 'var(--gradient-primary)', border: 'none', color: 'white' }}>
                      <Send size={14} /> Post to {item.platform === 'youtube' ? 'YouTube' : 'TikTok'}
                    </button>
                  )}
                  {item.status === 'rejected' && (
                    <button onClick={() => handleBackToPending(item.id)}
                      style={{ padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                      ↩ Back to Pending
                    </button>
                  )}
                  {item.status === 'posted' && (
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>🚀 Posted {item.postedAt ? new Date(item.postedAt).toLocaleString() : ''}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
