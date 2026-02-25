'use client';
import { useState, useEffect } from 'react';
import { Bell, Search, X } from 'lucide-react';
import { getContentLog } from '@/lib/store';

export default function Topbar({ title, subtitle }) {
  const [showNotifs, setShowNotifs] = useState(false);
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    const content = getContentLog();
    const notifs = [];
    const pending = content.filter(c => c.status === 'pending').length;
    if (pending > 0) notifs.push({ id: 'pending', icon: '⏳', text: `${pending} posts awaiting your approval`, time: 'Now', type: 'warning' });
    const approved = content.filter(c => c.status === 'approved').length;
    if (approved > 0) notifs.push({ id: 'approved', icon: '✅', text: `${approved} posts approved — ready to schedule`, time: 'Now', type: 'success' });
    if (content.length === 0) notifs.push({ id: 'start', icon: '🚀', text: 'Generate your first content in Marketing Agent', time: 'Now', type: 'info' });
    notifs.push({ id: 'yt', icon: '▶️', text: 'YouTube channel connected: @MidnightSinglesInternational', time: 'Today', type: 'success' });
    notifs.push({ id: 'tt', icon: '♪', text: 'TikTok account not yet created', time: '', type: 'warning' });
    setNotifications(notifs);
  }, [showNotifs]);

  const now = new Date();
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening';
  const pendingCount = notifications.filter(n => n.type === 'warning').length;

  return (
    <div className="topbar">
      <div className="topbar-left">
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      <div className="topbar-right">
        <div style={{ position: 'relative' }}>
          <button className="topbar-btn" onClick={() => setShowNotifs(!showNotifs)} style={{ position: 'relative' }}>
            <Bell size={14} />
            {pendingCount > 0 && (
              <span className="notif-pulse" style={{ position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderRadius: '50%', background: 'var(--accent-pink)', color: 'white', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{pendingCount}</span>
            )}
          </button>
          {showNotifs && (
            <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 8, width: 340, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow-card)', zIndex: 100, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>🔔 Notifications</span>
                <button onClick={() => setShowNotifs(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={14} /></button>
              </div>
              {notifications.map(n => (
                <div key={n.id} style={{ padding: '10px 16px', borderBottom: '1px solid rgba(42,42,64,0.3)', display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontSize: 18 }}>{n.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>{n.text}</div>
                    {n.time && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{n.time}</div>}
                  </div>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: n.type === 'warning' ? '#f59e0b' : n.type === 'success' ? '#10b981' : '#3b82f6' }} />
                </div>
              ))}
            </div>
          )}
        </div>
        <button className="topbar-btn primary">🌙 {greeting}, Kohari</button>
      </div>
    </div>
  );
}
