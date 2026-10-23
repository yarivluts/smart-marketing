import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('first sign-in copy for a newcomer', () => {
  it('explains the empty organizations page without data-source jargon', () => {
    expect(en.OrgsPage.emptyHint).not.toMatch(/data sources|teammates/i);
    expect(en.OrgsPage.emptyHint).toMatch(/website/i);
    expect(he.OrgsPage.emptyHint).not.toContain('מקורות נתונים');
    expect(he.OrgsPage.emptyHint).toContain('כתובת האתר');
  });

  it('addresses everyone in the plural in the Hebrew sign-in messages', () => {
    expect(he.Auth.genericError).toContain('אתכם');
    expect(he.Auth.genericError).not.toContain('אותך');
    expect(he.Auth.tokenSignInPending).toBe('מחברים אתכם...');
  });
});
