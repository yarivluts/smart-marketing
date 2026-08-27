import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  hashEmailForGoogleCustomerMatch,
  hashNameForGoogleCustomerMatch,
  hashPhoneForGoogleCustomerMatch,
  normalizeCityForGoogleCustomerMatch,
  normalizeCountryCodeForGoogleCustomerMatch,
  normalizeMobileIdForGoogleCustomerMatch,
  normalizePostalCodeForGoogleCustomerMatch,
  normalizeStateForGoogleCustomerMatch,
} from './hashing';

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

describe('normalizeMobileIdForGoogleCustomerMatch', () => {
  it('trims and lowercases the MAID, but does not hash it', () => {
    expect(normalizeMobileIdForGoogleCustomerMatch('  38400000-8CF0-11BD-B23E-10B96E4EF00D  ')).toBe('38400000-8cf0-11bd-b23e-10b96e4ef00d');
  });

  it('is not a SHA-256 hash, unlike every other identifier in this file', () => {
    const normalized = normalizeMobileIdForGoogleCustomerMatch('38400000-8cf0-11bd-b23e-10b96e4ef00d');
    expect(normalized).not.toMatch(/^[0-9a-f]{64}$/);
    expect(normalized).not.toBe(createHash('sha256').update('38400000-8cf0-11bd-b23e-10b96e4ef00d').digest('hex'));
  });

  it('produces the same value for MAIDs that only differ by case or surrounding whitespace', () => {
    expect(normalizeMobileIdForGoogleCustomerMatch('38400000-8cf0-11bd-b23e-10b96e4ef00d')).toBe(
      normalizeMobileIdForGoogleCustomerMatch('  38400000-8CF0-11BD-B23E-10B96E4EF00D  '),
    );
  });
});

describe('hashNameForGoogleCustomerMatch', () => {
  it('trims and lowercases before hashing', () => {
    expect(hashNameForGoogleCustomerMatch('  Ada  ')).toBe(createHash('sha256').update('ada').digest('hex'));
  });

  it('produces the same hash for names that only differ by case or surrounding whitespace', () => {
    expect(hashNameForGoogleCustomerMatch('Ada')).toBe(hashNameForGoogleCustomerMatch(' ADA '));
  });
});

describe('normalizeCityForGoogleCustomerMatch', () => {
  it('only trims surrounding whitespace and does not hash', () => {
    const normalized = normalizeCityForGoogleCustomerMatch('  New York  ');
    expect(normalized).toBe('New York');
    expect(normalized).not.toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('normalizeStateForGoogleCustomerMatch', () => {
  it('only trims surrounding whitespace and does not hash', () => {
    expect(normalizeStateForGoogleCustomerMatch('  CA  ')).toBe('CA');
  });
});

describe('normalizeCountryCodeForGoogleCustomerMatch', () => {
  it('trims and uppercases, unlike Meta which lowercases its COUNTRY field', () => {
    expect(normalizeCountryCodeForGoogleCustomerMatch('  us  ')).toBe('US');
  });
});

describe('normalizePostalCodeForGoogleCustomerMatch', () => {
  it('only trims surrounding whitespace and does not truncate a zip+4 value, unlike Meta', () => {
    expect(normalizePostalCodeForGoogleCustomerMatch('  94103-1234  ')).toBe('94103-1234');
  });
});
