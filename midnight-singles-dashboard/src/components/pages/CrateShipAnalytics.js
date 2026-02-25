'use client';
import { BarChart3 } from 'lucide-react';
export default function CrateShipAnalytics() {
  return (
    <>
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-card-header"><span className="label">YouTube Subscribers</span><span style={{ fontSize: 18 }}>▶</span></div><div className="value">0</div></div>
        <div className="stat-card"><div className="stat-card-header"><span className="label">TikTok Followers</span><span style={{ fontSize: 18 }}>♪</span></div><div className="value">0</div></div>
        <div className="stat-card"><div className="stat-card-header"><span className="label">Website Visits</span><span style={{ fontSize: 18 }}>🌐</span></div><div className="value">—</div></div>
        <div className="stat-card"><div className="stat-card-header"><span className="label">App Sales</span><span style={{ fontSize: 18 }}>💰</span></div><div className="value">—</div></div>
      </div>
      <div className="card"><div className="card-body" style={{ textAlign: 'center', padding: 64, color: 'var(--text-muted)' }}>
        <BarChart3 size={48} style={{ marginBottom: 16, opacity: 0.3 }} />
        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)' }}>Analytics Coming Soon</h3>
        <p style={{ fontSize: 13 }}>Once YouTube and TikTok are connected, analytics will populate here.</p>
      </div></div>
    </>
  );
}
