import { describe, expect, it } from 'vitest';
import {
  isEnvironment,
  ok,
  err,
  apiKeyMode,
  apiKeyModeForEnvironment,
  API_KEY_PREFIXES,
  API_KEY_SCOPES,
  isApiKeyScope,
  PERMISSIONS,
} from './index';

describe('env', () => {
  it('recognises valid environments', () => {
    expect(isEnvironment('dev')).toBe(true);
    expect(isEnvironment('prod')).toBe(true);
  });

  it('rejects unknown environments', () => {
    expect(isEnvironment('local')).toBe(false);
  });
});

describe('result', () => {
  it('wraps success and failure', () => {
    expect(ok(42)).toEqual({ ok: true, value: 42 });
    expect(err('boom')).toEqual({ ok: false, error: 'boom' });
  });
});

describe('apiKeyMode', () => {
  it('detects live and test keys', () => {
    expect(apiKeyMode(`${API_KEY_PREFIXES.live}abc`)).toBe('live');
    expect(apiKeyMode(`${API_KEY_PREFIXES.test}abc`)).toBe('test');
  });

  it('returns null for foreign keys', () => {
    expect(apiKeyMode('sk_live_123')).toBeNull();
  });
});

describe('apiKeyModeForEnvironment', () => {
  it('maps prod to live and every other environment to test', () => {
    expect(apiKeyModeForEnvironment('prod')).toBe('live');
    expect(apiKeyModeForEnvironment('staging')).toBe('test');
    expect(apiKeyModeForEnvironment('dev')).toBe('test');
  });
});

describe('API_KEY_SCOPES', () => {
  it('is a non-empty subset of the full permission catalog', () => {
    expect(API_KEY_SCOPES.length).toBeGreaterThan(0);
    for (const scope of API_KEY_SCOPES) {
      expect(PERMISSIONS).toContain(scope);
    }
  });

  it('withholds elevated/administrative permissions from key scopes', () => {
    for (const elevated of [
      'project.manage',
      'members.manage',
      'billing.manage',
      'resources.manage',
      'keys.manage',
      'automation.approve',
      'automation.execute',
      'pii.read',
      'plugin.install',
    ] as const) {
      expect(API_KEY_SCOPES).not.toContain(elevated);
    }
  });

  it('isApiKeyScope recognises only the curated subset', () => {
    expect(isApiKeyScope('ingest.write')).toBe(true);
    expect(isApiKeyScope('billing.manage')).toBe(false);
    expect(isApiKeyScope('not-a-real-permission')).toBe(false);
  });
});
