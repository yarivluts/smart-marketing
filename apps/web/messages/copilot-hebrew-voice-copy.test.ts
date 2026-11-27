import { describe, expect, it } from 'vitest';
import he from './he.json';

type Copy = Record<string, Record<string, string>>;

describe('Hebrew Copilot replies speak to "you" in the plural, like the rest of the app', () => {
  const c = (he as unknown as Copy).CopilotEngine;

  it('asks for the ad name in the plural and does not guess its gender', () => {
    expect(c.noCampaign).toContain('ציינו את שם המודעה');
    expect(c.noCampaign).not.toContain('ציין את');
  });

  it('pause reply keeps the budget but does not guess the gender of the ad name', () => {
    expect(c.pauseProposed).toContain('{budget}');
    expect(c.pauseProposed).toContain('{campaign}');
    expect(c.pauseProposed).not.toContain('שרץ');
  });
});
