import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('live audience explanation avoids ad-platform jargon', () => {
  it('does not talk about "learning" or the brand Meta', () => {
    expect(en.GrowthPilot.audience.liveExplain).not.toMatch(/learning|Meta/);
    expect(he.GrowthPilot.audience.liveExplain).not.toMatch(/Meta|[A-Za-z]/);
  });

  it('still warns that results can dip for a while', () => {
    expect(en.GrowthPilot.audience.liveExplain).toMatch(/results can dip/);
    expect(he.GrowthPilot.audience.liveExplain).toContain('התוצאות עלולות לרדת');
  });
});
