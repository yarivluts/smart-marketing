import { describe, expect, it } from 'vitest';
import en from './en.json';

const NAMED = "Facebook's ad tool (Ads Manager, at adsmanager.facebook.com)";

// A newcomer does not know "Ads Manager" is Facebook's tool: the first mention says so.
describe('connections help introduces Ads Manager as Facebook\'s ad tool', () => {
  const json = JSON.stringify(en);
  it('names the tool where the ad account number is asked for', () => {
    expect(json).toContain(`The number after act_ in ${NAMED}`);
    expect(json).toContain(`Copy the ad account ID from ${NAMED}`);
  });
  it('names the tool in the verify-account failure line', () => {
    expect(json).toContain(`verify the account in ${NAMED} before ads can be created`);
  });
});
