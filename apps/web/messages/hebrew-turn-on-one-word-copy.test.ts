import { describe, expect, it } from 'vitest';
import he from './he.json';

// The same action ("turn the ads on") must be one word everywhere in Hebrew:
// the buttons say "הפעלה", so the progress labels and hints must not say "הדלקה".
describe('Hebrew uses one word for turning ads on', () => {
  it('never mixes the light-a-fire verb into the Hebrew copy', () => {
    const text = JSON.stringify([he.GrowthPilot, he.Campaigns]);
    expect(text).not.toMatch(/הדלק|הודלק|תדליק/);
  });

  it('progress labels use the same verb as the turn-on buttons', () => {
    const a = he.Campaigns.lifecycle.activation;
    expect(a.title).toBe('הפעלה');
    expect(a.done).toBe('הופעל');
    expect(a.pending).toContain('תפעילו');
    expect(he.GrowthPilot.publish.budgetStart).toContain('תפעילו');
  });
});
