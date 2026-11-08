import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

// When Facebook asks for the ad account to be verified, the sentence names Facebook and Instagram - not the company name "Meta".
describe('export failure "verify the account" copy', () => {
  it('english names Facebook and Instagram and gives the address', () => {
    const text = en.AdStudio.exportFailure.account_action_required;
    expect(text).not.toMatch(/Meta/);
    expect(text).toContain('adsmanager.facebook.com');
  });
  it('hebrew has no Latin company name and still gives the address', () => {
    const text = he.AdStudio.exportFailure.account_action_required;
    expect(text).not.toMatch(/Meta/);
    expect(text).toContain('adsmanager.facebook.com');
  });
});
