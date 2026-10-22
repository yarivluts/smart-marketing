import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('the customer-path empty state on Funnel & Goals speaks plain words', () => {
  it('English avoids the word funnel and says what the path is', () => {
    const f = en.FunnelGoals;
    for (const text of [f.funnelEmptyTitle, f.funnelUnavailableTitle, f.defineFunnelCta, f.funnelUnavailable.no_funnel]) {
      expect(text).not.toMatch(/funnel|conversion/i);
    }
    expect(f.funnelUnavailable.no_funnel).toMatch(/first visit to buying/);
  });

  it('Hebrew avoids the funnel word', () => {
    const f = he.FunnelGoals;
    for (const text of [f.funnelEmptyTitle, f.funnelUnavailableTitle, f.defineFunnelCta, f.funnelUnavailable.no_funnel]) {
      expect(text).not.toMatch(/משפך|המרה/);
    }
  });
});
