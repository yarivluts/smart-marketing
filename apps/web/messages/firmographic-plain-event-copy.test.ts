import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const pick = (m: Record<string, unknown>): string[] => {
  const out: string[] = [];
  const walk = (o: unknown): void => {
    if (typeof o === 'string') out.push(o);
    else if (o && typeof o === 'object') Object.values(o).forEach(walk);
  };
  walk(m);
  return out;
};

describe('Firmographic pages do not name the raw event', () => {
  it('shows no company_firmographic code in either language', () => {
    for (const messages of [en, he]) {
      expect(pick(messages as Record<string, unknown>).filter((s) => s.includes('company_firmographic'))).toEqual([]);
    }
  });
});
