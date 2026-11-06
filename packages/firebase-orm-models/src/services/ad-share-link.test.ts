import 'reflect-metadata';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  adShareLinkExpiry,
  adShareLinkStatus,
  generateAdShareToken,
  hashAdShareToken,
  isWellFormedAdShareToken,
  validateAdShareLinkInput,
} from './ad-share-link.service';

describe('ad share link helpers', () => {
  it('mints 32-byte base64url tokens that are all different', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateAdShareToken()));
    expect(tokens.size).toBe(50);
    for (const token of tokens) {
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(Buffer.from(token, 'base64url')).toHaveLength(32);
      expect(isWellFormedAdShareToken(token)).toBe(true);
    }
  });

  it('stores a token as its sha256 hex digest, never the token', () => {
    const token = generateAdShareToken();
    const hash = hashAdShareToken(token);
    expect(hash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
  });

  it('rejects junk that could never be a token', () => {
    for (const junk of ['', 'abc', `${'a'.repeat(42)}=`, `${'a'.repeat(42)}/`, 'a'.repeat(44), '../../etc/passwd']) {
      expect(isWellFormedAdShareToken(junk)).toBe(false);
    }
  });

  it('reads a link as active, expired at its deadline, or revoked whatever its deadline', () => {
    const now = new Date('2026-11-06T10:00:00.000Z');
    expect(adShareLinkStatus({ expires_on: '2026-11-07T00:00:00.000Z' }, now)).toBe('active');
    expect(adShareLinkStatus({ expires_on: now.toISOString() }, now)).toBe('expired');
    expect(adShareLinkStatus({ expires_on: '2026-11-01T00:00:00.000Z' }, now)).toBe('expired');
    expect(adShareLinkStatus({ expires_on: '2027-01-01T00:00:00.000Z', revoked_on: '2026-11-05T00:00:00.000Z' }, now)).toBe('revoked');
  });

  it('counts the expiry in whole days from now', () => {
    expect(adShareLinkExpiry(30, new Date('2026-11-06T10:00:00.000Z'))).toBe('2026-12-06T10:00:00.000Z');
  });

  it('accepts the offered expiries and a short label, and a list or all ads', () => {
    expect(validateAdShareLinkInput({ briefIds: null, label: '', expiresInDays: 30 })).toEqual([]);
    expect(validateAdShareLinkInput({ briefIds: ['b1'], label: 'Dana', expiresInDays: 7 })).toEqual([]);
    expect(validateAdShareLinkInput({ briefIds: null, label: 'x'.repeat(81), expiresInDays: 365 })).toEqual(['invalid_expiry', 'label_too_long']);
    expect(validateAdShareLinkInput({ briefIds: [], label: '', expiresInDays: 90 })).toEqual(['no_briefs']);
    expect(validateAdShareLinkInput({ briefIds: ['a/b'], label: '', expiresInDays: 90 })).toEqual(['invalid_brief_id']);
    expect(validateAdShareLinkInput({ briefIds: Array.from({ length: 21 }, (_, i) => `b${i}`), label: '', expiresInDays: 90 })).toEqual(['too_many_briefs']);
  });
});
