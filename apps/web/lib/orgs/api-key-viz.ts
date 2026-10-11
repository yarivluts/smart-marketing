import { isWithinDays } from './recency';

/**
 * Status and summary shaping for the API keys page, over the key summaries the page already loads.
 */

export interface ApiKeyLike {
  id: string;
  environmentId: string;
  scopes: readonly string[];
  lastUsedAt?: string;
  revokedAt?: string;
}

/**
 * - `recent`: active and used within the last 7 days.
 * - `idle`: active, used before, but not in the last 7 days.
 * - `unused`: active and never used.
 * - `revoked`: no longer accepted.
 */
export type ApiKeyUsageStatus = 'recent' | 'idle' | 'unused' | 'revoked';

export const RECENT_USE_DAYS = 7;

export function apiKeyUsageStatus(key: ApiKeyLike, nowMs: number): ApiKeyUsageStatus {
  if (key.revokedAt) return 'revoked';
  if (!key.lastUsedAt) return 'unused';
  return isWithinDays(key.lastUsedAt, nowMs, RECENT_USE_DAYS) ? 'recent' : 'idle';
}

export interface ApiKeySummaryStats {
  total: number;
  byStatus: Record<ApiKeyUsageStatus, number>;
  /** How many active keys carry each scope, most common first. */
  scopes: { scope: string; count: number }[];
  /** Active keys per environment id. */
  activeByEnvironment: Map<string, number>;
}

export function summarizeApiKeys(keys: readonly ApiKeyLike[], nowMs: number): ApiKeySummaryStats {
  const byStatus: Record<ApiKeyUsageStatus, number> = { recent: 0, idle: 0, unused: 0, revoked: 0 };
  const scopeCounts = new Map<string, number>();
  const activeByEnvironment = new Map<string, number>();
  for (const key of keys) {
    const status = apiKeyUsageStatus(key, nowMs);
    byStatus[status] += 1;
    if (status === 'revoked') continue;
    activeByEnvironment.set(key.environmentId, (activeByEnvironment.get(key.environmentId) ?? 0) + 1);
    for (const scope of key.scopes) scopeCounts.set(scope, (scopeCounts.get(scope) ?? 0) + 1);
  }
  return {
    total: keys.length,
    byStatus,
    scopes: [...scopeCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([scope, count]) => ({ scope, count })),
    activeByEnvironment,
  };
}

/** Active keys first, most recently used first (never-used after used ones); then revoked keys, most recently revoked first. */
export function sortApiKeys<T extends ApiKeyLike>(keys: readonly T[]): T[] {
  return [...keys].sort((a, b) => {
    if (Boolean(a.revokedAt) !== Boolean(b.revokedAt)) return a.revokedAt ? 1 : -1;
    if (a.revokedAt && b.revokedAt) return b.revokedAt.localeCompare(a.revokedAt);
    return (b.lastUsedAt ?? '').localeCompare(a.lastUsedAt ?? '');
  });
}
