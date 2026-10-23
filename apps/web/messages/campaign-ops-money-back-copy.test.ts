import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const JARGON = /\bROI\b|[Ww]arehouse|last-touch|attributed/;

describe('Ad payback page uses plain words', () => {
  it('has no ROI / warehouse / last-touch jargon (en)', () => {
    const n = en.CampaignOps;
    for (const text of [
      n.campaignPaybackHeading,
      n.campaignPaybackDescription,
      n.columnRoi40d,
      n.roiSublabel,
      n.flowUnavailable,
      n.flowStage.roi,
    ]) {
      expect(text).not.toMatch(JARGON);
    }
  });

  it('has no ROI / warehouse jargon (he)', () => {
    const n = he.CampaignOps;
    for (const text of [n.columnRoi40d, n.roiSublabel, n.flowUnavailable, n.flowStage.roi]) {
      expect(text).not.toMatch(/החזר השקעה|מחסן/);
    }
  });

  it('keeps the same placeholders in both languages', () => {
    expect(en.CampaignOps.roiSublabel).toContain('{roi}');
    expect(he.CampaignOps.roiSublabel).toContain('{roi}');
  });
});
