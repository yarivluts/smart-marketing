import { describe, expect, it } from 'vitest';
import he from './he.json';

// The card shows "<label>: <country names>". The old Hebrew label ended in a dangling prefix, so the line
// read as a cut-off sentence. Hebrew is written as escapes: it stays out of code files.
const DANGLING = /\s[\u05D1\u05DC\u05DE\u05DB\u05D5\u05D4]$/;

describe('Growth Pilot publish card country label', () => {
  const label = (he as unknown as { GrowthPilot: { publish: { countries: string } } }).GrowthPilot.publish.countries;

  it('is a complete phrase, not a cut-off prefix', () => {
    expect(DANGLING.test(label)).toBe(false);
    expect(label).toContain('\u05DE\u05D3\u05D9\u05E0\u05D5\u05EA');
  });
});
