'use client';
import { useState } from 'react';
import { CheckCircle, Circle, ExternalLink, Download, Lightbulb, CreditCard, Gift, DollarSign, Clock, AlertCircle } from 'lucide-react';

const grants = [
  { id: 1, name: 'Hello Alice Grants', amount: '$5K-$50K', url: 'https://helloalice.com/grants', status: 'todo', effort: 'Easy', deadline: 'Rolling', notes: 'Sign up, get notified of matching grants. Multiple per year.' },
  { id: 2, name: 'Verizon Small Business Digital Ready', amount: '$10,000', url: 'https://verizonsmallbusinessdigitalready.com', status: 'todo', effort: 'Easy', deadline: 'Rolling', notes: 'Free courses + $10K grant. Complete courses to qualify.' },
  { id: 3, name: 'Comcast RISE', amount: '$10,000', url: 'https://comcastrise.com', status: 'todo', effort: 'Easy', deadline: 'Rolling', notes: 'Cash + marketing/tech support for minority-owned businesses.' },
  { id: 4, name: 'NAACP x Lowes', amount: '$10K-$25K', url: 'https://www.naacp.org', status: 'todo', effort: 'Medium', deadline: 'Rolling', notes: 'For Black entrepreneurs. Short application.' },
  { id: 5, name: 'FedEx Small Business Grant', amount: '$50,000', url: 'https://www.fedex.com/en-us/small-business/grant-contest.html', status: 'todo', effort: 'Medium', deadline: 'Spring 2026', notes: '$50K grand prize + $20-30K runners up. Annual contest.' },
  { id: 6, name: 'Amber Grant (WomensNet)', amount: '$10,000/mo', url: 'https://ambergrantsforwomen.com', status: 'skip', effort: 'Easy', deadline: 'Monthly', notes: 'Women-owned businesses. Not eligible.' },
  { id: 7, name: 'BOSS Network Grant', amount: '$10,000', url: 'https://www.bosslady.org', status: 'todo', effort: 'Easy', deadline: 'Annual', notes: 'For Black entrepreneurs.' },
  { id: 8, name: 'National Black MBA Scale-Up Pitch', amount: '$50,000', url: 'https://nbmbaa.org', status: 'todo', effort: 'Medium', deadline: 'Watch 2026', notes: '$50K grand prize pitch competition.' },
  { id: 9, name: 'Google Black Founders Fund', amount: 'Up to $150K', url: 'https://startup.google.com/programs/black-founders-fund/', status: 'waiting', effort: 'Medium', deadline: 'Q2 2026 (expected)', notes: 'Equity-free cash. Watch for application window.' },
  { id: 10, name: 'AI Grant (aigrant.com)', amount: '$250K SAFE + $600K+ credits', url: 'https://aigrant.com', status: 'waiting', effort: 'Hard', deadline: 'Batch 5 TBD', notes: 'Batch 4 closed. Watch for Batch 5 opening.' },
  { id: 11, name: 'ElevenLabs Startup Grant', amount: '33M credits (~$4K)', url: 'https://elevenlabs.io', status: 'submitted', effort: 'Done', deadline: 'Submitted ✅', notes: 'Expect ~1 week response.' },
  { id: 12, name: 'Google Cloud for Startups', amount: 'Up to $350K credits', url: 'https://cloud.google.com/startup', status: 'submitted', effort: 'Done', deadline: 'Submitted ✅', notes: 'Expect 3-10 business days.' },
  { id: 13, name: 'PearX S26 Accelerator', amount: '$250K-$2M + $1M+ credits', url: 'https://pear.vc', status: 'submitted', effort: 'Done', deadline: 'Submitted ✅', notes: 'Early deadline met. Decision end of March.' },
  { id: 14, name: 'WA State SSBCI', amount: 'Varies', url: 'https://www.commerce.wa.gov', status: 'todo', effort: 'Medium', deadline: 'Rolling', notes: 'State-funded small business credit initiative.' },
  { id: 15, name: 'The House Fund AI Accelerator', amount: 'Varies', url: 'https://thehouse.fund', status: 'todo', effort: 'Medium', deadline: 'Rolling', notes: 'Berkeley-based AI accelerator. Open applications.' },
];

const appIdeas = [
  { name: 'Credit Genius', icon: '💳', desc: 'Personal credit repair app with AI-assisted dispute letters. Users scan credit reports, AI identifies errors & generates dispute letters automatically. Subscription model.', status: 'idea', tags: ['AI', 'FinTech'] },
  { name: 'Midnight Singles (Current)', icon: '💜', desc: 'AI-powered dating app with video speed dating, real-time translation, voice AI. Night Owl niche targeting night shift workers.', status: 'building', tags: ['AI', 'Dating'] },
];

const incompleteTasks = [
  { task: 'Complete DKIM setup for midnightsingles.com email', priority: 'low' },
  { task: 'Build OtherPage dashboard section', priority: 'done' },
  { task: 'Set up Cloudflare Tunnel for remote Za chat access', priority: 'low' },
  { task: 'Record 1-min intro video for future applications', priority: 'medium' },
  { task: 'Record product demo video (Android screen record)', priority: 'medium' },
  { task: 'Build in-app ElevenLabs features (committed in grant app)', priority: 'high' },
  { task: 'Incorporate Delaware C-Corp via Stripe Atlas if accepted', priority: 'waiting' },
  { task: 'Apply to Hello Alice grants', priority: 'high' },
  { task: 'Apply to Verizon Digital Ready ($10K)', priority: 'high' },
  { task: 'Apply to Comcast RISE ($10K)', priority: 'high' },
  { task: 'Apply to NAACP x Lowes ($10-25K)', priority: 'high' },
  { task: 'Watch for FedEx Small Business Grant (Spring 2026)', priority: 'medium' },
  { task: 'Watch for Google Black Founders Fund Q2 2026', priority: 'medium' },
  { task: 'Watch for AI Grant Batch 5', priority: 'medium' },
];

export default function OtherPage() {
  const [grantFilter, setGrantFilter] = useState('all');

  const statusColor = { submitted: '#22c55e', todo: '#f59e0b', waiting: '#8b5cf6', skip: '#64748b' };
  const statusLabel = { submitted: '✅ Submitted', todo: '📋 To Apply', waiting: '⏳ Watch', skip: '⏭️ Skip' };
  const priorityColor = { high: '#ef4444', medium: '#f59e0b', low: '#64748b', done: '#22c55e', waiting: '#8b5cf6' };

  const filtered = grantFilter === 'all' ? grants : grants.filter(g => g.status === grantFilter);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* GRANTS & FUNDING */}
      <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 16, padding: 24, border: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18 }}>💰 Grants & Funding Tracker</h3>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
            {grants.filter(g=>g.status==='submitted').length} submitted · {grants.filter(g=>g.status==='todo').length} to apply · {grants.filter(g=>g.status==='waiting').length} watching
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {['all','submitted','todo','waiting'].map(f => (
            <button key={f} onClick={() => setGrantFilter(f)} style={{
              padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
              background: grantFilter === f ? '#8b5cf6' : 'rgba(255,255,255,0.06)',
              color: grantFilter === f ? 'white' : 'rgba(255,255,255,0.6)',
            }}>
              {f === 'all' ? `All (${grants.length})` : `${statusLabel[f]} (${grants.filter(g=>g.status===f).length})`}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(g => (
            <div key={g.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 10,
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
            }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor[g.status], flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{g.name}</span>
                  <span style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>{g.amount}</span>
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{g.notes}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{g.deadline}</div>
                <div style={{ fontSize: 11, color: statusColor[g.status], fontWeight: 600 }}>{statusLabel[g.status]}</div>
              </div>
              {g.url && (
                <a href={g.url} target="_blank" rel="noopener noreferrer" style={{ color: 'rgba(255,255,255,0.3)', flexShrink: 0 }}>
                  <ExternalLink size={14} />
                </a>
              )}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12, padding: 12, background: 'rgba(239,68,68,0.08)', borderRadius: 10, border: '1px solid rgba(239,68,68,0.15)' }}>
          <div style={{ fontSize: 12, color: '#fca5a5', display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertCircle size={14} />
            <strong>SBIR/STTR:</strong> Congressional authorization expired Sept 2025. No new funding until Congress acts.
          </div>
          <div style={{ fontSize: 12, color: '#fca5a5', display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <AlertCircle size={14} />
            <strong>Grants.gov:</strong> Mostly for nonprofits, universities & govt contractors. No consumer tech startup grants found.
          </div>
        </div>
      </div>

      {/* APP IDEAS */}
      <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 16, padding: 24, border: '1px solid rgba(255,255,255,0.06)' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 18 }}>💡 App Ideas</h3>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {appIdeas.map((app, i) => (
            <div key={i} style={{
              flex: '1 1 300px', padding: 16, borderRadius: 12,
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
            }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>{app.icon}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontWeight: 700, fontSize: 16 }}>{app.name}</span>
                {app.tags.map(t => (
                  <span key={t} style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa', padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600 }}>{t}</span>
                ))}
              </div>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: 0, lineHeight: 1.5 }}>{app.desc}</p>
              <div style={{ marginTop: 8, fontSize: 11, color: app.status === 'building' ? '#22c55e' : '#f59e0b', fontWeight: 600 }}>
                {app.status === 'building' ? '🔨 Building' : '💭 Idea Stage'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* TO-DO / INCOMPLETE TASKS */}
      <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 16, padding: 24, border: '1px solid rgba(255,255,255,0.06)' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 18 }}>📋 To-Do List</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {incompleteTasks.map((t, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8,
              background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)',
            }}>
              {t.priority === 'done' ? <CheckCircle size={16} color="#22c55e" /> : <Circle size={16} color="rgba(255,255,255,0.2)" />}
              <span style={{ flex: 1, fontSize: 13, textDecoration: t.priority === 'done' ? 'line-through' : 'none', color: t.priority === 'done' ? 'rgba(255,255,255,0.3)' : 'white' }}>{t.task}</span>
              <span style={{
                padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                background: `${priorityColor[t.priority]}20`, color: priorityColor[t.priority],
              }}>
                {t.priority}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* DOWNLOADS */}
      <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 16, padding: 24, border: '1px solid rgba(255,255,255,0.06)' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 18 }}>📥 Downloads</h3>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <a href="/Midnight_Singles_Pitch_Deck.pdf" download style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', borderRadius: 12,
            background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)',
            color: 'white', textDecoration: 'none', cursor: 'pointer',
          }}>
            <Download size={18} color="#a78bfa" />
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Pitch Deck PDF</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>10 slides · Midnight Singles International</div>
            </div>
          </a>
        </div>
      </div>
    </div>
  );
}
