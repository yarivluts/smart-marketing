import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

// A rejected ads / web page / audience line must not be a dead end: it names the button for something else.
type Pilot = Record<'ads' | 'landing' | 'audience', { status: { rejected: string } }>;
const enP = en.GrowthPilot as unknown as Pilot;
const heP = he.GrowthPilot as unknown as Pilot;

describe('rejected approval lines point to the next step', () => {
  for (const key of ['ads', 'landing', 'audience'] as const) {
    it(`${key} (en) names the "Something else to grow" button`, () => {
      expect(enP[key].status.rejected).toContain('"Something else to grow"');
    });
    it(`${key} (he) names the Hebrew button, with no Latin words but ל-AI`, () => {
      const line = heP[key].status.rejected;
      expect(line).toContain('"משהו נוסף לקדם"');
      expect(line.replace('ל-AI', '')).not.toMatch(/[A-Za-z]/);
    });
  }
});
