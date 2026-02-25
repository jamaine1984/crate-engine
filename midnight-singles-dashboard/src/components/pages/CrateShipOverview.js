'use client';
import { ArrowUp, ExternalLink } from 'lucide-react';

const stats = [
  { label: 'App Templates', value: '57', icon: '📱', bg: 'rgba(245,158,11,0.12)' },
  { label: 'Live Demos', value: '4', icon: '🎮', bg: 'rgba(16,185,129,0.12)' },
  { label: 'Starting Price', value: '$1K', icon: '💰', bg: 'rgba(124,58,237,0.12)' },
  { label: 'Delivery Time', value: '15d', icon: '⚡', bg: 'rgba(236,72,153,0.12)' },
];

const featuredApps = [
  { name: 'Nurse Singles International', category: 'Dating', price: '$3,000', emoji: '💗' },
  { name: 'Speech Sprouts AI', category: 'Healthcare', price: '$1,500', emoji: '🗣️' },
  { name: 'GlowBook', category: 'Spa & Wellness', price: '$1,000', emoji: '💆' },
  { name: 'PulseFit Pro', category: 'Fitness & Gym', price: '$1,500', emoji: '🏋️' },
  { name: 'TasteBud', category: 'Restaurant & Food', price: '$1,500', emoji: '🍽️' },
  { name: 'NestKey', category: 'Real Estate', price: '$1,500', emoji: '🏠' },
  { name: 'FaithConnect', category: 'Church & Ministry', price: '$1,500', emoji: '⛪' },
  { name: 'CleanSlate', category: 'Cleaning Services', price: '$1,000', emoji: '🧹' },
];

const contentIdeas = [
  { platform: 'youtube', title: '"Launch Your Own App in 15 Days"', priority: 'high' },
  { platform: 'tiktok', title: '"$1000 for a Full Custom App??"', priority: 'high' },
  { platform: 'youtube', title: 'Live Demo Walkthrough — Dating App', priority: 'high' },
  { platform: 'tiktok', title: '"57 Apps, Pick One, We Brand It"', priority: 'medium' },
  { platform: 'tiktok', title: '"No Code Needed" App Launch', priority: 'medium' },
  { platform: 'youtube', title: 'How White-Label Apps Work (Explained)', priority: 'medium' },
];

export default function CrateShipOverview() {
  return (
    <>
      <div className="stats-grid">
        {stats.map((s, i) => (
          <div className="stat-card" key={i}>
            <div className="stat-card-header">
              <span className="label">{s.label}</span>
              <span className="icon" style={{ background: s.bg, fontSize: 18 }}>{s.icon}</span>
            </div>
            <div className="value">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="section-grid">
        <div className="card">
          <div className="card-header">
            <h3>📱 Featured Apps</h3>
            <a href="https://www.crateshipstudios.com" target="_blank" className="see-all" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              Visit Site <ExternalLink size={11} />
            </a>
          </div>
          <div className="card-body">
            {featuredApps.map((app, i) => (
              <div className="list-item" key={i}>
                <div className="thumbnail">{app.emoji}</div>
                <div className="info">
                  <div className="title">{app.name}</div>
                  <div className="subtitle">{app.category}</div>
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-green)' }}>{app.price}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3>🎬 Content Ideas</h3></div>
          <div className="card-body">
            {contentIdeas.map((item, i) => (
              <div className="list-item" key={i}>
                <span className={`platform-badge ${item.platform}`}>{item.platform === 'youtube' ? '▶ YT' : '♪ TT'}</span>
                <div className="info">
                  <div className="title">{item.title}</div>
                </div>
                <span className={`status ${item.priority === 'high' ? 'generating' : 'scheduled'}`}>{item.priority}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recommendations */}
      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-header"><h3>💡 Za's Recommendations for CrateShip</h3></div>
        <div className="card-body" style={{ fontSize: 13, lineHeight: 1.8 }}>
          {[
            { icon: '🎥', title: 'Video Demos > Screenshots', desc: 'Record 15-sec screen captures of each live demo — these will CRUSH on TikTok. "POV: You just bought a $1K dating app" format.' },
            { icon: '💬', title: 'Add Testimonials / Case Studies', desc: 'Even 2-3 fake demo testimonials with results ("Launched my fitness app in 2 weeks, already have 500 users") builds massive trust.' },
            { icon: '📊', title: 'Add a "Revenue Calculator"', desc: 'Interactive tool: "If you charge $9.99/month and get 100 users = $999/month from a $1K investment." Makes the ROI undeniable.' },
            { icon: '🎯', title: 'Niche-Specific Landing Pages', desc: 'Create separate landing pages for each industry (dating, healthcare, fitness, church). SEO gold + targeted ads.' },
            { icon: '💰', title: 'Payment Plans', desc: 'Add "3 payments of $333" or "2 payments of $750" — drops the barrier to entry massively.' },
            { icon: '📧', title: 'Email Capture', desc: 'Add a "Get Free App Mockup" lead magnet — collect emails before they buy. Follow up with drip campaign.' },
            { icon: '🏷️', title: 'Bundle Deals', desc: '"Buy 2 apps, get 15% off" or "Launch Pack: App + Backend Setup + Marketing Kit for $X"' },
            { icon: '⭐', title: 'Live Chat / WhatsApp Button', desc: 'Add instant contact — people buying $1K-$3K products want to talk to someone before paying.' },
          ].map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: i < 7 ? '1px solid rgba(42,42,64,0.3)' : 'none' }}>
              <span style={{ fontSize: 20, flexShrink: 0 }}>{r.icon}</span>
              <div><strong>{r.title}</strong> — {r.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
