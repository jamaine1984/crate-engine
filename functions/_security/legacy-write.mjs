import { requireUser } from '../../platform/server/identity.mjs';
import { requireMutationOrigin } from '../../platform/server/common.mjs';

function denied(message, status = 403) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

export async function requireLegacyWriteUser(context) {
  if (context.legacyWriteUser) return context.legacyWriteUser;
  requireMutationOrigin(context.request, context.env);
  const user = await requireUser(context.request, context.env);
  if (!user?.id || user.emailVerified !== true) denied('A verified account is required.');
  context.legacyWriteUser = user;
  return user;
}

export async function readVerifiedUser(context) {
  if (context.legacyWriteUser) return context.legacyWriteUser;
  if (!/(?:^|;\s*)(?:__Host-crateship_session|crateship_session_local)=/.test(context.request.headers.get('Cookie') || '')) return null;
  try { return await requireUser(context.request, context.env); } catch { return null; }
}

export function legacyRoleForUser(user) {
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  if (roles.includes('OWNER') || roles.includes('PLATFORM_ADMIN')) return 'admin';
  if (roles.includes('MODERATOR')) return 'moderator';
  if (roles.includes('CONTENT_MANAGER')) return 'curator';
  return null;
}

export async function requireLegacyAdminWrite(context, action = 'admin') {
  const user = await requireLegacyWriteUser(context);
  const role = legacyRoleForUser(user);
  const permitted = role === 'admin' ||
    (role === 'moderator' && ['visibility', 'moderationStatus'].includes(action)) ||
    (role === 'curator' && action === 'featured');
  if (!permitted) denied('Your account role cannot perform this action.');
  // The owner role requires an MFA-authenticated session for privileged changes.
  if (user.roles.includes('OWNER') && (!user.mfaTime || Date.now() / 1000 - user.mfaTime > 900)) {
    denied('Recent owner MFA verification is required.');
  }
  return user;
}

export async function accountOwnerHash(user) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`account:${user.id}`));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
