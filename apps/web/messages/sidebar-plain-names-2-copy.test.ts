import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const HEBREW = /[֐-׿]/;

describe('Firmographics, Campaign ops and Rep collections are named in words a beginner knows', () => {
  it('English sidebar links match page titles and drop the jargon', () => {
    expect(en.OrgDetailPage.projectFirmographicsLink).toBe(en.Firmographics.metaTitle);
    expect(en.OrgDetailPage.projectRepCollectionsLink).toBe(en.RepCollections.metaTitle);
    for (const text of [
      en.OrgDetailPage.projectFirmographicsLink,
      en.OrgDetailPage.projectCampaignOpsLink,
      en.OrgDetailPage.projectRepCollectionsLink,
    ]) {
      expect(text).not.toMatch(/firmographic|ops|rep collections/i);
    }
    expect(en.Firmographics.title).toContain('{projectName}');
    expect(en.RepCollections.title).toContain('{projectName}');
  });

  it('Hebrew names are Hebrew and keep the project name placeholder', () => {
    expect(he.OrgDetailPage.projectFirmographicsLink).toBe(he.Firmographics.metaTitle);
    expect(he.OrgDetailPage.projectRepCollectionsLink).toBe(he.RepCollections.metaTitle);
    for (const text of [
      he.OrgDetailPage.projectFirmographicsLink,
      he.OrgDetailPage.projectCampaignOpsLink,
      he.OrgDetailPage.projectRepCollectionsLink,
    ]) {
      expect(text).toMatch(HEBREW);
      expect(text).not.toMatch(/פירמוגרפ|תפעול|גבייה/);
    }
    expect(he.Firmographics.title).toContain('{projectName}');
    expect(he.RepCollections.title).toContain('{projectName}');
  });
});
