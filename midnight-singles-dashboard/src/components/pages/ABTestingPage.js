'use client';
import { useState } from 'react';
import { Sparkles, ThumbsUp, Copy } from 'lucide-react';
import { getConfig } from '@/lib/store';

export default function ABTestingPage() {
  const [theme, setTheme] = useState('free-dating');
  const [platform, setPlatform] = useState('tiktok');
  const [hooks, setHooks] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [winner, setWinner] = useState(null);
  const [copied, setCopied] = useState(null);

  const themes = [
    { id: 'free-dating', name: '🆓 Free Dating' },
    { id: 'speed-dating', name: '🎥 Speed Dating' },
    { id: 'ai-matching', name: '🧠 AI Matching' },
    { id: 'international', name: '🌍 International' },
    { id: 'games-fun', name: '🎮 Games' },
    { id: 'verification', name: '✅ Verification' },
    { id: 'dating-tips', name: '💡 Dating Tips' },
  ];

  const generateHooks = async () => {
    const config = getConfig();
    if (!config.openRouterKey) return;
    setGenerating(true); setWinner(null); setHooks([]);

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${config.openRouterKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'anthropic/claude-opus-4.6',
          messages: [{ role: 'user', content: `Generate 3 different viral hooks for a 15-second ${platform === 'youtube' ? 'YouTube Short' : 'TikTok'} promoting "Midnight Singles International" — a FREE dating app with video speed dating.

THEME: ${theme}

KEY FEATURES: 100% free, 1 free video minute on signup, live speed dating rooms, AI personality matching, international with translation, icebreaker games, selfie verification.

Each hook should be COMPLETELY different in approach:
- Hook A: Controversial / pattern interrupt
- Hook B: Curiosity / question-based  
- Hook C: Story / POV-based

Return ONLY valid JSON array:
[
  {"id":"A","style":"Controversial","hook":"the hook text","why":"why this works in 1 sentence"},
  {"id":"B","style":"Curiosity","hook":"the hook text","why":"why this works"},
  {"id":"C","style":"Story/POV","hook":"the hook text","why":"why this works"}
]` }],
          temperature: 1.0,
        }),
      });
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      const match = content.match(/\[[\s\S]*\]/);
      if (match) setHooks(JSON.parse(match[0]));
    } catch (e) { console.error(e); }
    setGenerating(false);
  };

  const handleCopy = (text, id) => { navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(null), 2000); };

  return (
    <>
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header"><h3>🎯 A/B Hook Testing</h3></div>
        <div className="card-body">
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
            The first 2 seconds decide if someone watches or scrolls. Generate 3 different hooks and pick the winner.
          </p>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>Theme</label>
              <select value={theme} onChange={e => setTheme(e.target.value)} style={{ width: '100%', padding: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13 }}>
                {themes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>Platform</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {['youtube', 'tiktok'].map(p => (
                  <button key={p} onClick={() => setPlatform(p)} style={{ flex: 1, padding: 10, borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13, border: platform === p ? 'none' : '1px solid var(--border)', background: platform === p ? (p === 'youtube' ? 'rgba(239,68,68,0.2)' : 'rgba(37,244,238,0.1)') : 'var(--bg-secondary)', color: platform === p ? (p === 'youtube' ? '#ef4444' : '#25f4ee') : 'var(--text-muted)' }}>
                    {p === 'youtube' ? '▶ YT' : '♪ TT'}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <button onClick={generateHooks} disabled={generating} className="topbar-btn primary" style={{ width: '100%', justifyContent: 'center', padding: 14, fontSize: 14 }}>
            {generating ? '⏳ Generating 3 hooks...' : <><Sparkles size={16} /> Generate 3 Hook Variations</>}
          </button>
        </div>
      </div>

      {hooks.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {hooks.map((h) => (
            <div key={h.id} onClick={() => setWinner(h.id)} style={{
              padding: 20, background: winner === h.id ? 'rgba(16,185,129,0.08)' : 'var(--bg-card)',
              border: winner === h.id ? '2px solid #10b981' : '1px solid var(--border)',
              borderRadius: 12, cursor: 'pointer', transition: 'all 0.15s',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 24, fontWeight: 800 }}>Hook {h.id}</span>
                <span style={{ fontSize: 10, padding: '3px 10px', borderRadius: 6, background: 'var(--bg-secondary)', color: 'var(--text-muted)', fontWeight: 600 }}>{h.style}</span>
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.4, marginBottom: 12, minHeight: 60 }}>"{h.hook}"</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>💡 {h.why}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={(e) => { e.stopPropagation(); setWinner(h.id); }} style={{
                  flex: 1, padding: 8, borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  background: winner === h.id ? '#10b981' : 'rgba(16,185,129,0.15)', border: winner === h.id ? 'none' : '1px solid rgba(16,185,129,0.3)',
                  color: winner === h.id ? 'white' : '#10b981',
                }}>{winner === h.id ? '👑 Winner!' : 'Pick This'}</button>
                <button onClick={(e) => { e.stopPropagation(); handleCopy(h.hook, h.id); }} style={{
                  padding: '8px 12px', borderRadius: 6, fontSize: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', cursor: 'pointer',
                }}>{copied === h.id ? '✅' : <Copy size={12} />}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {winner && (
        <div className="card" style={{ marginTop: 24 }}>
          <div className="card-body" style={{ textAlign: 'center', padding: 24 }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>👑 Hook {winner} selected as winner</div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Go to Marketing Agent → use this hook as inspiration when generating your next post.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
