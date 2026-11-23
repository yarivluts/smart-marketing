import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Messages = { AdShare: { requests: { actionError: string } } };

describe('the client-requests action error says what happened and what to do', () => {
  it('says nothing changed and to try again (en)', () => {
    expect((en as unknown as Messages).AdShare.requests.actionError).toMatch(/nothing was changed.*try again/);
  });
  it('no longer sends a newcomer to "review open items" (en)', () => {
    expect(JSON.stringify(en)).not.toContain('Review open items');
  });
  it('is translated, and differs from the old generic line (he)', () => {
    const he_ = (he as unknown as Messages).AdShare.requests.actionError;
    expect(he_.length).toBeGreaterThan(20);
    expect(he_).not.toBe((en as unknown as Messages).AdShare.requests.actionError);
  });
});
