import { describe, expect, it } from 'vitest';
import he from './he.json';

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => strings(v, out));
  return out;
}

describe('Hebrew copy speaks to the reader in the plural, like the rest of the app', () => {
  const all = strings(he);

  it('never tells the reader to retry in the singular ("נסה שוב")', () => {
    expect(all.filter((s) => /נסה שוב/.test(s))).toEqual([]);
  });

  it('keeps the onboarding wizard free of Latin "plugin" in Hebrew sentences', () => {
    const onboarding = strings((he as Record<string, unknown>).Onboarding);
    expect(onboarding.filter((s) => /\bplugin\b/.test(s))).toEqual([]);
  });
});
