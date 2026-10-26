import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Copy = Record<string, unknown>;

const EN_JARGON = /quarantine|entity|entities|touchpoint|attribution|integrator|backfill|registered|streams|schemas? are/i;
const HE_JARGON = /הסגר|(?:^|[\s"(])[הלב]?ישות|(?:^|[\s"(])[הלב]?ישויות|נקודות מגע|ייחוס|backfill|המערכת המשלבת|זרמי|רשומים אך|הסכמות/;

function strings(o: unknown, out: string[] = []): string[] {
  if (typeof o === 'string') out.push(o);
  else if (o && typeof o === 'object') Object.values(o as Copy).forEach((v) => strings(v, out));
  return out;
}

describe('Setup health: plain words', () => {
  it('en: no data-engineering jargon is shown to people', () => {
    for (const text of strings((en as unknown as Copy).SetupHealth)) {
      expect(text.replace(/\{[^}]*\}/g, ''), text).not.toMatch(EN_JARGON);
    }
  });

  it('he: no data-engineering jargon or mixed English words', () => {
    for (const text of strings((he as unknown as Copy).SetupHealth)) {
      expect(text, text).not.toMatch(HE_JARGON);
    }
  });

  it('a rejected record explains it was set aside, and a resend is offered', () => {
    const m = (en as unknown as Record<string, Record<string, string>>).SetupHealth;
    expect(m.rejectedLine).toContain('set aside');
    expect(m.backfillLink).toBe('Ask for a resend');
  });
});
