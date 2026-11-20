import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('Facebook connect messages say what to do next', () => {
  it('permission line asks for an admin instead of naming an internal permission', () => {
    expect(en.MetaConnect.needsPermission).not.toMatch(/manage resources/i);
    expect(en.MetaConnect.needsPermission).toMatch(/ask an admin/i);
    expect(he.MetaConnect.needsPermission).not.toContain('\u05E0\u05D9\u05D4\u05D5\u05DC \u05DE\u05E9\u05D0\u05D1\u05D9\u05DD');
    expect(he.MetaConnect.needsPermission).toContain('\u05DE\u05E0\u05D4\u05DC');
  });

  it('no-ad-account error tells how to get unstuck', () => {
    expect(en.MetaConnect.errors.no_ad_accounts).toMatch(/create an ad account/i);
    expect(he.MetaConnect.errors.no_ad_accounts).toContain('\u05E4\u05EA\u05D7\u05D5 \u05E7\u05D5\u05D3\u05DD \u05D7\u05E9\u05D1\u05D5\u05DF \u05DE\u05D5\u05D3\u05E2\u05D5\u05EA');
  });
});
