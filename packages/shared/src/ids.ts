import type { Environment } from './env';

/**
 * API-key prefixes per plan 08. Live keys act on production data; test keys are
 * sandboxed. The env determines which prefix a minted key carries.
 */
export const API_KEY_PREFIXES = {
  live: 'gos_live_',
  test: 'gos_test_',
} as const;

/**
 * Prefixes of publishable (browser) keys: safe to ship in a page's source, so they can only send
 * events, and only from the origins they allow (see `api-key-origins.ts`).
 */
export const PUBLISHABLE_API_KEY_PREFIXES = {
  live: 'gos_pk_live_',
  test: 'gos_pk_test_',
} as const;

export type ApiKeyMode = keyof typeof API_KEY_PREFIXES;

/** A secret key is held by a server; a publishable key may sit in a web page. */
export const API_KEY_KINDS = ['secret', 'publishable'] as const;
export type ApiKeyKind = (typeof API_KEY_KINDS)[number];

/** Returns the mode implied by a key string, or null if it is not a GrowthOS key. */
export function apiKeyMode(key: string): ApiKeyMode | null {
  if (key.startsWith(API_KEY_PREFIXES.live) || key.startsWith(PUBLISHABLE_API_KEY_PREFIXES.live)) return 'live';
  if (key.startsWith(API_KEY_PREFIXES.test) || key.startsWith(PUBLISHABLE_API_KEY_PREFIXES.test)) return 'test';
  return null;
}

/** Returns which kind of key a string looks like, or null if it is not a GrowthOS key. */
export function apiKeyKindOf(key: string): ApiKeyKind | null {
  if (key.startsWith(PUBLISHABLE_API_KEY_PREFIXES.live) || key.startsWith(PUBLISHABLE_API_KEY_PREFIXES.test)) return 'publishable';
  if (key.startsWith(API_KEY_PREFIXES.live) || key.startsWith(API_KEY_PREFIXES.test)) return 'secret';
  return null;
}

/** Only `prod` acts on live/production data (KAN-28); `dev`/`staging` are always sandboxed test keys. */
export function apiKeyModeForEnvironment(environment: Environment): ApiKeyMode {
  return environment === 'prod' ? 'live' : 'test';
}
