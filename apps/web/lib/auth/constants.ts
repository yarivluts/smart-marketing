/**
 * Name of the httpOnly session cookie set by `app/api/auth/session/route.ts`.
 * Kept in its own edge-safe module (no firebase-admin import) so
 * `middleware.ts` can check for its presence without pulling in Node-only
 * dependencies.
 */
export const SESSION_COOKIE_NAME = 'growthos_session';
