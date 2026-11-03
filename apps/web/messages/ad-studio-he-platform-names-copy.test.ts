import { describe, expect, it } from 'vitest';
import he from './he.json';

// The Hebrew Ad Studio names the ad platform the way a newcomer knows it (Facebook and Instagram, in
// Hebrew), not in Latin letters or only by the company name "Meta".
describe('Hebrew Ad Studio names Facebook and Instagram in plain words', () => {
  const studio = he.AdStudio as unknown as Record<string, any>;

  it('audience problem and saved-groups note use the Hebrew names', () => {
    expect(studio.audience.issues.invalid_audience).toContain('פייסבוק ואינסטגרם');
    expect(studio.audience.issues.invalid_audience).not.toMatch(/Facebook|Instagram/);
    expect(studio.audience.savedNote).toContain('פייסבוק ואינסטגרם');
    expect(studio.audience.savedNote).not.toMatch(/Meta/);
  });

  it('the account-verification failure is not addressed only to "Meta"', () => {
    const text = studio.exportFailure.account_action_required as string;
    expect(text).toContain('פייסבוק ואינסטגרם');
    expect(text).not.toMatch(/^Meta/);
  });
});
