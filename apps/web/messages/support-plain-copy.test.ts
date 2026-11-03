import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Copy = Record<string, Record<string, string>>;

describe('Support page: plain words for a newcomer', () => {
  it('en: no "lifecycle events", "backlog" or "landed"', () => {
    const m = (en as unknown as Copy).Support;
    for (const key of ['description', 'setupIntro', 'leaderboardEmpty']) {
      expect(m[key], key).not.toMatch(/lifecycle|backlog|landed/i);
    }
    expect(m.description).toMatch(/satisfied/);
  });

  it('he: empty state no longer says "landed" (נחתו)', () => {
    const m = (he as unknown as Copy).Support;
    expect(m.leaderboardEmpty).not.toMatch(/נחתו/);
    expect(m.description).toMatch(/CSAT/);
  });
});
