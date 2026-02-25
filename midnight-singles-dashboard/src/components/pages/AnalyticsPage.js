'use client';
import { BarChart3 } from 'lucide-react';

export default function AnalyticsPage() {
  return (
    <>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card-header"><span className="label">YouTube Subscribers</span><span className="icon" style={{ background: 'rgba(239,68,68,0.12)', fontSize: 18 }}>▶</span></div>
          <div className="value">0</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-header"><span className="label">TikTok Followers</span><span className="icon" style={{ background: 'rgba(37,244,238,0.08)', fontSize: 18 }}>♪</span></div>
          <div className="value">0</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-header"><span className="label">Total Views</span><span className="icon" style={{ background: 'rgba(124,58,237,0.12)', fontSize: 18 }}>👁</span></div>
          <div className="value">0</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-header"><span className="label">App Downloads</span><span className="icon" style={{ background: 'rgba(16,185,129,0.12)', fontSize: 18 }}>📲</span></div>
          <div className="value">0</div>
        </div>
      </div>

      <div className="card">
        <div className="card-body" style={{ textAlign: 'center', padding: 64, color: 'var(--text-muted)' }}>
          <BarChart3 size={48} style={{ marginBottom: 16, opacity: 0.3 }} />
          <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)' }}>Analytics Will Populate</h3>
          <p style={{ fontSize: 13, maxWidth: 400, margin: '0 auto' }}>
            Once YouTube and TikTok accounts are connected, real-time analytics will display here — views, engagement, follower growth, and app download attribution.
          </p>
        </div>
      </div>
    </>
  );
}
