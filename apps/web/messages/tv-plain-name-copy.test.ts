import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('the TV page is named for what it does, not "war room"', () => {
  it('uses the same plain name for the wizard link, project link and page', () => {
    expect(en.Onboarding.warRoomLink).toBe('Show your results on a TV screen');
    expect(en.OrgDetailPage.projectTvLink).toBe(en.TvPairing.metaTitle);
    expect(en.TvPairing.title).toContain('{projectName}');
  });

  it('keeps "war room" out of the beginner-facing labels in both languages', () => {
    for (const lang of [en, he]) {
      for (const text of [
        lang.Onboarding.warRoomLink,
        lang.OrgDetailPage.projectTvLink,
        lang.TvPairing.metaTitle,
        lang.TvPairing.title,
        lang.TvMode.pairingInstructions,
      ]) {
        expect(text).not.toMatch(/war[- ]?room|חדר מלחמה/i);
      }
    }
  });

  it('keeps "war room" out of the eyebrows, descriptions and TV tab title too', () => {
    expect(en.TvMode.metaTitle).toBe(en.TvPairing.metaTitle);
    expect(he.TvMode.metaTitle).toBe(he.TvPairing.metaTitle);
    for (const lang of [en, he]) {
      for (const text of [
        lang.WinRules.eyebrow,
        lang.WinRules.description,
        lang.TvPairing.eyebrow,
        lang.TvMode.metaTitle,
      ]) {
        expect(text).not.toMatch(/war[- ]?room|חדר (ה)?מלחמה|big screen|מסך גדול/i);
      }
    }
  });

  it('points the TV code instructions at the renamed page', () => {
    expect(en.TvMode.pairingInstructions).toContain(en.TvPairing.metaTitle);
    expect(he.TvMode.pairingInstructions).toContain(he.TvPairing.metaTitle);
  });
});
