import { describe, expect, it } from 'vitest';
import he from './he.json';

// "Reload the page" is one instruction, so it is one verb in Hebrew error messages.
// Most of the app says "רעננו את הדף"; the Growth Pilot and Ad Studio errors used to say "טענו ... מחדש".
describe('Hebrew uses one verb for reloading the page', () => {
  it('Growth Pilot and Ad Studio errors do not use the load-again wording', () => {
    const text = JSON.stringify([he.GrowthPilot.errors, he.AdStudio]);
    expect(text).not.toMatch(/טענו (את הדף מחדש|מחדש)/);
  });

  it('the reload instruction is the shared one', () => {
    expect(he.GrowthPilot.errors.not_found).toContain('רעננו את הדף');
    expect(he.GrowthPilot.errors.not_live).toContain('רעננו את הדף');
  });
});
