import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { hashEmailForGoogleCustomerMatch, hashPhoneNumberForGoogleCustomerMatch } from './hashing';

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

describe('hashPhoneNumberForGoogleCustomerMatch', () => {
  it('strips common punctuation before hashing, keeping a leading +', () => {
    const withPunctuation = hashPhoneNumberForGoogleCustomerMatch('+1 (555) 123-4567');
    const digitsOnly = hashPhoneNumberForGoogleCustomerMatch('+15551234567');
    expect(withPunctuation).toBe(digitsOnly);
  });

  it('matches a direct SHA-256 hex digest of the E.164-normalized number', () => {
    const expected = createHash('sha256').update('+15551234567').digest('hex');
    expect(hashPhoneNumberForGoogleCustomerMatch('+1 (555) 123-4567')).toBe(expected);
  });

  it('hashes a number with no leading + as digits-only, never guessing a country code', () => {
    const expected = createHash('sha256').update('5551234567').digest('hex');
    expect(hashPhoneNumberForGoogleCustomerMatch('555-123-4567')).toBe(expected);
  });

  it('produces different hashes for different numbers', () => {
    expect(hashPhoneNumberForGoogleCustomerMatch('+15551234567')).not.toBe(hashPhoneNumberForGoogleCustomerMatch('+15559998888'));
  });
});
