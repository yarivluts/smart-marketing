import { describe, expect, it } from 'vitest';
import he from './he.json';

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => strings(v, out));
  return out;
}

// The app speaks to the reader in the plural ("check now", "you have"). Written as escapes:
// Hebrew stays out of code files.
const SINGULAR_CHECK_NOW = /^בדוק עכשיו$/;
const SINGULAR_YOU_HAVE = /יש לך(?![א-ת])/;

describe('Hebrew copy keeps talking in the plural', () => {
  const all = strings(he);

  it('the "check now" buttons use the plural command', () => {
    expect(all.filter((s) => SINGULAR_CHECK_NOW.test(s))).toEqual([]);
  });

  it('the pending-invitations line says "you have" in the plural', () => {
    expect(all.filter((s) => SINGULAR_YOU_HAVE.test(s))).toEqual([]);
  });
});
