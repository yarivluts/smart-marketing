import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Pilot = { waiting: { approveHint: { target: string } }; targets: { next: string } };
const pilots = { en: en.GrowthPilot as unknown as Pilot, he: he.GrowthPilot as unknown as Pilot };

describe('Growth Pilot first approval: no unexplained marketing term', () => {
  it('en: says what the web page is for instead of "landing page"', () => {
    expect(pilots.en.waiting.approveHint.target).not.toMatch(/landing page/i);
    expect(pilots.en.targets.next).not.toMatch(/landing page/i);
    expect(pilots.en.waiting.approveHint.target).toContain('Nothing goes live yet');
  });

  it('he: no "דף נחיתה" before the page has been explained', () => {
    expect(pilots.he.waiting.approveHint.target).not.toContain('דף נחיתה');
    expect(pilots.he.targets.next).not.toContain('דף נחיתה');
  });
});
