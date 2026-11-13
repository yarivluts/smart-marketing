import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Copy = Record<string, Record<string, string>>;

const KEYS = [
  'kpiAverageHealth',
  'kpiAverageHealthEmpty',
  'kpiAverageHealthSubtext',
  'kpiAccepted',
  'kpiRejectedSubtext',
  'trendTitle',
  'trendDescription',
  'cardSetupHealthIn',
  'cardSetupHealth',
  'cardAccepted',
  'cardRejected',
  'cardTrendLabel',
  'cardNoRecentData',
  'outcomesTitle',
  'outcomesDescription',
  'outcomesCenter',
  'outcomesAccepted',
  'outcomesRejected',
] as const;

describe('dashboard figures wording', () => {
  it.each([
    ['en', en, /record|reject|accepted|setup health|\bprod\b/i],
    ['he', he, /רשומ|נדחו|נדחתה|תקינות|ייצור|קליטה/],
  ] as const)('%s: says data received / set aside, not records accepted or rejected', (_l, messages, jargon) => {
    const page = (messages as unknown as Copy).DashboardPage;
    for (const key of KEYS) {
      expect(page[key], key).toBeTruthy();
      expect(page[key], key).not.toMatch(jargon);
    }
  });

  it('keeps the placeholders the dashboard fills in', () => {
    for (const messages of [en, he]) {
      const page = (messages as unknown as Copy).DashboardPage;
      expect(page.trendDescription).toContain('{days}');
      expect(page.outcomesDescription).toContain('{days}');
      expect(page.cardSetupHealthIn).toContain('{environment}');
      expect(page.kpiRejectedSubtext).toContain('{count');
    }
  });
});

describe('dashboard project card wording', () => {
  it('en: no "14d" shorthand and no "Failing / rejected records" status', () => {
    const page = (en as unknown as Copy).DashboardPage;
    expect(page.cardAccepted).toBe('Received (last 14 days)');
    expect(page.cardRejected).toBe('Set aside (last 14 days)');
    expect(page.cardStatus_error).toBe('Problem: the data arriving cannot be used');
    expect(page.cardStatus_error).not.toMatch(/failing|rejected|records/i);
  });

  it('he: the error status says a problem and no longer says failed / rejected records', () => {
    const page = (he as unknown as Copy).DashboardPage;
    expect(page.cardStatus_error).not.toMatch(/כושל|רשומות|נדחו/);
    expect(page.cardStatus_error.startsWith('תקלה:')).toBe(true);
  });
});
