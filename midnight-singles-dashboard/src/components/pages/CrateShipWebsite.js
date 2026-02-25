'use client';
import { ExternalLink, CheckCircle, Circle } from 'lucide-react';

export default function CrateShipWebsite() {
  const improvements = [
    { done: false, priority: 'high', title: 'Add Video Demos to Each App', desc: 'Record 15-sec screen captures of live demos. Embed on app cards. Massive conversion boost.' },
    { done: false, priority: 'high', title: 'Revenue Calculator Widget', desc: '"If 100 users pay $9.99/month, your $1K app earns $999/month." Interactive slider on homepage.' },
    { done: false, priority: 'high', title: 'Payment Plans', desc: 'Add "3 payments of $333" option via Stripe. Drops conversion barrier significantly.' },
    { done: false, priority: 'high', title: 'Email Capture / Lead Magnet', desc: '"Get a Free App Mockup for Your Business" — collect emails, follow up with drip campaign.' },
    { done: false, priority: 'medium', title: 'Testimonials Section', desc: 'Add 3-5 customer stories with photos, results, and quotes. Social proof sells.' },
    { done: false, priority: 'medium', title: 'Industry Landing Pages', desc: 'Separate pages: /dating, /healthcare, /fitness, /church — SEO + targeted ads.' },
    { done: false, priority: 'medium', title: 'Live Chat / WhatsApp Button', desc: 'People buying $1K-$3K need to talk first. Add instant contact option.' },
    { done: false, priority: 'medium', title: 'Bundle Deals', desc: '"Buy 2 apps get 15% off" or "Launch Pack: App + Backend + Marketing Kit"' },
    { done: false, priority: 'low', title: 'Blog / Content Section', desc: 'SEO articles: "How to launch a dating app", "White-label vs custom development"' },
    { done: false, priority: 'low', title: 'FAQ Section', desc: 'Answer top objections: "Is it really mine?", "Can I customize?", "What about updates?"' },
  ];

  return (
    <>
      <div className="stat-card" style={{ marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>📦 crateshipstudios.com</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Premium White-Label Mobile Apps · 57 Templates · Starting at $1,000</div>
        </div>
        <a href="https://www.crateshipstudios.com" target="_blank" className="topbar-btn primary" style={{ textDecoration: 'none' }}>
          <ExternalLink size={14} /> Visit Site
        </a>
      </div>

      <div className="card">
        <div className="card-header"><h3>🚀 Website Improvement Checklist</h3></div>
        <div className="card-body">
          {improvements.map((item, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: i < improvements.length-1 ? '1px solid rgba(42,42,64,0.3)' : 'none' }}>
              <div style={{ marginTop: 2 }}>
                {item.done ? <CheckCircle size={16} color="#10b981" /> : <Circle size={16} color="var(--text-muted)" />}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{item.title}</span>
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, fontWeight: 600,
                    background: item.priority === 'high' ? 'rgba(239,68,68,0.15)' : item.priority === 'medium' ? 'rgba(245,158,11,0.15)' : 'rgba(59,130,246,0.15)',
                    color: item.priority === 'high' ? '#ef4444' : item.priority === 'medium' ? '#f59e0b' : '#3b82f6',
                  }}>{item.priority}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
