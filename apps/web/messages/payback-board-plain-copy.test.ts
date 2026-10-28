import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const FLAT = [
  'kpiTrackedCampaigns',
  'flowTitle',
  'flowDescription',
  'moreCampaigns',
  'spendTargetsUnavailableHint',
  'statusMixCenterLabel',
] as const;

describe('the ad payback board says ads, in plain words', () => {
  it('English never says campaign, ops or attributed', () => {
    for (const key of FLAT) expect(en.CampaignOps[key], key).not.toMatch(/campaign|ops board|attributed/i);
    for (const key of ['acquisitions', 'roi'] as const) {
      expect(en.CampaignOps.flowState[key], key).not.toMatch(/campaign/i);
    }
    expect(en.CampaignOps.flowStage.acquisitions).not.toMatch(/^Acquisitions$/);
  });

  it('Hebrew never says קמפיין', () => {
    for (const key of FLAT) expect(he.CampaignOps[key], key).not.toMatch(/קמפיין/);
    for (const key of ['acquisitions', 'roi'] as const) {
      expect(he.CampaignOps.flowState[key], key).not.toMatch(/קמפיין/);
    }
  });

  it('keeps the placeholders the page fills in', () => {
    expect(en.CampaignOps.moreCampaigns).toContain('{count}');
    expect(he.CampaignOps.moreCampaigns).toContain('{count}');
  });
});
