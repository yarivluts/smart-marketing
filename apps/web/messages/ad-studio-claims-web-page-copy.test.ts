import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Dict = Record<string, unknown>;
const find = (o: Dict, key: string): string[] =>
  Object.entries(o).flatMap(([k, v]) =>
    k === key && typeof v === 'string' ? [v] : v && typeof v === 'object' ? find(v as Dict, key) : [],
  );

describe('ad claims check speaks of the web page', () => {
  it('en says web page, not landing page', () => {
    const [text] = find(en as Dict, 'claimsToCheck');
    expect(text).toContain('web page');
    expect(text).not.toMatch(/landing page/i);
  });
  it('he uses the same word as the rest of the app', () => {
    const [text] = find(he as Dict, 'claimsToCheck');
    expect(text).toContain('דף האינטרנט');
    expect(text).not.toContain('דף הנחיתה');
  });
});
