import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const KEYS = ['visualFunnelHeading', 'totalStarted', 'totalCompleted', 'overallConversion'] as const;

describe('the customer-path steps card speaks plain words', () => {
  it('English avoids funnel / conversion jargon', () => {
    for (const key of KEYS) {
      expect(en.Funnel[key].replace('{funnelName}', ''), key).not.toMatch(/funnel|conversion/i);
    }
  });

  it('Hebrew avoids the funnel and conversion words', () => {
    for (const key of KEYS) {
      expect(he.Funnel[key], key).not.toMatch(/משפך|המרה|המרות/);
    }
  });

  it('keeps the funnel name placeholder in the heading', () => {
    expect(en.Funnel.visualFunnelHeading).toContain('{funnelName}');
    expect(he.Funnel.visualFunnelHeading).toContain('{funnelName}');
  });
});
