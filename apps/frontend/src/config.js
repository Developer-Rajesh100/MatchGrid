// Where the API lives. Both values are optional and read at build time:
//   VITE_API_URL  e.g. https://matchgrid-api.onrender.com   (REST)
//   VITE_WS_URL   e.g. wss://matchgrid-api.onrender.com     (live WebSocket; derived from VITE_API_URL when omitted)
// Left empty, everything stays same-origin: the Vite dev proxy locally, nginx in Docker Compose.

const trimSlash = (value) => (value || '').trim().replace(/\/+$/, '');

/** Prefix for REST calls ('' = same origin). */
export function resolveApiBase(env = import.meta.env) {
  return trimSlash(env?.VITE_API_URL);
}

/** Full URL of an API endpoint such as '/api/matches'. */
export function buildApiUrl(endpoint, base = resolveApiBase()) {
  return `${base}${endpoint}`;
}

/** Full URL of the live socket, with an optional query string such as '?tournament_id=abc'. */
export function buildWsUrl(query = '', env = import.meta.env, location = window.location) {
  const explicit = trimSlash(env?.VITE_WS_URL);
  const api = resolveApiBase(env);
  let base;
  if (explicit) {
    base = explicit;
  } else if (api) {
    base = api.replace(/^http/i, 'ws'); // https -> wss, http -> ws
  } else {
    base = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`;
  }
  return `${base}/ws/live${query}`;
}
