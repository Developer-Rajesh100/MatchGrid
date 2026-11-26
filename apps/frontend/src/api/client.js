import { buildApiUrl } from '../config';
import { clearSession, session } from './session';

/**
 * `path` plus a query string built from `params`, skipping empty values. `slug` is accepted as an
 * alias of `tournament_slug`, and a bare string means a tournament id.
 */
export function withQuery(path, params = {}) {
  const source = typeof params === 'string' ? { tournament_id: params } : params || {};
  const { slug, ...rest } = source;
  const entries = Object.entries({ ...rest, tournament_slug: rest.tournament_slug || slug })
    .filter(([, value]) => value !== undefined && value !== null && value !== '');
  const qs = new URLSearchParams(entries).toString();
  return qs ? `${path}?${qs}` : path;
}

export async function apiClient(endpoint, options = {}) {
  const token = session.token();
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const config = {
    ...options,
    headers,
  };

  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    config.body = JSON.stringify(options.body);
  }

  const response = await fetch(buildApiUrl(endpoint), config);

  if (response.status === 401 && token) {
    // The session expired or was revoked (e.g. the account was deactivated).
    clearSession('expired');
  }

  if (!response.ok) {
    let errorDetail = 'An error occurred';
    try {
      const errorJson = await response.json();
      errorDetail = errorJson.detail || errorDetail;
      if (Array.isArray(errorDetail)) {
        // FastAPI validation errors: [{loc: [...], msg: '...'}, ...]
        errorDetail = errorDetail
          .map((e) => (e?.loc ? `${e.loc.slice(1).join('.') || e.loc[0]}: ${e.msg}` : e?.msg))
          .filter(Boolean)
          .join('; ');
      } else if (typeof errorDetail === 'object') {
        errorDetail = JSON.stringify(errorDetail);
      }
    } catch {
      errorDetail = response.statusText || errorDetail;
    }
    throw new Error(errorDetail);
  }

  // Check if no content response
  if (response.status === 204) {
    return null;
  }

  return response.json();
}
