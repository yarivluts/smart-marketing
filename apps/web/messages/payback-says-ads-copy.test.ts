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

describe('the ad spend card speaks of money and budget, not targets', () => {
  const KEYS_PLAIN = [
    'spendTargetsHeading',
    'spendTargetsDescription',
    'columnActualSpend',
    'columnTarget',
    'statusOverTarget',
    'statusOnTarget',
    'statusNoTarget',
  ] as const;

  it('English says budget and money spent, never target, trailing or actual', () => {
    for (const key of KEYS_PLAIN) expect(en.CampaignOps[key], key).not.toMatch(/target|trailing|actual/i);
  });

  it('Hebrew says תקציב instead of יעד', () => {
    for (const key of KEYS_PLAIN) expect(he.CampaignOps[key], key).not.toMatch(/יעד/);
  });
});
