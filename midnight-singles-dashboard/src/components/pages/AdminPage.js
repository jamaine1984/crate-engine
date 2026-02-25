'use client';
import { useState, useEffect, useCallback } from 'react';
import { Shield, Users, CheckCircle, XCircle, Ban, Eye, BarChart3, AlertTriangle, LogIn, Search, RefreshCw, MessageSquare, Heart, Video, Gift, Flag, Camera, UserX, ChevronDown, ExternalLink } from 'lucide-react';

export default function AdminPage() {
  const [tab, setTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [fb, setFb] = useState(null);
  const [db, setDb] = useState(null);

  // Data
  const [stats, setStats] = useState({});
  const [users, setUsers] = useState([]);
  const [verifications, setVerifications] = useState([]);
  const [reports, setReports] = useState([]);
  const [userSearch, setUserSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [userDetail, setUserDetail] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    import('firebase/app').then(async ({ initializeApp }) => {
      const { getFirestore, collection, query, where, orderBy, limit, getDocs, doc, updateDoc, deleteDoc, getDoc, getCountFromServer, Timestamp } = await import('firebase/firestore');
      const { getAuth, signInWithEmailAndPassword, onAuthStateChanged } = await import('firebase/auth');

      const app = initializeApp({
        apiKey: 'AIzaSyB9UG-RTfFzHbm-dWDQb3BVzKlpifppmpk',
        authDomain: 'midnight-singles-international.firebaseapp.com',
        projectId: 'midnight-singles-international',
        storageBucket: 'midnight-singles-international.firebasestorage.app',
        messagingSenderId: '730878017264',
        appId: '1:730878017264:ios:2e7cd57851bb3461c24c35',
      }, 'admin-panel');

      const firestore = getFirestore(app);
      const auth = getAuth(app);
      setDb(firestore);

      const fbUtils = { firestore, auth, collection, query, where, orderBy, limit, getDocs, doc, updateDoc, deleteDoc, getDoc, getCountFromServer, Timestamp, signInWithEmailAndPassword };
      setFb(fbUtils);

      onAuthStateChanged(auth, user => {
        if (user) { setLoggedIn(true); loadAllData(fbUtils, firestore); }
        else { setLoggedIn(false); setLoading(false); }
      });
    });
  }, []);

  const loadAllData = async (f, firestore) => {
    setLoading(true);
    try {
      // Stats
      const statsData = {};
      try { statsData.totalUsers = (await f.getCountFromServer(f.collection(firestore, 'users'))).data().count; } catch { statsData.totalUsers = 0; }
      try { statsData.totalReports = (await f.getCountFromServer(f.collection(firestore, 'reports'))).data().count; } catch { statsData.totalReports = 0; }
      try { statsData.totalMatches = (await f.getCountFromServer(f.collection(firestore, 'matches'))).data().count; } catch { statsData.totalMatches = 0; }
      try { statsData.totalChats = (await f.getCountFromServer(f.collection(firestore, 'chats'))).data().count; } catch { statsData.totalChats = 0; }
      try { statsData.totalSpeedDates = (await f.getCountFromServer(f.collection(firestore, 'speed_dating_sessions'))).data().count; } catch { statsData.totalSpeedDates = 0; }
      try { statsData.totalGiftsSent = (await f.getCountFromServer(f.collection(firestore, 'gifts_sent'))).data().count; } catch { statsData.totalGiftsSent = 0; }
      try { statsData.totalSocialPosts = (await f.getCountFromServer(f.collection(firestore, 'social_posts'))).data().count; } catch { statsData.totalSocialPosts = 0; }
      try {
        const vSnap = await f.getDocs(f.query(f.collection(firestore, 'verification_requests'), f.where('verificationStatus', '==', 'pending')));
        statsData.pendingVerifications = vSnap.size;
      } catch { statsData.pendingVerifications = 0; }
      try {
        const rSnap = await f.getDocs(f.query(f.collection(firestore, 'reports'), f.where('status', '==', 'pending')));
        statsData.pendingReports = rSnap.size;
      } catch { statsData.pendingReports = 0; }
      setStats(statsData);

      // Users (last 200)
      const uSnap = await f.getDocs(f.query(f.collection(firestore, 'users'), f.limit(200)));
      setUsers(uSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      // Verification requests
      try {
        const vSnap = await f.getDocs(f.query(f.collection(firestore, 'verification_requests'), f.orderBy('createdAt', 'desc'), f.limit(50)));
        setVerifications(vSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch { setVerifications([]); }

      // Reports
      try {
        const rSnap = await f.getDocs(f.query(f.collection(firestore, 'reports'), f.orderBy('createdAt', 'desc'), f.limit(50)));
        setReports(rSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch { setReports([]); }
    } catch (e) { console.error('Load error:', e); }
    setLoading(false);
  };

  const handleLogin = async () => {
    if (!fb) return;
    setLoginError('');
    try { await fb.signInWithEmailAndPassword(fb.auth, email, password); }
    catch (e) { setLoginError(e.message); }
  };

  const handleRefresh = async () => {
    if (!fb || !db) return;
    setRefreshing(true);
    await loadAllData(fb, db);
    setRefreshing(false);
  };

  // === VERIFICATION ACTIONS ===
  const approveVerification = async (reqId, userId) => {
    if (!fb || !db) return;
    await fb.updateDoc(fb.doc(db, 'verification_requests', reqId), { verificationStatus: 'approved', reviewedAt: fb.Timestamp.now() });
    await fb.updateDoc(fb.doc(db, 'users', userId), { isVerified: true });
    // Update local state
    setVerifications(v => v.map(x => x.id === reqId ? { ...x, verificationStatus: 'approved' } : x));
    setUsers(u => u.map(x => x.id === userId ? { ...x, isVerified: true } : x));
    setStats(s => ({ ...s, pendingVerifications: Math.max(0, (s.pendingVerifications || 0) - 1) }));
  };

  const rejectVerification = async (reqId, userId) => {
    if (!fb || !db) return;
    await fb.updateDoc(fb.doc(db, 'verification_requests', reqId), { verificationStatus: 'rejected', reviewedAt: fb.Timestamp.now() });
    await fb.updateDoc(fb.doc(db, 'users', userId), { isVerified: false });
    setVerifications(v => v.map(x => x.id === reqId ? { ...x, verificationStatus: 'rejected' } : x));
  };

  // === USER ACTIONS ===
  const banUser = async (userId) => {
    if (!fb || !db) return;
    await fb.updateDoc(fb.doc(db, 'users', userId), { isBanned: true, bannedAt: fb.Timestamp.now() });
    setUsers(u => u.map(x => x.id === userId ? { ...x, isBanned: true } : x));
  };

  const unbanUser = async (userId) => {
    if (!fb || !db) return;
    await fb.updateDoc(fb.doc(db, 'users', userId), { isBanned: false });
    setUsers(u => u.map(x => x.id === userId ? { ...x, isBanned: false } : x));
  };

  const deleteUser = async (userId) => {
    if (!confirm('Are you sure you want to delete this user? This cannot be undone.')) return;
    if (!fb || !db) return;
    await fb.deleteDoc(fb.doc(db, 'users', userId));
    setUsers(u => u.filter(x => x.id !== userId));
  };

  // === REPORT ACTIONS ===
  const resolveReport = async (reportId) => {
    if (!fb || !db) return;
    await fb.updateDoc(fb.doc(db, 'reports', reportId), { status: 'resolved', resolvedAt: fb.Timestamp.now() });
    setReports(r => r.map(x => x.id === reportId ? { ...x, status: 'resolved' } : x));
  };

  const dismissReport = async (reportId) => {
    if (!fb || !db) return;
    await fb.updateDoc(fb.doc(db, 'reports', reportId), { status: 'dismissed', resolvedAt: fb.Timestamp.now() });
    setReports(r => r.map(x => x.id === reportId ? { ...x, status: 'dismissed' } : x));
  };

  // View user detail
  const viewUser = async (userId) => {
    const user = users.find(u => u.id === userId);
    if (user) { setUserDetail(user); setSelectedUser(userId); }
  };

  const formatDate = (d) => {
    if (!d) return '—';
    try { return d.toDate ? d.toDate().toLocaleDateString() : new Date(d).toLocaleDateString(); }
    catch { return '—'; }
  };

  const filteredUsers = users.filter(u => {
    if (!userSearch) return true;
    const s = userSearch.toLowerCase();
    return (u.name?.toLowerCase().includes(s) || u.id?.toLowerCase().includes(s) || u.location?.toLowerCase().includes(s) || u.gender?.toLowerCase().includes(s));
  });

  // === LOGIN SCREEN ===
  if (!loggedIn) {
    return (
      <div className="admin-connect-card">
        <Shield size={48} style={{ color: 'var(--accent-purple)', opacity: 0.6 }} />
        <h3>🌙 Midnight Singles Admin Panel</h3>
        <p>Sign in with your Firebase admin account to manage users, verifications, reports, and app data.</p>
        <div style={{ width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input type="email" placeholder="Admin email" value={email} onChange={e => setEmail(e.target.value)}
            style={{ padding: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14 }} />
          <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            style={{ padding: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14 }} />
          <button onClick={handleLogin} className="topbar-btn primary" style={{ justifyContent: 'center', padding: 14, fontSize: 14 }}>
            <LogIn size={16} /> Sign In
          </button>
          {loginError && <p style={{ color: 'var(--accent-red)', fontSize: 12 }}>{loginError}</p>}
        </div>
      </div>
    );
  }

  // === TABS ===
  const tabs = [
    { id: 'dashboard', label: '📊 Dashboard', count: null },
    { id: 'verifications', label: '🤳 Selfie Verify', count: stats.pendingVerifications },
    { id: 'users', label: '👥 Users', count: stats.totalUsers },
    { id: 'reports', label: '🚨 Reports', count: stats.pendingReports },
    { id: 'moderation', label: '🛡️ Moderation', count: null },
  ];

  return (
    <>
      {/* Tab Bar + Refresh */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            background: tab === t.id ? 'var(--accent-purple)' : 'var(--bg-card)', border: '1px solid var(--border)',
            color: tab === t.id ? 'white' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {t.label}
            {t.count > 0 && <span style={{ background: tab === t.id ? 'rgba(255,255,255,0.2)' : 'var(--accent-pink)', color: 'white', padding: '1px 7px', borderRadius: 10, fontSize: 10, fontWeight: 700 }}>{t.count}</span>}
          </button>
        ))}
        <button onClick={handleRefresh} disabled={refreshing} className="topbar-btn" style={{ marginLeft: 'auto' }}>
          <RefreshCw size={14} className={refreshing ? 'spin' : ''} /> Refresh
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 64, color: 'var(--text-muted)' }}>⏳ Loading from Firebase...</div>
      ) : (
        <>
          {/* ═══ DASHBOARD ═══ */}
          {tab === 'dashboard' && (
            <>
              <div className="stats-grid">
                {[
                  { label: 'Total Users', value: stats.totalUsers || 0, icon: '👥', color: '#7c3aed' },
                  { label: 'Pending Verifications', value: stats.pendingVerifications || 0, icon: '🤳', color: '#f59e0b' },
                  { label: 'Pending Reports', value: stats.pendingReports || 0, icon: '🚨', color: '#ef4444' },
                  { label: 'Total Matches', value: stats.totalMatches || 0, icon: '💜', color: '#ec4899' },
                ].map((s,i) => (
                  <div className="stat-card" key={i}>
                    <div className="stat-card-header"><span className="label">{s.label}</span><span className="icon" style={{ background: `${s.color}20`, fontSize: 18 }}>{s.icon}</span></div>
                    <div className="value" style={{ color: s.color }}>{s.value}</div>
                  </div>
                ))}
              </div>

              <div className="stats-grid" style={{ marginTop: 16 }}>
                {[
                  { label: 'Speed Dates', value: stats.totalSpeedDates || 0, icon: '🎥', color: '#3b82f6' },
                  { label: 'Chats', value: stats.totalChats || 0, icon: '💬', color: '#10b981' },
                  { label: 'Gifts Sent', value: stats.totalGiftsSent || 0, icon: '🎁', color: '#f59e0b' },
                  { label: 'Social Posts', value: stats.totalSocialPosts || 0, icon: '📱', color: '#8b5cf6' },
                ].map((s,i) => (
                  <div className="stat-card" key={i}>
                    <div className="stat-card-header"><span className="label">{s.label}</span><span className="icon" style={{ background: `${s.color}20`, fontSize: 18 }}>{s.icon}</span></div>
                    <div className="value" style={{ color: s.color }}>{s.value}</div>
                  </div>
                ))}
              </div>

              <div className="section-grid equal" style={{ marginTop: 24 }}>
                <div className="card">
                  <div className="card-header"><h3>👥 User Breakdown</h3></div>
                  <div className="card-body" style={{ fontSize: 13 }}>
                    {[
                      { label: 'Online Now', value: users.filter(u => u.isOnline).length, color: '#10b981' },
                      { label: 'Verified', value: users.filter(u => u.isVerified).length, color: '#3b82f6' },
                      { label: 'Banned', value: users.filter(u => u.isBanned).length, color: '#ef4444' },
                      { label: 'Premium (Paid)', value: users.filter(u => u.subscriptionTier && !['free','Free','SubscriptionTier.free'].includes(String(u.subscriptionTier))).length, color: '#f59e0b' },
                      { label: 'Free Tier', value: users.filter(u => !u.subscriptionTier || ['free','Free','SubscriptionTier.free'].includes(String(u.subscriptionTier))).length, color: 'var(--text-muted)' },
                      { label: 'Male', value: users.filter(u => u.gender === 'male' || u.gender === 'Male').length, color: '#3b82f6' },
                      { label: 'Female', value: users.filter(u => u.gender === 'female' || u.gender === 'Female').length, color: '#ec4899' },
                    ].map((r,i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(42,42,64,0.3)' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>{r.label}</span>
                        <span style={{ fontWeight: 700, color: r.color }}>{r.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="card">
                  <div className="card-header"><h3>🔗 Quick Actions</h3></div>
                  <div className="card-body">
                    {[
                      { label: '🤳 Review Selfie Verifications', action: () => setTab('verifications'), count: stats.pendingVerifications },
                      { label: '🚨 Handle Reports', action: () => setTab('reports'), count: stats.pendingReports },
                      { label: '👥 Manage Users', action: () => setTab('users') },
                      { label: '🔥 Firebase Console', url: 'https://console.firebase.google.com/project/midnight-singles-international/firestore' },
                      { label: '📊 Firebase Analytics', url: 'https://console.firebase.google.com/project/midnight-singles-international/analytics' },
                      { label: '💰 AdMob Dashboard', url: 'https://admob.google.com' },
                    ].map((a,i) => (
                      <div key={i} onClick={a.action} style={{ display: 'flex', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(42,42,64,0.3)', cursor: a.action ? 'pointer' : 'default' }}>
                        {a.url ? (
                          <a href={a.url} target="_blank" style={{ flex: 1, color: 'var(--accent-purple-light)', fontSize: 13, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>{a.label} <ExternalLink size={11} /></a>
                        ) : (
                          <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)' }}>{a.label}</span>
                        )}
                        {a.count > 0 && <span style={{ background: 'var(--accent-pink)', color: 'white', padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700 }}>{a.count}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ═══ SELFIE VERIFICATIONS ═══ */}
          {tab === 'verifications' && (
            <div className="card">
              <div className="card-header"><h3>🤳 Selfie Verification Queue</h3></div>
              <div className="card-body">
                {verifications.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>No verification requests found.</div>
                ) : verifications.map(v => {
                  const user = users.find(u => u.id === v.userId);
                  const isPending = v.verificationStatus === 'pending';
                  return (
                    <div key={v.id} style={{ padding: 16, marginBottom: 12, background: 'var(--bg-secondary)', borderRadius: 12, border: `1px solid ${isPending ? 'rgba(245,158,11,0.3)' : 'var(--border)'}` }}>
                      <div style={{ display: 'flex', gap: 16 }}>
                        {/* Selfie + Profile Photos */}
                        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                          {v.selfieUrl && (
                            <div>
                              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, textAlign: 'center' }}>Selfie</div>
                              <a href={v.selfieUrl} target="_blank"><img src={v.selfieUrl} alt="Selfie" style={{ width: 100, height: 130, objectFit: 'cover', borderRadius: 8, border: '2px solid var(--accent-purple)' }} /></a>
                            </div>
                          )}
                          {user?.images?.[0] && (
                            <div>
                              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, textAlign: 'center' }}>Profile</div>
                              <a href={user.images[0]} target="_blank"><img src={user.images[0]} alt="Profile" style={{ width: 100, height: 130, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} /></a>
                            </div>
                          )}
                        </div>

                        {/* User Info */}
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: 16 }}>{user?.name || v.userName || 'Unknown'}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                            Age: {user?.age || '—'} · {user?.gender || '—'} · {user?.location || 'No location'}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                            Submitted: {formatDate(v.createdAt)} · Status: <span style={{ fontWeight: 600, color: isPending ? '#f59e0b' : v.verificationStatus === 'approved' ? '#10b981' : '#ef4444' }}>{v.verificationStatus}</span>
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>User ID: {v.userId}</div>

                          {/* Actions */}
                          {isPending && (
                            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                              <button onClick={() => approveVerification(v.id, v.userId)}
                                style={{ padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)', color: '#10b981', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <CheckCircle size={14} /> Approve
                              </button>
                              <button onClick={() => rejectVerification(v.id, v.userId)}
                                style={{ padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <XCircle size={14} /> Reject
                              </button>
                              <button onClick={() => banUser(v.userId)}
                                style={{ padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'rgba(239,68,68,0.05)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                                🚫 Ban User
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ═══ USERS ═══ */}
          {tab === 'users' && (
            <>
              {/* Search */}
              <div style={{ marginBottom: 16, position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input type="text" placeholder="Search by name, ID, location, gender..." value={userSearch} onChange={e => setUserSearch(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px 10px 34px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13 }} />
              </div>

              {/* User Detail Modal */}
              {selectedUser && userDetail && (
                <div className="card" style={{ marginBottom: 16, border: '1px solid var(--accent-purple)' }}>
                  <div className="card-header">
                    <h3>👤 {userDetail.name || 'Unknown'}</h3>
                    <button onClick={() => { setSelectedUser(null); setUserDetail(null); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18 }}>✕</button>
                  </div>
                  <div className="card-body">
                    <div style={{ display: 'flex', gap: 16 }}>
                      {/* Photos */}
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        {(userDetail.images || []).slice(0, 4).map((img, i) => (
                          <a key={i} href={img} target="_blank"><img src={img} alt="" style={{ width: 80, height: 110, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} /></a>
                        ))}
                      </div>
                      <div style={{ flex: 1, fontSize: 12 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px' }}>
                          <div><strong>Name:</strong> {userDetail.name}</div>
                          <div><strong>Age:</strong> {userDetail.age}</div>
                          <div><strong>Gender:</strong> {userDetail.gender || '—'}</div>
                          <div><strong>Location:</strong> {userDetail.location || '—'}</div>
                          <div><strong>Verified:</strong> {userDetail.isVerified ? '✅ Yes' : '❌ No'}</div>
                          <div><strong>Banned:</strong> {userDetail.isBanned ? '🚫 Yes' : 'No'}</div>
                          <div><strong>Tier:</strong> {String(userDetail.subscriptionTier || 'free')}</div>
                          <div><strong>Online:</strong> {userDetail.isOnline ? '🟢 Yes' : '⚫ No'}</div>
                          <div><strong>Nationality:</strong> {userDetail.nationality || '—'}</div>
                          <div><strong>Languages:</strong> {(userDetail.languages || []).join(', ') || '—'}</div>
                        </div>
                        <div style={{ marginTop: 8 }}><strong>Bio:</strong> {userDetail.bio || '—'}</div>
                        <div style={{ marginTop: 6 }}><strong>Interests:</strong> {(userDetail.interests || []).join(', ') || '—'}</div>
                        <div style={{ marginTop: 6 }}><strong>ID:</strong> <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{userDetail.id}</span></div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                          {!userDetail.isBanned ? (
                            <button onClick={() => { banUser(userDetail.id); setUserDetail({...userDetail, isBanned: true}); }}
                              style={{ padding: '6px 14px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', cursor: 'pointer' }}>🚫 Ban</button>
                          ) : (
                            <button onClick={() => { unbanUser(userDetail.id); setUserDetail({...userDetail, isBanned: false}); }}
                              style={{ padding: '6px 14px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981', cursor: 'pointer' }}>✅ Unban</button>
                          )}
                          <button onClick={() => deleteUser(userDetail.id)}
                            style={{ padding: '6px 14px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: 'rgba(239,68,68,0.05)', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer' }}>🗑️ Delete</button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* User List */}
              <div className="card">
                <div className="card-header"><h3>👥 All Users ({filteredUsers.length})</h3></div>
                <div className="card-body" style={{ maxHeight: 600, overflowY: 'auto' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 60px 70px 80px 60px 80px', gap: 8, padding: '8px 0', borderBottom: '2px solid var(--border)', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    <span></span><span>User</span><span>Age</span><span>Gender</span><span>Tier</span><span>Status</span><span>Actions</span>
                  </div>
                  {filteredUsers.map(user => (
                    <div key={user.id} onClick={() => viewUser(user.id)} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 60px 70px 80px 60px 80px', gap: 8, padding: '8px 0', borderBottom: '1px solid rgba(42,42,64,0.2)', alignItems: 'center', cursor: 'pointer', background: user.isBanned ? 'rgba(239,68,68,0.03)' : 'transparent', fontSize: 12 }}>
                      {user.images?.[0] ? <img src={user.images[0]} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} /> : <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>👤</div>}
                      <div>
                        <span style={{ fontWeight: 600 }}>{user.name || 'No name'}</span>
                        {user.isVerified && <span style={{ marginLeft: 4 }}>✅</span>}
                        {user.isBanned && <span style={{ marginLeft: 4 }}>🚫</span>}
                      </div>
                      <span style={{ color: 'var(--text-muted)' }}>{user.age || '—'}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{user.gender || '—'}</span>
                      <span style={{ fontSize: 10, color: !user.subscriptionTier || String(user.subscriptionTier).includes('free') ? 'var(--text-muted)' : '#f59e0b' }}>{String(user.subscriptionTier || 'free').replace('SubscriptionTier.','')}</span>
                      <span>{user.isOnline ? '🟢' : '⚫'}</span>
                      <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                        {!user.isBanned ? (
                          <button onClick={() => banUser(user.id)} style={{ padding: '2px 8px', borderRadius: 4, fontSize: 9, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', cursor: 'pointer' }}>Ban</button>
                        ) : (
                          <button onClick={() => unbanUser(user.id)} style={{ padding: '2px 8px', borderRadius: 4, fontSize: 9, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', color: '#10b981', cursor: 'pointer' }}>Unban</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ═══ REPORTS ═══ */}
          {tab === 'reports' && (
            <div className="card">
              <div className="card-header"><h3>🚨 User Reports</h3></div>
              <div className="card-body">
                {reports.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>No reports found.</div>
                ) : reports.map(r => {
                  const reporter = users.find(u => u.id === r.reporterId);
                  const reported = users.find(u => u.id === r.reportedUserId);
                  const isPending = !r.status || r.status === 'pending';
                  return (
                    <div key={r.id} style={{ padding: 16, marginBottom: 12, background: 'var(--bg-secondary)', borderRadius: 12, border: `1px solid ${isPending ? 'rgba(239,68,68,0.3)' : 'var(--border)'}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <span style={{ fontSize: 10, padding: '3px 10px', borderRadius: 6, fontWeight: 600, background: isPending ? 'rgba(239,68,68,0.15)' : r.status === 'resolved' ? 'rgba(16,185,129,0.15)' : 'rgba(85,85,112,0.15)', color: isPending ? '#ef4444' : r.status === 'resolved' ? '#10b981' : 'var(--text-muted)' }}>
                          {r.status || 'pending'}
                        </span>
                        <span style={{ fontSize: 10, padding: '3px 10px', borderRadius: 6, fontWeight: 600, background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
                          {r.reason || 'No reason'}
                        </span>
                        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>{formatDate(r.createdAt)}</span>
                      </div>
                      <div style={{ fontSize: 13, marginBottom: 8 }}>
                        <strong>Reported:</strong> {reported?.name || r.reportedUserId} · <strong>By:</strong> {reporter?.name || r.reporterId}
                      </div>
                      {r.details && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8, padding: 8, background: 'var(--bg-card)', borderRadius: 6 }}>{r.details}</div>}
                      {isPending && (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => { banUser(r.reportedUserId); resolveReport(r.id); }}
                            style={{ padding: '6px 14px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', cursor: 'pointer' }}>🚫 Ban & Resolve</button>
                          <button onClick={() => resolveReport(r.id)}
                            style={{ padding: '6px 14px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981', cursor: 'pointer' }}>✅ Resolve</button>
                          <button onClick={() => dismissReport(r.id)}
                            style={{ padding: '6px 14px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer' }}>Dismiss</button>
                          <button onClick={() => viewUser(r.reportedUserId)}
                            style={{ padding: '6px 14px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--accent-purple-light)', cursor: 'pointer' }}>👤 View User</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ═══ MODERATION ═══ */}
          {tab === 'moderation' && (
            <>
              <div className="section-grid equal">
                <div className="card">
                  <div className="card-header"><h3>🚫 Banned Users ({users.filter(u=>u.isBanned).length})</h3></div>
                  <div className="card-body">
                    {users.filter(u => u.isBanned).length === 0 ? (
                      <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: 13 }}>No banned users</div>
                    ) : users.filter(u => u.isBanned).map(user => (
                      <div key={user.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid rgba(42,42,64,0.3)' }}>
                        {user.images?.[0] ? <img src={user.images[0]} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} /> : <span>👤</span>}
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{user.name} 🚫</div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{user.age} · {user.gender}</div>
                        </div>
                        <button onClick={() => unbanUser(user.id)} style={{ padding: '4px 10px', borderRadius: 4, fontSize: 10, background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981', cursor: 'pointer' }}>Unban</button>
                        <button onClick={() => deleteUser(user.id)} style={{ padding: '4px 10px', borderRadius: 4, fontSize: 10, background: 'rgba(239,68,68,0.05)', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer' }}>Delete</button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="card">
                  <div className="card-header"><h3>✅ Verified Users ({users.filter(u=>u.isVerified).length})</h3></div>
                  <div className="card-body" style={{ maxHeight: 400, overflowY: 'auto' }}>
                    {users.filter(u => u.isVerified).map(user => (
                      <div key={user.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid rgba(42,42,64,0.2)', fontSize: 12 }}>
                        {user.images?.[0] ? <img src={user.images[0]} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} /> : <span>👤</span>}
                        <span style={{ fontWeight: 500 }}>{user.name} ✅</span>
                        <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: 10 }}>{user.age} · {user.gender}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      )}

      <style jsx>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>
    </>
  );
}
