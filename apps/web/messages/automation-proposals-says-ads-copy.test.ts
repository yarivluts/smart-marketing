import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const keys = [
  'proposeMetaAdSetTargetingEditNoTargetsNote',
  'proposeMetaAdCreativeEditNoTargetsNote',
  'diffFieldCampaignDraft',
  'diffFieldCampaignStatus',
  'proposalsEmptyDescription',
  'proposeDraftEuPoliticalHint',
  'proposeDraftEuPoliticalRequiredError',
] as const;

describe('the change-suggestions page calls campaigns "ads", like the rest of the app', () => {
  it('English copy never says campaign', () => {
    for (const k of keys) expect(en.Automation[k]).not.toMatch(/campaign/i);
  });

  it('Hebrew copy never says קמפיין', () => {
    for (const k of keys) expect((he as typeof en).Automation[k]).not.toMatch(/קמפיין/);
  });

  it('the empty state reassures in plain words', () => {
    expect(en.Automation.proposalsEmptyDescription).toContain('Your ads are on track');
    expect(he.Automation.proposalsEmptyDescription).toContain('המודעות במסלול');
  });
});
