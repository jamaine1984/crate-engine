import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, orderBy, limit, getDocs, doc, updateDoc, getDoc, onSnapshot, getCountFromServer } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyB9UG-RTfFzHbm-dWDQb3BVzKlpifppmpk',
  authDomain: 'midnight-singles-international.firebaseapp.com',
  projectId: 'midnight-singles-international',
  storageBucket: 'midnight-singles-international.firebasestorage.app',
  messagingSenderId: '730878017264',
  appId: '1:730878017264:ios:2e7cd57851bb3461c24c35',
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// ── Auth ──
export async function adminLogin(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

// ── Users ──
export async function getUsers(limitCount = 50) {
  const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(limitCount));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getUserCount() {
  try {
    const snap = await getCountFromServer(collection(db, 'users'));
    return snap.data().count;
  } catch { return 0; }
}

// ── Selfie Verification ──
export async function getPendingVerifications() {
  try {
    const q = query(collection(db, 'users'), where('verificationStatus', '==', 1), limit(50));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch { return []; }
}

export async function approveVerification(userId) {
  await updateDoc(doc(db, 'users', userId), { verificationStatus: 2, isVerified: true });
}

export async function rejectVerification(userId) {
  await updateDoc(doc(db, 'users', userId), { verificationStatus: 0, isVerified: false });
}

// ── Block/Ban ──
export async function blockUser(userId) {
  await updateDoc(doc(db, 'users', userId), { isBanned: true });
}

export async function unblockUser(userId) {
  await updateDoc(doc(db, 'users', userId), { isBanned: false });
}

// ── Reports ──
export async function getReports(limitCount = 50) {
  try {
    const q = query(collection(db, 'reports'), orderBy('createdAt', 'desc'), limit(limitCount));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch { return []; }
}

// ── Stats ──
export async function getAppStats() {
  const stats = {};
  try { stats.totalUsers = (await getCountFromServer(collection(db, 'users'))).data().count; } catch { stats.totalUsers = 0; }
  try { stats.totalReports = (await getCountFromServer(collection(db, 'reports'))).data().count; } catch { stats.totalReports = 0; }
  try {
    const q = query(collection(db, 'users'), where('verificationStatus', '==', 1));
    stats.pendingVerifications = (await getCountFromServer(q)).data().count;
  } catch { stats.pendingVerifications = 0; }
  return stats;
}

export { collection, query, where, orderBy, limit, getDocs, doc, updateDoc, onSnapshot };
