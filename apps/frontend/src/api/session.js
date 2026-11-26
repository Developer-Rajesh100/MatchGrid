// The signed-in session, kept in localStorage. This module is the only place that knows the keys.
// Listeners subscribe to AUTH_CHANGED_EVENT (detail.reason: 'login' | 'logout' | 'expired').

export const AUTH_CHANGED_EVENT = 'matchgrid-auth-changed';

const KEYS = {
  token: 'matchgrid_admin_token',
  username: 'matchgrid_admin_username',
  role: 'matchgrid_role',
  userId: 'matchgrid_user_id',
};

const read = (key) => localStorage.getItem(KEYS[key]) || '';

export const session = {
  token: () => read('token'),
  username: () => read('username'),
  role: () => read('role'),
  userId: () => read('userId'),
};

function notify(reason) {
  window.dispatchEvent(new CustomEvent(AUTH_CHANGED_EVENT, { detail: { reason } }));
}

export function saveSession({ token, username, role, userId }) {
  localStorage.setItem(KEYS.token, token);
  localStorage.setItem(KEYS.username, username || '');
  localStorage.setItem(KEYS.role, role || '');
  localStorage.setItem(KEYS.userId, userId || '');
  notify('login');
}

/** Forgets the whole session (token, name, role and id together, never a partial one). */
export function clearSession(reason = 'logout') {
  Object.values(KEYS).forEach((key) => localStorage.removeItem(key));
  notify(reason);
}
