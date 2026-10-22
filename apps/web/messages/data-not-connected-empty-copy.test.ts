import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

// Empty states must not tell a beginner to "connect a data warehouse" - they cannot, and
// it is not something they asked for. They say the data is not connected yet instead.
const dump = (messages: unknown) => JSON.stringify(messages);

describe('empty states do not ask for a data warehouse', () => {
  it('en: no "connect a data warehouse to see this"', () => {
    expect(dump(en)).not.toMatch(/connect a data warehouse/i);
  });

  it('he: no "חברו/חבר מחסן נתונים כדי לראות זאת"', () => {
    expect(dump(he)).not.toMatch(/חברו? מחסן נתונים/);
  });

  it('en and he say the data will show once connected', () => {
    const e = (en as unknown as Record<string, Record<string, string>>);
    const h = (he as unknown as Record<string, Record<string, string>>);
    const enHits = Object.values(e).flatMap((ns) => Object.values(ns)).filter((v) => typeof v === 'string' && v.includes('once your data is connected'));
    const heHits = Object.values(h).flatMap((ns) => Object.values(ns)).filter((v) => typeof v === 'string' && v.includes('ברגע שהנתונים שלכם יחוברו'));
    expect(enHits.length).toBe(14);
    expect(heHits.length).toBe(14);
  });
});
