import { describe, expect, it } from 'vitest';
import en from './en.json';

describe('Billing feed: cancellations in plain words', () => {
  it('en: the cancellation list never says "churned"', () => {
    const m = en.BillingOpsFeed as Record<string, string>;
    for (const key of ['churnHeading', 'churnCapNote', 'churnCapNoteTruncated']) {
      expect(m[key], key).not.toMatch(/churn/i);
    }
    expect(m.churnHeading).toBe('Canceled and about-to-cancel subscriptions');
  });
});
