import { describe, expect, it } from 'vitest';
import he from './he.json';

describe('Growth Pilot daily budget hint (he)', () => {
  it('does not assume the ad account is in shekels', () => {
    // The same line says the amount is in the ad account's currency, which may not be shekels.
    expect(he.GrowthPilot.publish.budgetHint).toContain('במטבע של חשבון המודעות');
    expect(he.GrowthPilot.publish.budgetHint).not.toContain('שקל');
    expect(he.GrowthPilot.publish.budgetHint).toContain('לא יוצא כסף');
  });
});
