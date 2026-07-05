import type { Environment } from './env';

/**
 * API-key prefixes per plan 08. Live keys act on production data; test keys are
 * sandboxed. The env determines which prefix a minted key carries.
 */
export const API_KEY_PREFIXES = {
  live: 'gos_live_',
  test: 'gos_test_',
} as const;

export type ApiKeyMode = keyof typeof API_KEY_PREFIXES;

/** Returns the mode implied by a key string, or null if it is not a GrowthOS key. */
export function apiKeyMode(key: string): ApiKeyMode | null {
  if (key.startsWith(API_KEY_PREFIXES.live)) return 'live';
  if (key.startsWith(API_KEY_PREFIXES.test)) return 'test';
  return null;
}

/** Only `prod` acts on live/production data (KAN-28); `dev`/`staging` are always sandboxed test keys. */
export function apiKeyModeForEnvironment(environment: Environment): ApiKeyMode {
  return environment === 'prod' ? 'live' : 'test';
}
