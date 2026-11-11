import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('team invite errors say what went wrong', () => {
  for (const [name, m] of [['en', en], ['he', he]] as const) {
    it(`${name}: three distinct reasons, no code words`, () => {
      const lines = [m.Members.inviteError, m.Members.inviteErrorBadEmail, m.Members.inviteErrorAlreadyMember];
      expect(new Set(lines).size).toBe(3);
      for (const l of lines) expect(l).not.toMatch(/already_member|409|\bundefined\b/);
    });
  }

  it('the generic failure no longer blames an existing membership', () => {
    expect(en.Members.inviteError).not.toMatch(/already/i);
    expect(he.Members.inviteError).not.toContain('כבר');
  });
});
