// Firebase Authentication handles passwords, verification/reset emails and Google sign-in.
// The platform server verifies the resulting ID token and issues its own HttpOnly session,
// so Firebase state is kept in memory only and signed out immediately after each exchange.
let loaded = null;
const PENDING_KEY = 'crateship-pending-profile';

async function sdk(config) {
  if (!config?.apiKey || !config?.projectId) throw new Error('Sign-in is not available right now.');
  if (!loaded) {
    loaded = Promise.all([import('firebase/app'), import('firebase/auth')]).then(([appModule, auth]) => {
      const app = appModule.initializeApp(config, 'crateship-auth');
      return { auth: auth.initializeAuth(app, { persistence: auth.inMemoryPersistence, popupRedirectResolver: auth.browserPopupRedirectResolver }), m: auth };
    }).catch(error => { loaded = null; throw error; });
  }
  return loaded;
}

const MESSAGES = {
  'auth/invalid-credential': 'Email or password is incorrect.',
  'auth/wrong-password': 'Email or password is incorrect.',
  'auth/user-not-found': 'Email or password is incorrect.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/email-already-in-use': 'An account already uses this email. Log in or reset your password.',
  'auth/password-does-not-meet-requirements': 'Use a password containing 12 to 128 characters.',
  'auth/weak-password': 'Use a password containing 12 to 128 characters.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
  'auth/user-disabled': 'This account is unavailable.',
  'auth/network-request-failed': 'Unable to reach the sign-in service. Check your connection and try again.',
  'auth/popup-closed-by-user': 'Google sign-in was closed before it finished.',
  'auth/cancelled-popup-request': 'Google sign-in was closed before it finished.',
  'auth/popup-blocked': 'Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.',
  'auth/account-exists-with-different-credential': 'This email already signs in with a different method.',
  'auth/requires-recent-login': 'Sign in again to confirm it is you.',
};
export function firebaseMessage(error) {
  return MESSAGES[error?.code] || (String(error?.code || '').startsWith('auth/') ? 'Sign-in could not be completed. Try again.' : error?.message || 'Sign-in could not be completed. Try again.');
}
function friendly(error) {
  if (error?.verificationPending) return error;
  const wrapped = new Error(firebaseMessage(error)); wrapped.code = error?.code; return wrapped;
}
const continueUrl = path => ({ url: `${location.origin}${path}` });

export function rememberPendingProfile(email, profile) {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify({ email: String(email).trim().toLowerCase(), ...profile })); } catch {}
}
export function pendingProfile(email) {
  try {
    const saved = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null');
    if (!saved || saved.email !== String(email || '').trim().toLowerCase()) return {};
    return { ...(saved.username ? { username: saved.username } : {}), ...(saved.displayName ? { displayName: saved.displayName } : {}) };
  } catch { return {}; }
}
export function clearPendingProfile() { try { localStorage.removeItem(PENDING_KEY); } catch {} }

async function tokenAndSignOut(auth, m, user) {
  try { return { idToken: await user.getIdToken(true), email: user.email }; }
  finally { await m.signOut(auth).catch(() => {}); }
}

export async function firebaseSignUp(config, { email, password, displayName }) {
  const { auth, m } = await sdk(config);
  try {
    const { user } = await m.createUserWithEmailAndPassword(auth, email, password);
    if (displayName) await m.updateProfile(user, { displayName }).catch(() => {});
    await m.sendEmailVerification(user, continueUrl('/login?verified=1'));
    await m.signOut(auth);
  } catch (error) { await m.signOut(auth).catch(() => {}); throw friendly(error); }
}

/** Returns a fresh ID token for a verified user; unverified users get a new link and an explanatory error. */
export async function firebasePasswordToken(config, email, password) {
  const { auth, m } = await sdk(config);
  try {
    const { user } = await m.signInWithEmailAndPassword(auth, email, password);
    if (!user.emailVerified) {
      let resent = true;
      try { await m.sendEmailVerification(user, continueUrl('/login?verified=1')); } catch { resent = false; }
      await m.signOut(auth).catch(() => {});
      const pending = new Error(resent ? 'Verify your email first. We sent a new link to ' + user.email + '.' : 'Verify your email first. Use the link we already sent to ' + user.email + '.');
      pending.verificationPending = true; throw pending;
    }
    return await tokenAndSignOut(auth, m, user);
  } catch (error) { await m.signOut(auth).catch(() => {}); throw friendly(error); }
}

export async function firebaseGoogleToken(config) {
  const { auth, m } = await sdk(config);
  try {
    const provider = new m.GoogleAuthProvider(); provider.setCustomParameters({ prompt: 'select_account' });
    const { user } = await m.signInWithPopup(auth, provider);
    return await tokenAndSignOut(auth, m, user);
  } catch (error) { await m.signOut(auth).catch(() => {}); throw friendly(error); }
}

export async function firebaseResetPassword(config, email) {
  const { auth, m } = await sdk(config);
  try { await m.sendPasswordResetEmail(auth, email, continueUrl('/login')); }
  catch (error) {
    // Do not reveal whether an account exists.
    if (['auth/user-not-found', 'auth/invalid-credential'].includes(error?.code)) return;
    throw friendly(error);
  }
}
