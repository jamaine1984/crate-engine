'use client';

const accounts = [
  { name: 'YouTube', icon: '▶️', status: '✅ Connected', desc: '@MidnightSinglesInternational', connected: true, url: 'https://youtube.com/@midnightsinglesinternational' },
  { name: 'Email', icon: '📧', status: '✅ Connected', desc: 'midnightsinglessales@gmail.com', connected: true },
  { name: 'TikTok', icon: '♪', status: 'Not created', desc: '@midnightsingles (suggested)', connected: false },
  { name: 'OpenRouter', icon: '🤖', status: 'Check Settings', desc: 'Opus 4.6 + GPT-5 Image', connected: false },
  { name: 'Firebase', icon: '🔥', status: '✅ Active', desc: 'midnight-singles-international', connected: true, url: 'https://console.firebase.google.com/project/midnight-singles-international' },
  { name: 'GitHub', icon: '🐙', status: '✅ Connected', desc: 'jamaine1984/midnight-singles-international', connected: true, url: 'https://github.com/jamaine1984/midnight-singles-international' },
];

export default function AccountsPage() {
  return (
    <div className="card">
      <div className="card-header"><h3>🔗 Connected Accounts & Platforms</h3></div>
      <div className="card-body">
        {accounts.map((a, i) => (
          <div className="list-item" key={i}>
            <div className="thumbnail" style={{ fontSize: 24 }}>{a.icon}</div>
            <div className="info">
              <div className="title">{a.name}</div>
              <div className="subtitle">{a.desc}</div>
            </div>
            <span className={`status ${a.connected ? 'published' : 'draft'}`}>{a.status}</span>
            {a.url ? (
              <a href={a.url} target="_blank" className="topbar-btn" style={{ marginLeft: 8, fontSize: 11, textDecoration: 'none' }}>Open →</a>
            ) : (
              <button className="topbar-btn" style={{ marginLeft: 8, fontSize: 11 }}>Connect</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
