import { describe, expect, it } from 'vitest';
import { resolveRedirectTarget } from './redirect-target';

describe('resolveRedirectTarget', () => {
  it('defaults to /start when there is no from param', () => {
    expect(resolveRedirectTarget(null)).toBe('/start');
  });

  it('defaults to /start for an empty from param', () => {
    expect(resolveRedirectTarget('')).toBe('/start');
  });

  it('honors a safe, same-app relative path', () => {
    expect(resolveRedirectTarget('/en/settings')).toBe('/en/settings');
  });

  it('rejects a protocol-relative path (open-redirect vector)', () => {
    expect(resolveRedirectTarget('//evil.example.com')).toBe('/start');
  });

  it('rejects an absolute URL (open-redirect vector)', () => {
    expect(resolveRedirectTarget('https://evil.example.com')).toBe('/start');
  });

  it('rejects a path with no leading slash', () => {
    expect(resolveRedirectTarget('dashboard')).toBe('/start');
  });

  it('rejects a leading-backslash protocol-relative bypass (open-redirect vector)', () => {
    expect(resolveRedirectTarget('/\\evil.example.com')).toBe('/start');
  });

  it('rejects a backslash-prefixed path even with a following slash', () => {
    expect(resolveRedirectTarget('/\\/evil.example.com')).toBe('/start');
  });

  it('rejects a same-app path containing a backslash anywhere', () => {
    expect(resolveRedirectTarget('/en/settings\\evil.example.com')).toBe('/start');
  });
});
