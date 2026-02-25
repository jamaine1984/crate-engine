'use client';
import { useState, useEffect } from 'react';
import { Calendar, Clock, Send, ChevronLeft, ChevronRight } from 'lucide-react';
import { getContentLog, updateContent } from '@/lib/store';

const TIME_SLOTS = {
  youtube: ['10:00 AM', '6:00 PM'],
  tiktok: ['12:00 PM', '4:00 PM', '9:00 PM'],
};

export default function SchedulerPage() {
  const [content, setContent] = useState([]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [dragItem, setDragItem] = useState(null);
  const [schedule, setSchedule] = useState({});

  useEffect(() => {
    setContent(getContentLog());
    const saved = localStorage.getItem('msi-schedule');
    if (saved) setSchedule(JSON.parse(saved));
  }, []);

  const saveSchedule = (s) => { setSchedule(s); localStorage.setItem('msi-schedule', JSON.stringify(s)); };

  const getWeekDays = () => {
    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() - start.getDay() + (weekOffset * 7));
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      return d;
    });
  };

  const days = getWeekDays();
  const today = new Date().toDateString();
  const approved = content.filter(c => c.status === 'approved');
  const pending = content.filter(c => c.status === 'pending');

  const schedulePost = (contentId, dateStr, time) => {
    const key = `${dateStr}-${time}`;
    const newSchedule = { ...schedule, [key]: contentId };
    saveSchedule(newSchedule);
    const updated = updateContent(contentId, { scheduledDate: dateStr, scheduledTime: time, status: 'approved' });
    setContent(updated);
  };

  const unschedule = (key) => {
    const newSchedule = { ...schedule };
    delete newSchedule[key];
    saveSchedule(newSchedule);
  };

  const getScheduledItem = (dateStr, time) => {
    const key = `${dateStr}-${time}`;
    const contentId = schedule[key];
    if (!contentId) return null;
    return content.find(c => c.id === contentId);
  };

  const weekLabel = `${days[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — ${days[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

  return (
    <>
      {/* Week Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <button onClick={() => setWeekOffset(w => w - 1)} className="topbar-btn"><ChevronLeft size={14} /> Prev</button>
        <div style={{ fontSize: 16, fontWeight: 700 }}>📅 {weekLabel}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setWeekOffset(0)} className="topbar-btn">Today</button>
          <button onClick={() => setWeekOffset(w => w + 1)} className="topbar-btn">Next <ChevronRight size={14} /></button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '100px repeat(7, 1fr)', gap: 4, marginBottom: 24 }}>
        {/* Header */}
        <div />
        {days.map(d => (
          <div key={d.toISOString()} style={{ textAlign: 'center', padding: 8, fontSize: 12, fontWeight: 600, color: d.toDateString() === today ? 'var(--accent-purple-light)' : 'var(--text-muted)', background: d.toDateString() === today ? 'rgba(124,58,237,0.08)' : 'transparent', borderRadius: 8 }}>
            <div>{d.toLocaleDateString('en-US', { weekday: 'short' })}</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{d.getDate()}</div>
          </div>
        ))}

        {/* YouTube Slots */}
        {TIME_SLOTS.youtube.map(time => (
          <>
            <div key={`yt-label-${time}`} style={{ display: 'flex', alignItems: 'center', fontSize: 10, color: '#ef4444', fontWeight: 600, padding: '0 4px' }}>▶ {time}</div>
            {days.map(d => {
              const dateStr = d.toISOString().split('T')[0];
              const item = getScheduledItem(dateStr, `yt-${time}`);
              return (
                <div key={`${dateStr}-yt-${time}`}
                  onClick={() => {
                    if (item) { unschedule(`${dateStr}-yt-${time}`); return; }
                    if (approved.length > 0) schedulePost(approved.find(c=>c.platform==='youtube')?.id || approved[0].id, dateStr, `yt-${time}`);
                  }}
                  style={{ minHeight: 48, background: item ? 'rgba(239,68,68,0.08)' : 'var(--bg-secondary)', border: `1px solid ${item ? 'rgba(239,68,68,0.3)' : 'var(--border)'}`, borderRadius: 6, padding: 4, cursor: 'pointer', fontSize: 9, overflow: 'hidden' }}>
                  {item ? (
                    <div>
                      <div style={{ fontWeight: 700, color: '#ef4444' }}>▶ YT</div>
                      <div style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.script?.hook?.slice(0, 30)}</div>
                    </div>
                  ) : <div style={{ color: 'var(--text-muted)', textAlign: 'center', paddingTop: 12 }}>+</div>}
                </div>
              );
            })}
          </>
        ))}

        {/* TikTok Slots */}
        {TIME_SLOTS.tiktok.map(time => (
          <>
            <div key={`tt-label-${time}`} style={{ display: 'flex', alignItems: 'center', fontSize: 10, color: '#25f4ee', fontWeight: 600, padding: '0 4px' }}>♪ {time}</div>
            {days.map(d => {
              const dateStr = d.toISOString().split('T')[0];
              const item = getScheduledItem(dateStr, `tt-${time}`);
              return (
                <div key={`${dateStr}-tt-${time}`}
                  onClick={() => {
                    if (item) { unschedule(`${dateStr}-tt-${time}`); return; }
                    if (approved.length > 0) schedulePost(approved.find(c=>c.platform==='tiktok')?.id || approved[0].id, dateStr, `tt-${time}`);
                  }}
                  style={{ minHeight: 48, background: item ? 'rgba(37,244,238,0.05)' : 'var(--bg-secondary)', border: `1px solid ${item ? 'rgba(37,244,238,0.2)' : 'var(--border)'}`, borderRadius: 6, padding: 4, cursor: 'pointer', fontSize: 9, overflow: 'hidden' }}>
                  {item ? (
                    <div>
                      <div style={{ fontWeight: 700, color: '#25f4ee' }}>♪ TT</div>
                      <div style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.script?.hook?.slice(0, 30)}</div>
                    </div>
                  ) : <div style={{ color: 'var(--text-muted)', textAlign: 'center', paddingTop: 12 }}>+</div>}
                </div>
              );
            })}
          </>
        ))}
      </div>

      {/* Unscheduled approved content */}
      <div className="card">
        <div className="card-header"><h3>✅ Approved — Ready to Schedule ({approved.length})</h3></div>
        <div className="card-body">
          {approved.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: 13 }}>Approve content in Marketing Agent to schedule it here.</div>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {approved.map(item => (
                <div key={item.id} style={{ padding: 10, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)', width: 200, fontSize: 11 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                    <span style={{ padding: '1px 6px', borderRadius: 3, fontSize: 9, fontWeight: 700, background: item.platform === 'youtube' ? 'rgba(239,68,68,0.2)' : 'rgba(37,244,238,0.1)', color: item.platform === 'youtube' ? '#ef4444' : '#25f4ee' }}>
                      {item.platform === 'youtube' ? '▶ YT' : '♪ TT'}
                    </span>
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.script?.hook}</div>
                  <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>Click a slot above to schedule</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
