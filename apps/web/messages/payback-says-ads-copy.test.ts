import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const KEYS = [
  'campaignPaybackHeading',
  'campaignPaybackDescription',
  'campaignPaybackUnavailable',
  'campaignPaybackEmpty',
  'spendTargetsHeading',
  'spendTargetsDescription',
  'spendTargetsEmpty',
  'columnCampaign',
] as const;

describe('the ad payback page says ads, like the rest of the app', () => {
  it('English never says campaign', () => {
    for (const key of KEYS) expect(en.CampaignOps[key], key).not.toMatch(/campaign/i);
  });

  it('Hebrew never says קמפיין', () => {
    for (const key of KEYS) expect(he.CampaignOps[key], key).not.toMatch(/קמפיין/);
  });
});
