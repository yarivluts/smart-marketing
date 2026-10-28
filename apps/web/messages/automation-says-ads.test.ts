import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const KEYS = [
  'policyProtectedTargetIdsLabel',
  'targetsHeading',
  'targetsEmptyNote',
  'targetCampaignStatusLine',
  'seedTargetButton',
  'seedTargetError',
  'connectionNoneOption',
  'proposeNoTargetsNote',
  'proposeDraftHeading',
  'proposeDraftNoTargetsNote',
  'proposeDraftCampaignNameLabel',
  'proposeDraftObjectiveLabel',
  'proposeDraftButton',
  'proposeDraftError',
  'proposeKeywordEditNoTargetsNote',
  'proposeAdEditNoTargetsNote',
  'proposeMetaAdSetEditNoTargetsNote',
] as const;

describe('the automation page says ads, like the rest of the app', () => {
  it('English never says campaign', () => {
    for (const key of KEYS) expect(en.Automation[key], key).not.toMatch(/campaign/i);
  });

  it('Hebrew never says קמפיין', () => {
    for (const key of KEYS) expect(he.Automation[key], key).not.toMatch(/קמפיין/);
  });
});
