import { describe, expect, it } from 'vitest';
import type { GrowthSiteAnalysis } from './analysis';
import { GROWTH_BRIEF_SECONDS, growthBriefInput } from './brief';

const ANALYSIS: GrowthSiteAnalysis = {
  businessName: 'EasySign',
  summary: 'Signatures on WhatsApp.',
  language: 'he',
  offerings: [{ kind: 'service', name: 'Pro plan', description: '20 documents a month', forWhom: 'Small offices', why: 'w' }],
  audiences: [],
};

describe('growthBriefInput', () => {
  it('briefs an offering in the site language, for its audience, sending people to the site', () => {
    const input = growthBriefInput({ analysis: ANALYSIS, target: { kind: 'service', name: 'Pro plan', description: '20 documents a month', audience: 'Small offices' }, siteUrl: 'https://easy-sign.co.il/' });
    expect(input).toMatchObject({ name: 'Pro plan', landingPageUrl: 'https://easy-sign.co.il/', language: 'he', format: 'vertical', targetSeconds: GROWTH_BRIEF_SECONDS });
    expect(input.objective).toContain('Small offices');
    expect(input.objective).toContain('Pro plan');
    expect(input.productDescription).toContain('EasySign: Signatures on WhatsApp.');
    expect(input.productDescription).toContain('For: Small offices');
  });

  it('briefs an audience as reaching that group, and keeps within the brief limits', () => {
    const input = growthBriefInput({ analysis: { ...ANALYSIS, language: '' }, target: { kind: 'audience', name: 'x'.repeat(200), description: 'd'.repeat(3000), audience: '' }, siteUrl: 'https://a.co/' });
    expect(input.objective.startsWith('Reach ')).toBe(true);
    expect(input.name.length).toBeLessThanOrEqual(120);
    expect(input.objective.length).toBeLessThanOrEqual(2000);
    expect(input.productDescription.length).toBeLessThanOrEqual(4000);
    expect(input.language).toBe('en');
  });
});
