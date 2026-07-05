const DEFAULT_REDIRECT_PATH = '/dashboard';

/**
 * Resolves where to send the user after sign-in/sign-up. `from` comes from
 * the `?from=` query param `middleware.ts` attaches when it redirects an
 * unauthenticated visitor away from a protected route — only ever accepted
 * if it's a same-app relative path, never an absolute or protocol-relative
 * URL, so a crafted `?from=` link can't be used to redirect off-site.
 */
export function resolveRedirectTarget(from: string | null): string {
  if (from && from.startsWith('/') && !from.startsWith('//')) {
    return from;
  }
  return DEFAULT_REDIRECT_PATH;
}
