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
    expect(JSON.stringify(m)).not.toMatch(/CSAT/);
  });

  it('en: no CSAT jargon and durations spell out their unit', () => {
    const m = (en as unknown as Copy).Support;
    expect(JSON.stringify(m)).not.toMatch(/CSAT/);
    expect(m.durationMinutes).toMatch(/minute/);
    expect(m.durationSeconds).toMatch(/second/);
    expect(m.durationHours).toMatch(/hour/);
    expect(m.durationMinutes).not.toMatch(/\}m$/);
  });
});
