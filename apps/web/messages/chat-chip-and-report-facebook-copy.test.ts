import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const HEBREW = /[֐-׿]/;
const META = /\bMeta\b|מטא/;

describe('AI helper chip and report intro name Facebook and Instagram, not Meta', () => {
  it('English', () => {
    expect(en.CopilotChatPanel.chipRebalanceQuery).not.toMatch(META);
    expect(en.CopilotChatPanel.chipRebalanceQuery).toMatch(/Facebook and Instagram/);
    expect(en.ExecutiveReport.description).not.toMatch(META);
  });
  it('Hebrew', () => {
    expect(he.CopilotChatPanel.chipRebalanceQuery).toMatch(HEBREW);
    expect(he.CopilotChatPanel.chipRebalanceQuery).not.toMatch(META);
    expect(he.ExecutiveReport.description).not.toMatch(META);
  });
});
