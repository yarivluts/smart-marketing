import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const KEYS = ['spendTargetsEmptyHint', 'campaignPaybackEmptyHint'] as const;

describe('ad payback empty states give a next step', () => {
  it.each(KEYS)('%s points to Growth Pilot (he: its Hebrew name), in plain words', (key) => {
    expect(en.CampaignOps[key]).toMatch(/Growth Pilot/);
    expect(en.CampaignOps[key]).not.toMatch(/campaign|CTR|ROAS/i);
    expect(he.CampaignOps[key]).toMatch(/\u05d8\u05d9\u05d9\u05e1 \u05e6\u05de\u05d9\u05d7\u05d4/);
    expect(he.CampaignOps[key]).not.toMatch(/Growth Pilot/);
    expect(he.CampaignOps[key]).not.toMatch(/קמפיין/);
  });
});
