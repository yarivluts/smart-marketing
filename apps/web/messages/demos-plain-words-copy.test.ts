import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Copy = Record<string, Record<string, string>>;

describe('demos page plain words', () => {
  const demos = (en as unknown as Copy).Demos;
  const text = Object.values(demos).join(' ');

  it('en avoids sales jargon', () => {
    expect(text).not.toMatch(/show rate|per-rep|\breps?\b|funnel/i);
  });

  it('the empty state does not leak record or stage codes', () => {
    for (const messages of [en, he] as const) {
      const detail = (messages as unknown as Copy).Demos.funnelEmptyDetail;
      expect(detail).not.toMatch(/demo_event|no_show/);
    }
  });

  it('he addresses everyone in the plural and avoids the funnel metaphor', () => {
    const heDemos = (he as unknown as Copy).Demos;
    expect(heDemos.workListIntro).not.toMatch(/^רוצה /);
    expect(Object.values(heDemos).join(' ')).not.toMatch(/משפך/);
  });
});
