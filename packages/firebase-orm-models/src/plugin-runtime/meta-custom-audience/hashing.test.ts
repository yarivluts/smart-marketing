import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  hashCityForMetaCustomAudience,
  hashCountryForMetaCustomAudience,
  hashEmailForMetaCustomAudience,
  hashMobileDeviceIdForMetaCustomAudience,
  hashNameForMetaCustomAudience,
  hashPhoneForMetaCustomAudience,
  hashStateForMetaCustomAudience,
  hashZipForMetaCustomAudience,
} from './hashing';

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('hashEmailForMetaCustomAudience', () => {
  it('lowercases, trims, and SHA-256-hashes the email', () => {
    expect(hashEmailForMetaCustomAudience('  Jane.Doe@Example.com  ')).toBe(sha256Hex('jane.doe@example.com'));
  });

  it('produces the same hash for emails that only differ by case or surrounding whitespace', () => {
    expect(hashEmailForMetaCustomAudience('jane@example.com')).toBe(hashEmailForMetaCustomAudience(' JANE@EXAMPLE.COM '));
  });

  it('produces a 64-character lowercase hex digest', () => {
    const hash = hashEmailForMetaCustomAudience('jane@example.com');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('hashPhoneForMetaCustomAudience', () => {
  it('strips the leading + and all punctuation, keeping only digits, before hashing', () => {
    expect(hashPhoneForMetaCustomAudience('+1 (415) 555-0100')).toBe(sha256Hex('14155550100'));
  });

  it('produces the same hash for phone numbers that only differ by formatting or surrounding whitespace', () => {
    expect(hashPhoneForMetaCustomAudience('+14155550100')).toBe(hashPhoneForMetaCustomAudience('  1-415-555-0100  '));
  });

  it('produces a 64-character lowercase hex digest', () => {
    const hash = hashPhoneForMetaCustomAudience('+14155550100');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('hashMobileDeviceIdForMetaCustomAudience', () => {
  it('lowercases and trims the MAID before hashing, keeping internal hyphens', () => {
    expect(hashMobileDeviceIdForMetaCustomAudience('  38400000-8CF0-11BD-B23E-10B96E4EF00D  ')).toBe(sha256Hex('38400000-8cf0-11bd-b23e-10b96e4ef00d'));
  });

  it('produces the same hash for MAIDs that only differ by case or surrounding whitespace', () => {
    expect(hashMobileDeviceIdForMetaCustomAudience('38400000-8cf0-11bd-b23e-10b96e4ef00d')).toBe(
      hashMobileDeviceIdForMetaCustomAudience('  38400000-8CF0-11BD-B23E-10B96E4EF00D  '),
    );
  });

  it('does not strip internal hyphens the way hashPhoneForMetaCustomAudience strips phone punctuation', () => {
    const withHyphens = hashMobileDeviceIdForMetaCustomAudience('38400000-8cf0-11bd-b23e-10b96e4ef00d');
    const withoutHyphens = sha256Hex('3840000008cf011bdb23e10b96e4ef00d');
    expect(withHyphens).not.toBe(withoutHyphens);
  });

  it('produces a 64-character lowercase hex digest', () => {
    const hash = hashMobileDeviceIdForMetaCustomAudience('38400000-8cf0-11bd-b23e-10b96e4ef00d');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('hashNameForMetaCustomAudience', () => {
  it('lowercases, trims, and SHA-256-hashes the name', () => {
    expect(hashNameForMetaCustomAudience('  Jane  ')).toBe(sha256Hex('jane'));
  });

  it('does not strip internal whitespace, unlike hashCityForMetaCustomAudience', () => {
    expect(hashNameForMetaCustomAudience('Mary Jane')).toBe(sha256Hex('mary jane'));
  });

  it('produces a 64-character lowercase hex digest', () => {
    expect(hashNameForMetaCustomAudience('Jane')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('hashCityForMetaCustomAudience', () => {
  it('lowercases and strips all whitespace and punctuation before hashing (Meta spec example: "St. Louis" -> "stlouis")', () => {
    expect(hashCityForMetaCustomAudience('St. Louis')).toBe(sha256Hex('stlouis'));
  });

  it('produces the same hash for cities that only differ by case, whitespace, or punctuation', () => {
    expect(hashCityForMetaCustomAudience('New York')).toBe(hashCityForMetaCustomAudience(' NEW-YORK '));
  });
});

describe('hashStateForMetaCustomAudience', () => {
  it('lowercases and strips whitespace/punctuation from the state abbreviation before hashing', () => {
    expect(hashStateForMetaCustomAudience(' CA ')).toBe(sha256Hex('ca'));
  });
});

describe('hashZipForMetaCustomAudience', () => {
  it('keeps only the first 5 characters after stripping whitespace/punctuation and lowercasing', () => {
    expect(hashZipForMetaCustomAudience('94103-1234')).toBe(sha256Hex('94103'));
  });

  it('produces the same hash for a zip+4 value and its bare 5-digit prefix', () => {
    expect(hashZipForMetaCustomAudience('94103-1234')).toBe(hashZipForMetaCustomAudience('94103'));
  });
});

describe('hashCountryForMetaCustomAudience', () => {
  it('lowercases and strips whitespace/punctuation from the country code before hashing', () => {
    expect(hashCountryForMetaCustomAudience(' US ')).toBe(sha256Hex('us'));
  });
});
