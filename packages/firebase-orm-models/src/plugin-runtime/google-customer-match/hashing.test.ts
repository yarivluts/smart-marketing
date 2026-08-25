import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { hashEmailForGoogleCustomerMatch } from './hashing';

describe('hashEmailForGoogleCustomerMatch', () => {
  it('trims and lowercases before hashing', () => {
    const withPadding = hashEmailForGoogleCustomerMatch('  Ada@Example.com  ');
    const normalized = hashEmailForGoogleCustomerMatch('ada@example.com');
    expect(withPadding).toBe(normalized);
  });

  it('matches a direct SHA-256 hex digest of the normalized email', () => {
    const expected = createHash('sha256').update('ada@example.com').digest('hex');
    expect(hashEmailForGoogleCustomerMatch('Ada@Example.com')).toBe(expected);
  });

  it('produces different hashes for different emails', () => {
    expect(hashEmailForGoogleCustomerMatch('ada@example.com')).not.toBe(hashEmailForGoogleCustomerMatch('grace@example.com'));
  });
});
