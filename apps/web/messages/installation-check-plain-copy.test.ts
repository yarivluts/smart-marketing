import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Copy = Record<string, Record<string, string>>;

const KEYS = ['checkDescription', 'nothingYet', 'inQuarantine', 'addSchemaPlaceholder'];

describe('Installation check: plain words', () => {
  it('en: no schema / quarantine jargon', () => {
    const m = (en as unknown as Copy).Installation;
    for (const key of KEYS) expect(m[key].replace(/{[^}]*}/g, ''), key).not.toMatch(/schema|quarantin/i);
  });

  it('he: no סכמה / הסגר jargon', () => {
    const m = (he as unknown as Copy).Installation;
    for (const key of KEYS) expect(m[key].replace(/{[^}]*}/g, ''), key).not.toMatch(/סכמ|הסגר/);
  });

  it('the empty state tells people what to add', () => {
    expect((en as unknown as Copy).Installation.nothingYet).toMatch(/Add the names/);
  });
});
