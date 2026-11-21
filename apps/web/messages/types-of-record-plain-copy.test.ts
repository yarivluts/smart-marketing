import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Copy = Record<string, Record<string, string>>;
const KEYS: Record<string, string[]> = {
  Segments: ['description'],
  Backfill: ['schemasLabel', 'noSchemas'],
};

describe('customer groups and resend copy speaks of "types of record"', () => {
  for (const [ns, keys] of Object.entries(KEYS)) {
    it(`en ${ns}: no schema / entity / backfill jargon`, () => {
      for (const key of keys) expect((en as unknown as Copy)[ns][key], key).not.toMatch(/schema|entit|register|backfill/i);
    });
    it(`he ${ns}: no סכמ / סכימ / ישות jargon`, () => {
      for (const key of keys) expect((he as unknown as Copy)[ns][key], key).not.toMatch(/סכמ|סכימ|ישות|ישויות|השלמה/);
    });
  }
  it('the empty resend state says what to do next', () => {
    expect((en as unknown as Copy).Backfill.noSchemas).toMatch(/Add a data source/);
  });
});
