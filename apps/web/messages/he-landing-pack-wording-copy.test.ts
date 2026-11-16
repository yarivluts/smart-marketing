import { describe, expect, it } from 'vitest';
import he from './he.json';

describe('Hebrew web-page performance pack description', () => {
  it('says it works whichever ad brought the visitors, not "in every ad"', () => {
    const text = (he as unknown as { Onboarding: Record<string, string> }).Onboarding.packLandingPageDescription;
    expect(text).toContain('לא משנה איזו מודעה הביאה אותם');
    expect(text).not.toContain('בכל מודעה');
  });
});
