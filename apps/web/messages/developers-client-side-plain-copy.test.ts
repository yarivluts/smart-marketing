import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('Developers client-side guide intro uses plain words instead of touchpoint / landing page jargon', () => {
  it('en explains visit attribution and web page in plain words', () => {
    expect(en.Developers.clientSide.intro).not.toMatch(/touchpoint|landing page/i);
    expect(en.Developers.clientSide.intro).toContain('where each visitor came from');
    expect(en.Developers.clientSide.intro).toContain('web page');
  });

  it('he explains visit attribution and web page in plain Hebrew without English touchpoint or landing-page jargon', () => {
    expect(he.Developers.clientSide.intro).not.toMatch(/touchpoint|דף נחיתה/i);
    expect(he.Developers.clientSide.intro).toContain('מאיפה כל מבקר הגיע');
    expect(he.Developers.clientSide.intro).toContain('דף אינטרנט');
  });
});
