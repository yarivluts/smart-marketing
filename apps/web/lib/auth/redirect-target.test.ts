import { describe, expect, it } from 'vitest';
import { resolveRedirectTarget } from './redirect-target';

describe('resolveRedirectTarget', () => {
  it('defaults to /dashboard when there is no from param', () => {
    expect(resolveRedirectTarget(null)).toBe('/dashboard');
  });

  it('defaults to /dashboard for an empty from param', () => {
    expect(resolveRedirectTarget('')).toBe('/dashboard');
  });

  it('honors a safe, same-app relative path', () => {
    expect(resolveRedirectTarget('/en/settings')).toBe('/en/settings');
  });

  it('rejects a protocol-relative path (open-redirect vector)', () => {
    expect(resolveRedirectTarget('//evil.example.com')).toBe('/dashboard');
  });

  it('rejects an absolute URL (open-redirect vector)', () => {
    expect(resolveRedirectTarget('https://evil.example.com')).toBe('/dashboard');
  });

  it('rejects a path with no leading slash', () => {
    expect(resolveRedirectTarget('dashboard')).toBe('/dashboard');
  });
});
