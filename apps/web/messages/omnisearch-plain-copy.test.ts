import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const JARGON_EN = /\b(boards?|metrics?|segments?|campaigns?|win rules?)\b/i;
const JARGON_HE = /(מדדים|פלחים|קמפיינים|כללי ניצחון|כלל ניצחון)/;

// The result kinds are ICU select keys (`board {Dashboard}`); only the words in braces are shown.
const shown = (text: string): string => [...text.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1]).join(' ') || text;

describe('search box copy', () => {
  it('speaks in the same plain words as the sidebar (en)', () => {
    const { dialogLabel, inputPlaceholder, resultType } = en.OmniSearch;
    for (const text of [dialogLabel, inputPlaceholder, resultType]) {
      expect(shown(text)).not.toMatch(JARGON_EN);
    }
  });

  it('speaks in the same plain words as the sidebar (he)', () => {
    const { dialogLabel, inputPlaceholder, resultType } = he.OmniSearch;
    for (const text of [dialogLabel, inputPlaceholder, resultType]) {
      expect(shown(text)).not.toMatch(JARGON_HE);
    }
  });

  it('names saved customer lists like the sidebar does', () => {
    expect(en.OmniSearch.resultType).toContain('segment {Customer group}');
    expect(en.OmniSearch.dialogLabel).not.toMatch(/audiences/i);
    expect(he.OmniSearch.dialogLabel).not.toContain('בקהלים');
    expect(he.OmniSearch.resultType).toContain('segment {קבוצת לקוחות}');
  });
});
