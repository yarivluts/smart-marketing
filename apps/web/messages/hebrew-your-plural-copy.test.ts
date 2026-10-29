import { describe, expect, it } from 'vitest';
import he from './he.json';

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => strings(v, out));
  return out;
}

// The singular "your" (shelkha/shelakh) next to the plural the rest of the app uses reads as if the app
// switched between talking to one person and to a group. Written as escapes: Hebrew stays out of code files.
const SINGULAR_YOUR = /שלך(?![א-ת])/;
const SINGULAR_TO_YOU = /עזור לך(?![א-ת])/;

describe('Hebrew copy says "yours" in the plural everywhere', () => {
  const all = strings(he);

  it('has no singular "your" anywhere', () => {
    expect(all.filter((s) => SINGULAR_YOUR.test(s))).toEqual([]);
  });

  it('the AI helper greeting offers help in the plural', () => {
    expect(all.filter((s) => SINGULAR_TO_YOU.test(s))).toEqual([]);
  });

  it('the sidebar link to the key numbers page matches the page title', () => {
    const shell = (he as unknown as { OrgDetailPage: Record<string, string> }).OrgDetailPage;
    expect(shell.projectMetricRegistryLink).toContain('שלכם');
  });
});
