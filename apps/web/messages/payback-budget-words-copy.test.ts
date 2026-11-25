import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const KEYS = [
  'targetUpdateError',
  'targetInputLabel',
  'targetInputPlaceholder',
  'kpiSpend',
  'kpiOverTarget',
  'kpiOnTargetSub',
  'flowNoTargets',
  'flowOverTarget',
  'flowAllOnTarget',
  'statusMixTitle',
  'spendProgressLabel',
] as const;

describe('Ad payback page says "budget" and "money spent" everywhere', () => {
  it('has no "target" or bare "spend" in the beginner-facing lines (en)', () => {
    const n = en.CampaignOps;
    for (const k of KEYS) expect(n[k]).not.toMatch(/target|\bSpend\b/i);
    expect(n.flowStage.targets).not.toMatch(/target/i);
  });

  it('says the budget was not saved, and that nothing changed, on failure', () => {
    expect(en.CampaignOps.targetUpdateError).toMatch(/Nothing was changed/);
    expect(he.CampaignOps.targetUpdateError).toContain('שום דבר לא השתנה');
  });

  it('uses the Hebrew word for budget, not goal (he)', () => {
    const n = he.CampaignOps;
    for (const k of KEYS) expect(n[k]).not.toMatch(/יעד/);
    expect(n.flowStage.targets).not.toMatch(/יעד/);
  });
});
