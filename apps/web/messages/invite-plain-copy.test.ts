import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('Invite page copy', () => {
  it('titles the page as an invitation to a team, not an "organization invite"', () => {
    expect(en.Invite.title).not.toMatch(/organization/i);
    expect(en.Invite.title).toMatch(/invited/i);
    expect(he.Invite.title).not.toContain('ארגון');
  });

  it('says the used invite needs nothing more and where the team is', () => {
    expect(en.Invite.alreadyResolved).toMatch(/nothing more to accept/);
    expect(en.Invite.alreadyResolved).not.toMatch(/waiting/);
    expect(he.Invite.alreadyResolved).not.toContain('מחכה');
    expect(he.Invite.alreadyResolved).toContain('ברשימה');
  });
});
