import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { hashEmailForGoogleCustomerMatch, hashPhoneForGoogleCustomerMatch } from './hashing';

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

describe('hashPhoneForGoogleCustomerMatch', () => {
  it('formats to E.164 (leading + kept, all other punctuation stripped) before hashing, unlike Meta which drops the +', () => {
    const expected = createHash('sha256').update('+14155550100').digest('hex');
    expect(hashPhoneForGoogleCustomerMatch('+1 (415) 555-0100')).toBe(expected);
  });

  it('produces the same hash for phone numbers that only differ by formatting or surrounding whitespace', () => {
    expect(hashPhoneForGoogleCustomerMatch('+14155550100')).toBe(hashPhoneForGoogleCustomerMatch('  +1-415-555-0100  '));
  });

  it('produces different hashes for different phone numbers', () => {
    expect(hashPhoneForGoogleCustomerMatch('+14155550100')).not.toBe(hashPhoneForGoogleCustomerMatch('+14155550101'));
  });

  it('produces a 64-character lowercase hex digest', () => {
    const hash = hashPhoneForGoogleCustomerMatch('+14155550100');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
