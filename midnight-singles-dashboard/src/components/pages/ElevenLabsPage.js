'use client';
import { useState, useEffect, useRef } from 'react';
import { Play, Pause, Download, Sparkles, Send, ThumbsUp, ThumbsDown, Trash2, RefreshCw, Copy, Check } from 'lucide-react';
import { getConfig, saveConfig, addContent, updateContent, getAudioLibrary, addAudio, updateAudio, deleteAudio } from '@/lib/store';

const VOICE_MODELS = [
  { id: 'eleven_flash_v2_5', name: 'Flash v2.5', cost: '0.5 credits/char', desc: 'Fastest, cheapest — ~200 min/mo', recommended: true },
  { id: 'eleven_flash_v2', name: 'Flash v2', cost: '0.5 credits/char', desc: 'Fast multilingual' },
  { id: 'eleven_multilingual_v2', name: 'Multilingual v2', cost: '1 credit/char', desc: 'Highest quality, 29 languages — ~100 min/mo' },
  { id: 'eleven_turbo_v2_5', name: 'Turbo v2.5', cost: '0.5 credits/char', desc: 'Low latency, high quality' },
];

const CAPABILITIES = [
  { id: 'tts', icon: '🎙️', name: 'Text to Speech', desc: '~200 min/mo (Flash) — voiceovers for all content', status: 'ready', color: '#10b981', tab: 'voice' },
  { id: 'voice-clone', icon: '🧬', name: 'Pro Voice Clone', desc: 'Create unique AI influencer voice from samples', status: 'ready', color: '#7c3aed', tab: 'voice' },
  { id: 'image-gen', icon: '🖼️', name: 'Image Generation', desc: '~198 images/mo — thumbnails, posts, characters', status: 'ready', color: '#8b5cf6', tab: 'image' },
  { id: 'video-gen', icon: '🎬', name: 'Video Generation', desc: '~211 sec/mo — AI character videos, promos', status: 'ready', color: '#3b82f6', tab: 'video' },
  { id: 'lip-sync', icon: '👄', name: 'Lip Sync', desc: 'Sync voice to AI character face — talking videos!', status: 'ready', color: '#ef4444', tab: 'video' },
  { id: 'sound-effects', icon: '🔊', name: 'Sound Effects', desc: 'Generate SFX for videos — whooshes, transitions', status: 'ready', color: '#f59e0b', tab: 'sfx' },
  { id: 'music', icon: '🎵', name: 'Music Generation', desc: 'Background music, commercial use included', status: 'ready', color: '#06b6d4', tab: 'music' },
  { id: 'audio-isolation', icon: '🎧', name: 'Voice Isolator', desc: 'Remove background noise from recordings', status: 'ready', color: '#ec4899', tab: 'voice' },
  { id: 'dubbing', icon: '🌍', name: 'Dubbing Studio', desc: 'Auto-translate content to other languages', status: 'ready', color: '#14b8a6', tab: 'voice' },
  { id: 'speech-to-text', icon: '📝', name: 'Speech to Text', desc: 'Transcribe audio/video content', status: 'ready', color: '#64748b', tab: 'voice' },
  { id: 'voice-changer', icon: '🎭', name: 'Voice Changer', desc: 'Transform voice recordings to different voices', status: 'ready', color: '#d946ef', tab: 'voice' },
  { id: 'voice-design', icon: '✨', name: 'Voice Design', desc: 'Create voices from text descriptions', status: 'ready', color: '#fb923c', tab: 'voice' },
];

const PRESET_VOICES = [
  { id: 'Rachel', name: 'Rachel', desc: 'Warm, calm female — narrator' },
  { id: 'Drew', name: 'Drew', desc: 'Confident male — hooks' },
  { id: 'Clyde', name: 'Clyde', desc: 'Deep male — authority' },
  { id: 'Domi', name: 'Domi', desc: 'Energetic female — TikTok' },
  { id: 'Bella', name: 'Bella', desc: 'Soft female — storytelling' },
  { id: 'Antoni', name: 'Antoni', desc: 'Friendly male — relatable' },
];

export default function ElevenLabsPage() {
  const [elKey, setElKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [selectedModel, setSelectedModel] = useState('eleven_flash_v2_5');
  const [selectedVoice, setSelectedVoice] = useState('Rachel');
  const [selectedPlatform, setSelectedPlatform] = useState('tiktok');
  const [activeTab, setActiveTab] = useState('voice');
  const [ttsText, setTtsText] = useState('');
  const [ttsTitle, setTtsTitle] = useState('');
  const [imagePrompt, setImagePrompt] = useState('');
  const [videoPrompt, setVideoPrompt] = useState('');
  const [sfxPrompt, setSfxPrompt] = useState('');
  const [musicPrompt, setMusicPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [voices, setVoices] = useState([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [creditInfo, setCreditInfo] = useState(null);
  const [audioLibrary, setAudioLibrary] = useState([]);
  const [playingId, setPlayingId] = useState(null);
  const [filter, setFilter] = useState('all');
  const [copied, setCopied] = useState(null);
  const audioRef = useRef(null);

  useEffect(() => {
    const c = getConfig();
    if (c.elevenLabsKey) setElKey(c.elevenLabsKey);
    if (c.elModel) setSelectedModel(c.elModel);
    if (c.elVoice) setSelectedVoice(c.elVoice);
    setAudioLibrary(getAudioLibrary());
  }, []);

  const handleSaveKey = () => {
    saveConfig({ elevenLabsKey: elKey, elModel: selectedModel, elVoice: selectedVoice });
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  const fetchVoices = async () => {
    if (!elKey) { setError('Add API key first'); return; }
    setLoadingVoices(true);
    try {
      const res = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': elKey } });
      setVoices((await res.json()).voices || []);
    } catch (e) { setError(e.message); }
    setLoadingVoices(false);
  };

  const checkCredits = async () => {
    if (!elKey) return;
    try {
      const res = await fetch('https://api.elevenlabs.io/v1/user/subscription', { headers: { 'xi-api-key': elKey } });
      setCreditInfo(await res.json());
    } catch (e) {}
  };

  useEffect(() => { if (elKey) checkCredits(); }, [elKey]);

  // ── TTS Generation ──
  const handleGenerateTTS = async () => {
    if (!elKey || !ttsText.trim()) { setError('Need API key and text'); return; }
    setGenerating(true); setError('');
    try {
      let voiceId = selectedVoice;
      if (voices.length > 0) {
        const found = voices.find(v => v.name === selectedVoice || v.voice_id === selectedVoice);
        if (found) voiceId = found.voice_id;
      }
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST', headers: { 'xi-api-key': elKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: ttsText, model_id: selectedModel, voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail?.message || `API error ${res.status}`);
      const blob = await res.blob();
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result;
        const title = ttsTitle.trim() || ttsText.slice(0, 50) + '...';
        const audioId = `audio-${Date.now()}`;
        const audioEntry = { id: audioId, title, text: ttsText, dataUrl, voice: selectedVoice, model: selectedModel, platform: selectedPlatform, type: 'voiceover', status: 'pending', createdAt: new Date().toISOString() };
        setAudioLibrary(addAudio(audioEntry));
        addContent({ id: `content-${audioId}`, platform: selectedPlatform, theme: 'night-owl', type: 'voiceover', audioId, script: { hook: title, body: ttsText, cta: 'Download Midnight Singles — free', hashtags: ['midnightsingles','nightshift','nightowl','dating','freedatingapp'], caption: title }, audioDataUrl: dataUrl, status: 'pending', imageStatus: 'none', createdAt: new Date().toISOString(), source: 'elevenlabs' });
        setTtsText(''); setTtsTitle(''); checkCredits();
      };
      reader.readAsDataURL(blob);
    } catch (e) { setError(e.message); }
    setGenerating(false);
  };

  // ── Sound Effects Generation ──
  const handleGenerateSFX = async () => {
    if (!elKey || !sfxPrompt.trim()) { setError('Need API key and description'); return; }
    setGenerating(true); setError('');
    try {
      const res = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
        method: 'POST', headers: { 'xi-api-key': elKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: sfxPrompt, duration_seconds: 5 }),
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const blob = await res.blob();
      const reader = new FileReader();
      reader.onload = () => {
        const audioId = `sfx-${Date.now()}`;
        setAudioLibrary(addAudio({ id: audioId, title: `SFX: ${sfxPrompt.slice(0,40)}`, text: sfxPrompt, dataUrl: reader.result, voice: 'sfx', model: 'sound-gen', platform: selectedPlatform, type: 'sfx', status: 'pending', createdAt: new Date().toISOString() }));
        setSfxPrompt(''); checkCredits();
      };
      reader.readAsDataURL(blob);
    } catch (e) { setError(e.message); }
    setGenerating(false);
  };

  // ── Image Generation (via ElevenLabs API) ──
  // ── Image Generation (web app only — no public API yet) ──
  const handleGenerateImage = async () => {
    if (!imagePrompt.trim()) { setError('Enter a prompt first'); return; }
    try {
      await navigator.clipboard.writeText(imagePrompt);
      setError('');
      window.open('https://elevenlabs.io/app/image-video', '_blank');
      alert('Prompt copied to clipboard! Paste it in ElevenLabs Image & Video.');
    } catch (e) {
      window.open('https://elevenlabs.io/app/image-video', '_blank');
      setError('Opened ElevenLabs — paste your prompt there manually');
    }
    setGenerating(false);
  };

  // ── Video Generation (web app only — no public API yet) ──
  const handleGenerateVideo = async () => {
    if (!videoPrompt.trim()) { setError('Enter a prompt first'); return; }
    // Copy prompt to clipboard and open ElevenLabs video gen
    try {
      await navigator.clipboard.writeText(videoPrompt);
      setError('');
      window.open('https://elevenlabs.io/app/video', '_blank');
      alert('Prompt copied to clipboard! Paste it in ElevenLabs Video Gen.');
    } catch (e) {
      window.open('https://elevenlabs.io/app/video', '_blank');
      setError('Opened ElevenLabs — paste your prompt there manually');
    }
    setGenerating(false);
  };

  const togglePlay = (id, dataUrl) => {
    if (playingId === id) { audioRef.current?.pause(); setPlayingId(null); }
    else { if (audioRef.current) { audioRef.current.src = dataUrl; audioRef.current.play(); } setPlayingId(id); }
  };

  const handleApprove = (id) => { setAudioLibrary(updateAudio(id, { status: 'approved' })); updateContent(`content-${id}`, { status: 'approved' }); };
  const handleReject = (id) => { setAudioLibrary(updateAudio(id, { status: 'rejected' })); updateContent(`content-${id}`, { status: 'rejected' }); };
  const handleMarkPosted = (id) => { const now = new Date().toISOString(); setAudioLibrary(updateAudio(id, { status: 'posted', postedAt: now })); updateContent(`content-${id}`, { status: 'posted', postedAt: now }); };
  const handleDelete = (id) => { setAudioLibrary(deleteAudio(id)); };
  const downloadFile = (dataUrl, name) => { const a = document.createElement('a'); a.href = dataUrl; a.download = name; a.click(); };

  const filtered = audioLibrary.filter(a => filter === 'all' || a.status === filter);
  const statusConfig = {
    pending: { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b', label: '⏳ Pending' },
    approved: { bg: 'rgba(16,185,129,0.15)', color: '#10b981', label: '✅ Approved' },
    posted: { bg: 'rgba(124,58,237,0.15)', color: '#a78bfa', label: '🚀 Posted' },
    rejected: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', label: '❌ Rejected' },
  };
  const typeIcons = { voiceover: '🎙️', sfx: '🔊', image: '🖼️', video: '🎬', music: '🎵' };

  const creditsUsed = creditInfo?.character_count || 0;
  const creditsTotal = creditInfo?.character_limit || 100000;
  const creditsPercent = Math.round((creditsUsed / creditsTotal) * 100);

  return (
    <>
      <audio ref={audioRef} onEnded={() => setPlayingId(null)} style={{ display: 'none' }} />

      {/* Plan & Credits */}
      <div className="stats-grid" style={{ marginBottom: 20 }}>
        {[
          { label: 'Plan', count: 'Creator', color: '#7c3aed', icon: '👑' },
          { label: 'Credits', count: `${(creditsTotal - creditsUsed).toLocaleString()} left`, color: '#10b981', icon: '💎' },
          { label: 'TTS Available', count: '~200 min', color: '#3b82f6', icon: '🎙️' },
          { label: 'Images/Video', count: '198 img / 211s vid', color: '#ec4899', icon: '🎬' },
        ].map((s, i) => (
          <div className="stat-card" key={i}>
            <div className="stat-card-header"><span className="label">{s.label}</span><span className="icon" style={{ background: `${s.color}20`, fontSize: 18 }}>{s.icon}</span></div>
            <div className="value" style={{ color: s.color, fontSize: typeof s.count === 'string' && s.count.length > 10 ? 14 : 18 }}>{s.count}</div>
          </div>
        ))}
      </div>

      {/* Credits Bar */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-body" style={{ padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>Monthly Credits: {creditsUsed.toLocaleString()} / {creditsTotal.toLocaleString()}</span>
            <span style={{ fontSize: 12, color: creditsPercent > 80 ? '#ef4444' : '#10b981', fontWeight: 700 }}>{creditsPercent}% used</span>
          </div>
          <div style={{ height: 8, background: 'var(--bg-secondary)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${creditsPercent}%`, background: creditsPercent > 80 ? '#ef4444' : 'var(--gradient-primary)', borderRadius: 4, transition: 'width 0.3s' }} />
          </div>
        </div>
      </div>

      {/* All Capabilities Grid */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header"><h3>🚀 Creator Plan — All Features Unlocked</h3></div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            {CAPABILITIES.map(cap => (
              <div key={cap.id} onClick={() => setActiveTab(cap.tab)} style={{
                padding: 12, borderRadius: 10, cursor: 'pointer',
                background: activeTab === cap.tab ? `${cap.color}15` : 'var(--bg-secondary)',
                border: `1px solid ${activeTab === cap.tab ? cap.color + '60' : 'var(--border)'}`,
              }}>
                <div style={{ fontSize: 22, marginBottom: 4 }}>{cap.icon}</div>
                <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 2 }}>{cap.name}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>{cap.desc}</div>
                <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: `${cap.color}20`, color: cap.color }}>✅ Active</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="section-grid equal" style={{ marginBottom: 24 }}>
        {/* Config */}
        <div className="card">
          <div className="card-header"><h3>🔑 Config</h3></div>
          <div className="card-body">
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>API Key</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <input type={showKey ? 'text' : 'password'} value={elKey} onChange={e => setElKey(e.target.value)} placeholder="sk_..."
                style={{ flex: 1, padding: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13 }} />
              <button onClick={() => setShowKey(!showKey)} style={{ padding: '8px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-muted)', cursor: 'pointer' }}>{showKey ? '🙈' : '👁️'}</button>
            </div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>TTS Model</label>
            {VOICE_MODELS.map(m => (
              <div key={m.id} onClick={() => setSelectedModel(m.id)} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: 8, borderRadius: 8, marginBottom: 3, cursor: 'pointer',
                border: selectedModel === m.id ? '1px solid var(--accent-purple)' : '1px solid var(--border)',
                background: selectedModel === m.id ? 'rgba(124,58,237,0.08)' : 'var(--bg-secondary)',
              }}>
                <div style={{ width: 14, height: 14, borderRadius: '50%', border: selectedModel === m.id ? '4px solid var(--accent-purple)' : '2px solid var(--border)' }} />
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{m.name}</span>{m.recommended && <span style={{ fontSize: 9, color: '#10b981', marginLeft: 4 }}>⭐ REC</span>}
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{m.desc}</div>
                </div>
              </div>
            ))}
            <button onClick={handleSaveKey} className="topbar-btn primary" style={{ width: '100%', justifyContent: 'center', marginTop: 10 }}>{saved ? '✅ Saved!' : '💾 Save'}</button>
          </div>
        </div>

        {/* Voice Selection */}
        <div className="card">
          <div className="card-header">
            <h3>🎙️ Voices</h3>
            <button onClick={fetchVoices} disabled={loadingVoices} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              {loadingVoices ? '⏳' : '🔄 Load Voices'}
            </button>
          </div>
          <div className="card-body">
            <div style={{ maxHeight: 280, overflowY: 'auto' }}>
              {(voices.length > 0 ? voices.map(v => ({ id: v.voice_id, name: v.name, desc: `${v.labels?.accent||''} ${v.labels?.gender||''} · ${v.category||'premade'}` })) : PRESET_VOICES).map(v => (
                <div key={v.id} onClick={() => setSelectedVoice(v.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: 8, borderRadius: 8, marginBottom: 3, cursor: 'pointer',
                  border: selectedVoice === v.id ? '1px solid var(--accent-purple)' : '1px solid var(--border)',
                  background: selectedVoice === v.id ? 'rgba(124,58,237,0.08)' : 'var(--bg-secondary)',
                }}>
                  <div style={{ width: 12, height: 12, borderRadius: '50%', border: selectedVoice === v.id ? '4px solid var(--accent-purple)' : '2px solid var(--border)' }} />
                  <div><div style={{ fontSize: 12, fontWeight: 600 }}>{v.name}</div><div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{v.desc}</div></div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10, padding: 10, background: 'rgba(124,58,237,0.08)', borderRadius: 8, fontSize: 11, color: 'var(--text-secondary)' }}>
              🧬 <strong>Pro Voice Clone:</strong> Upload voice samples in <a href="https://elevenlabs.io/app/voice-lab" target="_blank" style={{ color: 'var(--accent-purple-light)' }}>Voice Lab</a> to create your AI influencer voice, then load voices here.
            </div>
          </div>
        </div>
      </div>

      {/* Generation Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { id: 'voice', label: '🎙️ Voiceover', color: '#10b981' },
          { id: 'image', label: '🖼️ Image', color: '#8b5cf6' },
          { id: 'video', label: '🎬 Video', color: '#3b82f6' },
          { id: 'sfx', label: '🔊 Sound FX', color: '#f59e0b' },
          { id: 'music', label: '🎵 Music', color: '#06b6d4' },
        ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
            background: activeTab === t.id ? `${t.color}20` : 'var(--bg-card)',
            border: activeTab === t.id ? `2px solid ${t.color}` : '1px solid var(--border)',
            color: activeTab === t.id ? t.color : 'var(--text-secondary)',
          }}>{t.label}</button>
        ))}
      </div>

      {/* VOICE TAB */}
      {activeTab === 'voice' && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header"><h3>🎤 Generate Voiceover → Content Queue</h3></div>
          <div className="card-body">
            <div style={{ padding: 10, background: 'rgba(16,185,129,0.08)', borderRadius: 8, marginBottom: 12, fontSize: 12, color: 'var(--text-secondary)', border: '1px solid rgba(16,185,129,0.2)' }}>
              💡 Voiceover → saved to Audio Library + Content Queue → Approve → Schedule → Post to TikTok/YouTube
            </div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>Title</label>
                <input type="text" value={ttsTitle} onChange={e => setTtsTitle(e.target.value)} placeholder="Night Owl Hook #1"
                  style={{ width: '100%', padding: 8, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12 }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>Platform</label>
                <div style={{ display: 'flex', gap: 4 }}>
                  {['tiktok','youtube'].map(p => (
                    <button key={p} onClick={() => setSelectedPlatform(p)} style={{
                      padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 11,
                      border: selectedPlatform === p ? 'none' : '1px solid var(--border)',
                      background: selectedPlatform === p ? (p === 'youtube' ? 'rgba(239,68,68,0.2)' : 'rgba(37,244,238,0.1)') : 'var(--bg-secondary)',
                      color: selectedPlatform === p ? (p === 'youtube' ? '#ef4444' : '#25f4ee') : 'var(--text-muted)',
                    }}>{p === 'youtube' ? '▶ YT' : '♪ TT'}</button>
                  ))}
                </div>
              </div>
            </div>
            <textarea value={ttsText} onChange={e => setTtsText(e.target.value)} placeholder="Paste a script or write narration..."
              style={{ width: '100%', height: 110, padding: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-primary)', fontSize: 13, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }} />
            <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
              {[
                { l: '🦉 Night Owl', t: '3 AM. Everyone\'s asleep. But not you. You just got off shift and the world is quiet. Sound familiar? Midnight Singles was built for people like us — night owls, night shift workers. Download free. Find your person.' },
                { l: '💰 Free Dating', t: 'Stop paying $30 a month just to swipe right. Midnight Singles is 100% free. Video speed dating, AI matching, icebreaker games. Every new user gets a free video minute.' },
                { l: '🎥 Speed Date', t: '5 minutes. One video call. That\'s all it takes to know if there\'s chemistry. Speed dating rooms live every night. No awkward texting for weeks. Just real connection, face to face.' },
              ].map((q,i) => (
                <button key={i} onClick={() => { setTtsText(q.t); setTtsTitle(q.l); }} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 10, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)', cursor: 'pointer' }}>{q.l}</button>
              ))}
            </div>
            <button onClick={handleGenerateTTS} disabled={generating || !ttsText.trim()} className="topbar-btn primary" style={{ width: '100%', justifyContent: 'center', padding: 12, marginTop: 12, fontSize: 14 }}>
              {generating ? '⏳ Generating...' : <><Sparkles size={16} /> Generate Voiceover → Queue</>}
            </button>
            {error && <p style={{ color: 'var(--accent-red)', fontSize: 12, marginTop: 8 }}>{error}</p>}
          </div>
        </div>
      )}

      {/* IMAGE TAB */}
      {activeTab === 'image' && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header"><h3>🖼️ Generate Image → Content Queue</h3></div>
          <div className="card-body">
            <div style={{ padding: 10, background: 'rgba(139,92,246,0.08)', borderRadius: 8, marginBottom: 12, fontSize: 12, color: 'var(--text-secondary)', border: '1px solid rgba(139,92,246,0.2)' }}>
              💡 ~198 images/month included. Great for AI character portraits, thumbnails, social posts. Images save to Content Queue.
            </div>
            <textarea value={imagePrompt} onChange={e => setImagePrompt(e.target.value)} placeholder="Describe the image... e.g. 'A stylish diverse woman checking her phone at 3am, city lights through the window, purple and gold tones, cinematic'"
              style={{ width: '100%', height: 100, padding: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-primary)', fontSize: 13, resize: 'vertical', fontFamily: 'inherit' }} />
            <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
              {['AI influencer character portrait, attractive, nighttime vibe', 'Night shift nurse checking dating app on break, warm lighting', 'Couple video chatting at midnight, split screen, cozy room', 'Phone mockup showing Midnight Singles app UI, dark theme'].map(q => (
                <button key={q} onClick={() => setImagePrompt(q)} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 10, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)', cursor: 'pointer' }}>{q.slice(0,40)}...</button>
              ))}
            </div>
            <button onClick={handleGenerateImage} disabled={generating || !imagePrompt.trim()} className="topbar-btn primary" style={{ width: '100%', justifyContent: 'center', padding: 12, marginTop: 12 }}>
              {generating ? '⏳ Generating...' : <><Sparkles size={16} /> Generate Image → Queue</>}
            </button>
            {error && <p style={{ color: 'var(--accent-red)', fontSize: 12, marginTop: 8 }}>{error}</p>}
          </div>
        </div>
      )}

      {/* VIDEO TAB */}
      {activeTab === 'video' && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header"><h3>🎬 Generate Video → Content Queue</h3></div>
          <div className="card-body">
            <div style={{ padding: 10, background: 'rgba(59,130,246,0.08)', borderRadius: 8, marginBottom: 12, fontSize: 12, color: 'var(--text-secondary)', border: '1px solid rgba(59,130,246,0.2)' }}>
              💡 ~211 seconds of video/month. Create AI character talking videos, promo clips, lip-synced content. Videos save to Content Queue.
            </div>
            <textarea value={videoPrompt} onChange={e => setVideoPrompt(e.target.value)} placeholder="Describe the video... e.g. 'An AI character talking to camera about night shift dating, midnight cityscape background'"
              style={{ width: '100%', height: 100, padding: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-primary)', fontSize: 13, resize: 'vertical', fontFamily: 'inherit' }} />
            <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
              {['AI influencer talking about night shift dating', 'Phone scrolling through dating app at 3am', 'Cinematic city at night with text overlays'].map(q => (
                <button key={q} onClick={() => setVideoPrompt(q)} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 10, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)', cursor: 'pointer' }}>{q.slice(0,45)}</button>
              ))}
            </div>
            <button onClick={handleGenerateVideo} disabled={generating || !videoPrompt.trim()} className="topbar-btn primary" style={{ width: '100%', justifyContent: 'center', padding: 12, marginTop: 12 }}>
              {generating ? '⏳ Generating...' : <><Sparkles size={16} /> Generate Video → Queue</>}
            </button>

            <div style={{ marginTop: 16, padding: 14, background: 'rgba(239,68,68,0.08)', borderRadius: 10, border: '1px solid rgba(239,68,68,0.2)' }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>👄 Lip Sync Pipeline</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                1. Generate AI character image (Image tab)<br/>
                2. Generate voiceover script (Voice tab)<br/>
                3. Use ElevenLabs <a href="https://elevenlabs.io/app/lip-sync" target="_blank" style={{ color: '#ef4444' }}>Lip Sync tool</a> to combine image + audio → talking video<br/>
                4. Download and upload here → Content Queue → Post!
              </div>
            </div>

            {error && <p style={{ color: 'var(--accent-red)', fontSize: 12, marginTop: 8 }}>{error}</p>}
          </div>
        </div>
      )}

      {/* SFX TAB */}
      {activeTab === 'sfx' && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header"><h3>🔊 Generate Sound Effects</h3></div>
          <div className="card-body">
            <div style={{ padding: 10, background: 'rgba(245,158,11,0.08)', borderRadius: 8, marginBottom: 12, fontSize: 12, color: 'var(--text-secondary)', border: '1px solid rgba(245,158,11,0.2)' }}>
              💡 Create custom sound effects for your videos — transitions, whooshes, ambient sounds, notification pings.
            </div>
            <textarea value={sfxPrompt} onChange={e => setSfxPrompt(e.target.value)} placeholder="Describe the sound... e.g. 'Soft notification ping with a magical shimmer'"
              style={{ width: '100%', height: 80, padding: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-primary)', fontSize: 13, resize: 'vertical', fontFamily: 'inherit' }} />
            <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
              {['Soft magical notification ping', 'Cinematic whoosh transition', 'Midnight clock chime, 3 AM', 'Heart match sound effect, romantic', 'City ambiance at night, distant traffic'].map(q => (
                <button key={q} onClick={() => setSfxPrompt(q)} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 10, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)', cursor: 'pointer' }}>{q}</button>
              ))}
            </div>
            <button onClick={handleGenerateSFX} disabled={generating || !sfxPrompt.trim()} className="topbar-btn primary" style={{ width: '100%', justifyContent: 'center', padding: 12, marginTop: 12 }}>
              {generating ? '⏳ Generating...' : <><Sparkles size={16} /> Generate Sound Effect</>}
            </button>
            {error && <p style={{ color: 'var(--accent-red)', fontSize: 12, marginTop: 8 }}>{error}</p>}
          </div>
        </div>
      )}

      {/* MUSIC TAB */}
      {activeTab === 'music' && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header"><h3>🎵 Music Generation</h3></div>
          <div className="card-body">
            <div style={{ padding: 10, background: 'rgba(6,182,212,0.08)', borderRadius: 8, marginBottom: 12, fontSize: 12, color: 'var(--text-secondary)', border: '1px solid rgba(6,182,212,0.2)' }}>
              💡 Commercial use included! Create background music for videos. Use the <a href="https://elevenlabs.io/app/music" target="_blank" style={{ color: '#06b6d4' }}>ElevenLabs Music Studio</a> for full control, or generate here.
            </div>
            <textarea value={musicPrompt} onChange={e => setMusicPrompt(e.target.value)} placeholder="Describe the music... e.g. 'Chill lo-fi beat, midnight vibes, soft piano and drums, romantic mood'"
              style={{ width: '100%', height: 80, padding: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-primary)', fontSize: 13, resize: 'vertical', fontFamily: 'inherit' }} />
            <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
              {['Lo-fi midnight chill beat, romantic', 'Upbeat TikTok energy, modern pop', 'Cinematic emotional piano, dating ad', 'Night city ambient electronica'].map(q => (
                <button key={q} onClick={() => setMusicPrompt(q)} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 10, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)', cursor: 'pointer' }}>{q}</button>
              ))}
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12 }}>🎵 Music generation works best through the <a href="https://elevenlabs.io/app/music" target="_blank" style={{ color: '#06b6d4' }}>ElevenLabs Music app</a> — download and add to your library here.</p>
          </div>
        </div>
      )}

      {/* Content Queue */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
        {['all','pending','approved','posted','rejected'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
            background: filter === f ? 'var(--accent-purple)' : 'var(--bg-card)', border: '1px solid var(--border)',
            color: filter === f ? 'white' : 'var(--text-secondary)',
          }}>{f === 'all' ? `All (${audioLibrary.length})` : `${f.charAt(0).toUpperCase()+f.slice(1)} (${audioLibrary.filter(a=>a.status===f).length})`}</button>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header"><h3>📋 ElevenLabs Content Queue ({filtered.length})</h3></div>
        <div className="card-body">
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>
              {filter === 'all' ? '🎬 No content yet. Generate your first piece above!' : `No ${filter} items.`}
            </div>
          ) : filtered.map(item => {
            const st = statusConfig[item.status] || statusConfig.pending;
            const isPlayable = item.type === 'voiceover' || item.type === 'sfx' || item.type === 'music';
            return (
              <div key={item.id} style={{ padding: 14, marginBottom: 10, background: 'var(--bg-secondary)', borderRadius: 12, border: `1px solid ${item.status === 'approved' ? 'rgba(16,185,129,0.3)' : 'var(--border)'}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  {isPlayable && (
                    <button onClick={() => togglePlay(item.id, item.dataUrl)} style={{
                      width: 36, height: 36, borderRadius: '50%', background: playingId === item.id ? '#ef4444' : 'var(--gradient-primary)', border: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', flexShrink: 0,
                    }}>{playingId === item.id ? <Pause size={14} /> : <Play size={14} />}</button>
                  )}
                  {item.type === 'image' && item.dataUrl && (
                    <img src={item.dataUrl} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover' }} />
                  )}
                  <span style={{ fontSize: 18 }}>{typeIcons[item.type] || '📄'}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{item.title}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{new Date(item.createdAt).toLocaleString()}</div>
                  </div>
                  <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: item.platform === 'youtube' ? 'rgba(239,68,68,0.2)' : 'rgba(37,244,238,0.1)', color: item.platform === 'youtube' ? '#ef4444' : '#25f4ee' }}>
                    {item.platform === 'youtube' ? '▶ YT' : '♪ TT'}
                  </span>
                  <span style={{ fontSize: 10, padding: '2px 10px', borderRadius: 6, fontWeight: 600, background: st.bg, color: st.color }}>{st.label}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', padding: 8, background: 'var(--bg-card)', borderRadius: 6, marginBottom: 8, lineHeight: 1.5 }}>
                  {item.text?.length > 150 ? item.text.slice(0,150) + '...' : item.text}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {item.status === 'pending' && <>
                    <button onClick={() => handleApprove(item.id)} style={{ padding: '6px 14px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)', color: '#10b981' }}><ThumbsUp size={12} /> Approve</button>
                    <button onClick={() => handleReject(item.id)} style={{ padding: '6px 14px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}><ThumbsDown size={12} /> Reject</button>
                  </>}
                  {item.status === 'approved' && (
                    <button onClick={() => handleMarkPosted(item.id)} style={{ padding: '6px 18px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, background: 'var(--gradient-primary)', border: 'none', color: 'white' }}><Send size={12} /> Mark Posted</button>
                  )}
                  {item.status === 'rejected' && (
                    <button onClick={() => handleApprove(item.id)} style={{ padding: '6px 12px', borderRadius: 8, fontSize: 11, cursor: 'pointer', background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>↩ Reapprove</button>
                  )}
                  <button onClick={() => downloadFile(item.dataUrl, `msi-${item.type}-${item.id}.${item.type === 'image' ? 'png' : item.type === 'video' ? 'mp4' : 'mp3'}`)} style={{ padding: '6px 12px', borderRadius: 8, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}><Download size={12} /> Download</button>
                  <button onClick={() => handleDelete(item.id)} style={{ padding: '6px 10px', borderRadius: 8, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', marginLeft: 'auto' }}><Trash2 size={12} /></button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* AI Influencer Pipeline */}
      <div className="card">
        <div className="card-header"><h3>🤖 AI Influencer Pipeline — Full Creator Plan</h3></div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
            {[
              { step: '1', icon: '📝', title: 'Script', desc: 'Marketing Agent or write your own', color: '#7c3aed' },
              { step: '2', icon: '🧬', title: 'Clone Voice', desc: 'Pro Voice Clone your AI character', color: '#d946ef' },
              { step: '3', icon: '🎙️', title: 'Voiceover', desc: 'Generate narration audio', color: '#10b981' },
              { step: '4', icon: '🖼️', title: 'Character', desc: 'Generate AI character image', color: '#8b5cf6' },
              { step: '5', icon: '👄', title: 'Lip Sync', desc: 'Make character talk!', color: '#ef4444' },
              { step: '6', icon: '🚀', title: 'Post', desc: 'Approve & post everywhere', color: '#3b82f6' },
            ].map(s => (
              <div key={s.step} style={{ textAlign: 'center', padding: 12, background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 26, marginBottom: 4 }}>{s.icon}</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: s.color }}>Step {s.step}</div>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 2 }}>{s.title}</div>
                <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{s.desc}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14, padding: 12, background: 'rgba(124,58,237,0.08)', borderRadius: 10, border: '1px solid rgba(124,58,237,0.2)' }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>💰 Monthly Budget at Creator Plan ($22/mo)</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
              <div style={{ padding: 8, background: 'var(--bg-card)', borderRadius: 6, textAlign: 'center' }}><div style={{ fontWeight: 700, color: '#10b981' }}>~200 min</div>TTS (Flash)</div>
              <div style={{ padding: 8, background: 'var(--bg-card)', borderRadius: 6, textAlign: 'center' }}><div style={{ fontWeight: 700, color: '#8b5cf6' }}>~198</div>Images</div>
              <div style={{ padding: 8, background: 'var(--bg-card)', borderRadius: 6, textAlign: 'center' }}><div style={{ fontWeight: 700, color: '#3b82f6' }}>~211 sec</div>Video</div>
              <div style={{ padding: 8, background: 'var(--bg-card)', borderRadius: 6, textAlign: 'center' }}><div style={{ fontWeight: 700, color: '#7c3aed' }}>100K</div>Credits</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
