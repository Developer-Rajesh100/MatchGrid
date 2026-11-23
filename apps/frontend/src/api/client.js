const BASE_URL = '';

export async function apiClient(endpoint, options = {}) {
  const token =
    localStorage.getItem('matchgrid_admin_token') ||
    localStorage.getItem('dcl_admin_token');
  const headers = {
    'Content-Type': 'application/json',
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

  const response = await fetch(`${BASE_URL}${endpoint}`, config);

  if (response.status === 401) {
    // Auth expired or invalid
    localStorage.removeItem('matchgrid_admin_token');
    localStorage.removeItem('matchgrid_admin_username');
    localStorage.removeItem('dcl_admin_token');
    localStorage.removeItem('dcl_admin_username');
    window.dispatchEvent(new Event('matchgrid-auth-changed'));
    window.dispatchEvent(new Event('dcl-auth-changed'));
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
