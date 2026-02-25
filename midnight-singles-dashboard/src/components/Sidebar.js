'use client';
import {
  LayoutDashboard, Megaphone, Film, BarChart3, Shield,
  Link2, Settings, Plus, Calendar, Bell, Link, Mic, Volume2, FolderOpen
} from 'lucide-react';

const apps = [
  { id: 'midnight-singles', name: 'Midnight Singles', icon: '🌙', color: '#7c3aed' },
  { id: 'crateship', name: 'CrateShip Studios', icon: '📦', color: '#f59e0b' },
];

const navConfig = {
  'midnight-singles': [
    { id: 'overview', icon: LayoutDashboard, label: 'Overview' },
    { id: 'marketing', icon: Megaphone, label: 'Marketing Agent', badge: 'AI' },
    { id: 'scheduler', icon: Calendar, label: 'Schedule & Calendar' },
    { id: 'content', icon: Film, label: 'Content Library' },
    { id: 'ab-testing', icon: Mic, label: 'A/B Hook Testing', badge: 'NEW' },
    { id: 'elevenlabs', icon: Volume2, label: 'ElevenLabs Studio', badge: 'NEW' },
    { id: 'analytics', icon: BarChart3, label: 'Analytics' },
    { id: 'admin', icon: Shield, label: 'Admin Panel' },
    { id: 'link-bio', icon: Link, label: 'Link in Bio' },
    { id: 'accounts', icon: Link2, label: 'Accounts' },
    { id: 'other', icon: FolderOpen, label: 'Other', badge: 'NEW' },
    { id: 'settings', icon: Settings, label: 'Settings' },
  ],
  'crateship': [
    { id: 'cs-overview', icon: LayoutDashboard, label: 'Overview' },
    { id: 'cs-marketing', icon: Megaphone, label: 'Marketing Agent', badge: 'AI' },
    { id: 'cs-content', icon: Film, label: 'Content Library' },
    { id: 'cs-analytics', icon: BarChart3, label: 'Analytics' },
    { id: 'cs-website', icon: Link2, label: 'Website' },
    { id: 'other', icon: FolderOpen, label: 'Other', badge: 'NEW' },
    { id: 'settings', icon: Settings, label: 'Settings' },
  ],
};

export default function Sidebar({ activePage, setActivePage, activeApp, setActiveApp }) {
  const navItems = navConfig[activeApp] || navConfig['midnight-singles'];
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <span className="moon" style={{ fontSize: 28 }}>{apps.find(a=>a.id===activeApp)?.icon || '🌙'}</span>
          <div>
            <h1>{activeApp === 'crateship' ? 'CrateShip\nStudios' : 'Midnight Singles\nInternational'}</h1>
            <span>Command Center</span>
          </div>
        </div>
      </div>
      <nav className="sidebar-nav">
        <div className="nav-section-title">Main</div>
        {navItems.map(item => (
          <button key={item.id} className={`nav-item ${activePage === item.id ? 'active' : ''}`} onClick={() => setActivePage(item.id)}>
            <item.icon />
            {item.label}
            {item.badge && <span className="badge">{item.badge}</span>}
          </button>
        ))}
      </nav>
      <div className="app-switcher">
        <div className="app-switcher-title">Your Apps</div>
        {apps.map(app => (
          <div key={app.id} className={`app-item ${activeApp === app.id ? 'active' : ''}`} style={{ cursor: 'pointer' }}
            onClick={() => { setActiveApp(app.id); setActivePage(app.id === 'crateship' ? 'cs-overview' : 'overview'); }}>
            <span style={{ fontSize: 16 }}>{app.icon}</span>
            {app.name}
          </div>
        ))}
        <div className="app-item" style={{ opacity: 0.5 }}><Plus size={14} /> Add New App...</div>
      </div>
    </aside>
  );
}
