const DEFAULT_REDIRECT_PATH = '/dashboard';

/**
 * Resolves where to send the user after sign-in/sign-up. `from` comes from
 * the `?from=` query param `middleware.ts` attaches when it redirects an
 * unauthenticated visitor away from a protected route — only ever accepted
 * if it's a same-app relative path, never an absolute or protocol-relative
 * URL, so a crafted `?from=` link can't be used to redirect off-site.
 *
 * Backslashes are rejected too: browsers normalize a leading `\` to `/` when
 * resolving an href against an http(s) base, so `/\evil.com` would otherwise
 * pass the leading-slash check here but resolve to the protocol-relative
 * `//evil.com` once handed to `router.push`.
 */
export function resolveRedirectTarget(from: string | null): string {
  if (from && from.startsWith('/') && !from.startsWith('//') && !from.includes('\\')) {
    return from;
  }
  return DEFAULT_REDIRECT_PATH;
}
