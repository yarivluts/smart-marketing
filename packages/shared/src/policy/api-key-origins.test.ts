import { describe, expect, it } from 'vitest';
import { allowedOriginsIssue, isOriginAllowed, normalizeAllowedOrigin, normalizeAllowedOrigins } from './api-key-origins';
import { apiKeyKindOf, apiKeyMode } from '../ids';

describe('allowed origins of a publishable key', () => {
  it('keeps scheme, host and a non-default port, lower-cased; refuses paths, queries, credentials and plain http off localhost', () => {
    expect(normalizeAllowedOrigin(' https://App.Example.com/ ')).toBe('https://app.example.com');
    expect(normalizeAllowedOrigin('https://example.com:443')).toBe('https://example.com');
    expect(normalizeAllowedOrigin('http://localhost:3000')).toBe('http://localhost:3000');
    expect(normalizeAllowedOrigin('https://*.Example.com')).toBe('https://*.example.com');
    expect(normalizeAllowedOrigin('https://example.com/app')).toBeNull();
    expect(normalizeAllowedOrigin('https://example.com?x=1')).toBeNull();
    expect(normalizeAllowedOrigin('https://user:pw@example.com')).toBeNull();
    expect(normalizeAllowedOrigin('http://example.com')).toBeNull();
    expect(normalizeAllowedOrigin('https://*.com')).toBeNull();
    expect(normalizeAllowedOrigin('ftp://example.com')).toBeNull();
    expect(normalizeAllowedOrigin('example.com')).toBeNull();
  });

  it('says why a list cannot be saved, and stores it without repeats', () => {
    expect(allowedOriginsIssue([])).toBe('no_origins');
    expect(allowedOriginsIssue(['https://a.com', 'nope'])).toBe('invalid_origin');
    expect(allowedOriginsIssue(Array.from({ length: 21 }, (_, i) => `https://a${i}.com`))).toBe('too_many_origins');
    expect(allowedOriginsIssue(['https://a.com'])).toBeNull();
    expect(normalizeAllowedOrigins(['https://A.com', 'https://a.com/', 'bad'])).toEqual(['https://a.com']);
  });

  it('matches an exact origin or a subdomain wildcard, never the bare domain of a wildcard or another scheme', () => {
    const allowed = ['https://easysign.example', 'https://*.easysign.example', 'http://localhost:3000'];
    expect(isOriginAllowed('https://easysign.example', allowed)).toBe(true);
    expect(isOriginAllowed('https://www.easysign.example', allowed)).toBe(true);
    expect(isOriginAllowed('https://a.b.easysign.example', allowed)).toBe(true);
    expect(isOriginAllowed('http://localhost:3000', allowed)).toBe(true);
    expect(isOriginAllowed('http://localhost:3001', allowed)).toBe(false);
    expect(isOriginAllowed('https://evil-easysign.example', allowed)).toBe(false);
    expect(isOriginAllowed('https://easysign.example.evil.com', allowed)).toBe(false);
    expect(isOriginAllowed('https://*.easysign.example', allowed)).toBe(false);
    expect(isOriginAllowed('null', allowed)).toBe(false);
    expect(isOriginAllowed(undefined, allowed)).toBe(false);
    expect(isOriginAllowed('https://www.easysign.example', ['https://easysign.example'])).toBe(false);
  });

  it('tells a publishable key from a secret one by its prefix', () => {
    expect(apiKeyKindOf('gos_pk_live_abc')).toBe('publishable');
    expect(apiKeyKindOf('gos_pk_test_abc')).toBe('publishable');
    expect(apiKeyKindOf('gos_live_abc')).toBe('secret');
    expect(apiKeyKindOf('sk_live')).toBeNull();
    expect(apiKeyMode('gos_pk_live_abc')).toBe('live');
    expect(apiKeyMode('gos_pk_test_abc')).toBe('test');
  });
});
