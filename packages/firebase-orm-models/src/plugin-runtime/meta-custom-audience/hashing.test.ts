import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { hashEmailForMetaCustomAudience } from './hashing';

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
