import { describe, expect, it } from 'vitest';
import { isEnvironment, ok, err, apiKeyMode, API_KEY_PREFIXES } from './index';

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
