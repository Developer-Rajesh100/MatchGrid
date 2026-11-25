// Public tournament pages all live under /t/:slug/...
export function tPath(slug, rest = '') {
  return `/t/${slug}${rest ? `/${rest}` : ''}`;
}
