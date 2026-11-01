import { describe, expect, it } from 'vitest';
import he from './he.json';

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => strings(v, out));
  return out;
}

// The rest of the app says "GrowthOS reads / suggests" in the masculine; the sign-in brand line, the
// automation hub and its sidebar link said "reads / suggests" in the feminine, as if two voices spoke.
// Written as escapes: Hebrew stays out of code files.
const FEMININE_AFTER_NAME =
  /GrowthOS (קוראת|מציעה|כותבת|עוקבת)(?![א-ת])/;

describe('Hebrew copy speaks of GrowthOS in the masculine', () => {
  const all = strings(he);

  it('has no feminine reads/suggests/writes/follows after the product name', () => {
    expect(all.filter((s) => FEMININE_AFTER_NAME.test(s))).toEqual([]);
  });
});
