import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('the "next" line on an idea that has no ads yet', () => {
  it('says who does the work and reads as a sentence (en)', () => {
    const t = en.GrowthPilot.targets.next;
    expect(t).toBe('Next: the AI writes ads, a web page for people who click them, and picks who should see the ads.');
    expect(t).not.toMatch(/who to reach for this one/i);
  });

  it('keeps the Hebrew in step and drops the clumsy filler ending', () => {
    const t = he.GrowthPilot.targets.next;
    expect(t).toContain('ה-AI כותב');
    expect(t).toContain('בוחר מי יראה את המודעות');
    expect(t).not.toContain('בשביל הדבר הזה');
  });
});
