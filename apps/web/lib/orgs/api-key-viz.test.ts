import { describe, expect, it } from 'vitest';
import { apiKeyUsageStatus, sortApiKeys, summarizeApiKeys, type ApiKeyLike } from './api-key-viz';

const NOW = Date.parse('2026-09-26T12:00:00.000Z');

const keys: ApiKeyLike[] = [
  { id: 'recent', environmentId: 'prod', scopes: ['ingest.write', 'mcp.read'], lastUsedAt: '2026-09-26T08:00:00.000Z' },
  { id: 'idle', environmentId: 'dev', scopes: ['ingest.write'], lastUsedAt: '2026-08-01T08:00:00.000Z' },
  { id: 'unused', environmentId: 'prod', scopes: ['metrics.write'] },
  { id: 'revoked-old', environmentId: 'prod', scopes: ['ingest.write'], lastUsedAt: '2026-09-25T08:00:00.000Z', revokedAt: '2026-09-01T00:00:00.000Z' },
  { id: 'revoked-new', environmentId: 'dev', scopes: ['mcp.read'], revokedAt: '2026-09-20T00:00:00.000Z' },
];

describe('apiKeyUsageStatus', () => {
  it('classifies by revocation first, then by how recently the key was used', () => {
    expect(keys.map((key) => apiKeyUsageStatus(key, NOW))).toEqual(['recent', 'idle', 'unused', 'revoked', 'revoked']);
  });
});

describe('summarizeApiKeys', () => {
  it('counts statuses, and scopes and environments over active keys only', () => {
    const stats = summarizeApiKeys(keys, NOW);
    expect(stats.total).toBe(5);
    expect(stats.byStatus).toEqual({ recent: 1, idle: 1, unused: 1, revoked: 2 });
    expect(stats.scopes).toEqual([
      { scope: 'ingest.write', count: 2 },
      { scope: 'mcp.read', count: 1 },
      { scope: 'metrics.write', count: 1 },
    ]);
    expect(Object.fromEntries(stats.activeByEnvironment)).toEqual({ prod: 2, dev: 1 });
  });
});

describe('sortApiKeys', () => {
  it('puts active keys first by last use, then revoked keys newest first', () => {
    expect(sortApiKeys(keys).map((key) => key.id)).toEqual(['recent', 'idle', 'unused', 'revoked-new', 'revoked-old']);
  });
});
