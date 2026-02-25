'use client';
import { Users, Video, Heart, TrendingUp, ArrowUp, ArrowDown } from 'lucide-react';

const stats = [
  { label: 'Total Users', value: '0', change: '+0%', up: true, icon: '👥', bg: 'rgba(124,58,237,0.12)' },
  { label: 'Speed Dates Today', value: '0', change: '+0%', up: true, icon: '🎥', bg: 'rgba(236,72,153,0.12)' },
  { label: 'Matches Made', value: '0', change: '+0%', up: true, icon: '💜', bg: 'rgba(16,185,129,0.12)' },
  { label: 'Content Published', value: '0', change: '—', up: true, icon: '📈', bg: 'rgba(245,158,11,0.12)' },
];

const recentActivity = [
  { time: 'Now', text: '🚀 Dashboard launched — Midnight Singles Command Center is live' },
  { time: '—', text: '🤖 Marketing agent ready — awaiting OpenRouter API key' },
  { time: '—', text: '📱 Admin panel connector — ready for integration' },
  { time: '—', text: '🎬 Video pipeline — researching SeedDance 2.0 integration' },
];

const contentQueue = [
  { emoji: '🎥', title: 'Speed Dating Feature Reveal', subtitle: 'YouTube Short · 15s video', status: 'draft' },
  { emoji: '💬', title: '"Free Dating" Value Prop', subtitle: 'TikTok · Image + text overlay', status: 'draft' },
  { emoji: '🌍', title: 'International Connections', subtitle: 'YouTube Short · Montage', status: 'draft' },
  { emoji: '🎮', title: 'Icebreaker Games Showcase', subtitle: 'TikTok · Screen recording style', status: 'draft' },
  { emoji: '✨', title: 'Virtual Gift Store Preview', subtitle: 'YouTube Short · Animated', status: 'draft' },
];

export default function OverviewPage() {
  return (
    <>
      <div className="stats-grid">
        {stats.map((s, i) => (
          <div className="stat-card" key={i}>
            <div className="stat-card-header">
              <span className="label">{s.label}</span>
              <span className="icon" style={{ background: s.bg, fontSize: '18px' }}>{s.icon}</span>
            </div>
            <div className="value">{s.value}</div>
            <div className={`change ${s.up ? 'up' : 'down'}`}>
              {s.up ? <ArrowUp size={12} /> : <ArrowDown size={12} />} {s.change} from last week
            </div>
          </div>
        ))}
      </div>

      <div className="section-grid">
        <div className="card">
          <div className="card-header">
            <h3>📋 Content Queue</h3>
            <button className="see-all">View all →</button>
          </div>
          <div className="card-body">
            {contentQueue.map((item, i) => (
              <div className="list-item" key={i}>
                <div className="thumbnail">{item.emoji}</div>
                <div className="info">
                  <div className="title">{item.title}</div>
                  <div className="subtitle">{item.subtitle}</div>
                </div>
                <span className={`status ${item.status}`}>{item.status}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3>⚡ Activity</h3>
          </div>
          <div className="card-body">
            {recentActivity.map((a, i) => (
              <div className="activity-item" key={i}>
                <span className="time">{a.time}</span>
                <span>{a.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="section-grid equal">
        <div className="card">
          <div className="card-header">
            <h3>🎯 App Differentiators</h3>
          </div>
          <div className="card-body" style={{ fontSize: '13px', lineHeight: '1.8' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid rgba(42,42,64,0.3)' }}>
              <span style={{ fontSize: 20 }}>🆓</span>
              <div><strong>100% Free Core</strong> — No paywall to match & chat</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid rgba(42,42,64,0.3)' }}>
              <span style={{ fontSize: 20 }}>🎥</span>
              <div><strong>Video Speed Dating</strong> — Live themed rooms (Lounge, Candlelight, VIP)</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid rgba(42,42,64,0.3)' }}>
              <span style={{ fontSize: 20 }}>🧠</span>
              <div><strong>AI Matching</strong> — Big Five personality + multi-factor scoring</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid rgba(42,42,64,0.3)' }}>
              <span style={{ fontSize: 20 }}>🌍</span>
              <div><strong>International</strong> — Built-in translation, cultural matching</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid rgba(42,42,64,0.3)' }}>
              <span style={{ fontSize: 20 }}>🎮</span>
              <div><strong>Entertainment</strong> — Games, quizzes, horoscopes, social feed</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
              <span style={{ fontSize: 20 }}>🎁</span>
              <div><strong>Gift Economy</strong> — Virtual gifts + store</div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3>🚀 Launch Checklist</h3>
          </div>
          <div className="card-body" style={{ fontSize: '13px' }}>
            {[
              { done: true, text: 'Build command center dashboard' },
              { done: false, text: 'Create midnightsingles email account' },
              { done: false, text: 'Set up YouTube channel' },
              { done: false, text: 'Set up TikTok account' },
              { done: false, text: 'Connect OpenRouter API key' },
              { done: false, text: 'Configure video generation (SeedDance 2.0)' },
              { done: false, text: 'Build content marketing agent' },
              { done: false, text: 'Connect Firebase admin panel' },
              { done: false, text: 'First batch of content generated' },
              { done: false, text: 'Daily auto-posting pipeline live' },
            ].map((item, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
                borderBottom: '1px solid rgba(42,42,64,0.3)',
                color: item.done ? 'var(--accent-green)' : 'var(--text-secondary)'
              }}>
                <span style={{ fontSize: 16 }}>{item.done ? '✅' : '⬜'}</span>
                <span style={{ textDecoration: item.done ? 'line-through' : 'none' }}>{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
