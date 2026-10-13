import { describe, expect, it } from 'vitest';
import type { GrowthSiteAnalysis } from './analysis';
import { buildLandingPagePrompt, isRtlLanguage, landingCtaUrl, sanitizeLandingContent, type GrowthLandingContent } from './landing';

const ANALYSIS: GrowthSiteAnalysis = {
  businessName: 'EasySign',
  summary: 'Signatures on WhatsApp.',
  language: 'he',
  offerings: [{ kind: 'service', name: 'Pro plan', description: '20 documents a month for 20 ILS', forWhom: 'Small offices', why: 'w' }],
  audiences: [{ name: 'Freelancers', description: 'Self-employed', needs: 'Fast signatures', why: 'w' }],
};
const TARGET = { kind: 'service' as const, name: 'Pro plan', description: '20 documents a month', audience: 'Small offices' };
const CONTENT: GrowthLandingContent = {
  eyebrow: 'For small offices',
  headline: 'Sign 20 documents a month',
  subheadline: 'On WhatsApp.',
  benefits: [{ title: 'Fast', text: 'Signed in seconds' }],
  steps: ['Upload', 'Send'],
  faq: [{ question: 'Price?', answer: '20 ILS a month' }],
  ctaText: 'Start now',
  closingHeadline: 'Ready?',
};

describe('landing page prompt', () => {
  it('gives the model the business facts and the one audience, and forbids invented claims', () => {
    const prompt = buildLandingPagePrompt({ analysis: ANALYSIS, target: TARGET });
    expect(prompt.user).toContain('- Pro plan: 20 documents a month for 20 ILS (for Small offices)');
    expect(prompt.user).toContain('This page is for: Pro plan (service)');
    expect(prompt.system).toMatch(/never invent prices/);
    expect(prompt.system).toMatch(/language of the site/);
  });

  it('revises the current page with the request', () => {
    const prompt = buildLandingPagePrompt({ analysis: ANALYSIS, target: TARGET, current: CONTENT, request: 'Shorter headline' });
    expect(prompt.system).toMatch(/revise/);
    expect(prompt.user).toContain('"headline": "Sign 20 documents a month"');
    expect(prompt.user).toContain('Shorter headline');
  });
});

describe('sanitizeLandingContent', () => {
  it('trims, caps and drops empty parts; refuses a page without a headline or a call to action', () => {
    const clean = sanitizeLandingContent({ ...CONTENT, headline: '  Sign  fast ', benefits: [{ title: ' ', text: 'x' }, { title: 'A', text: 'b' }], faq: [{ question: 'Q', answer: '' }], steps: [' ', 'One'] });
    expect(clean).toMatchObject({ headline: 'Sign fast', benefits: [{ title: 'A', text: 'b' }], faq: [], steps: ['One'] });
    expect(sanitizeLandingContent({ ...CONTENT, headline: '' })).toBeNull();
    expect(sanitizeLandingContent({ ...CONTENT, ctaText: ' ' })).toBeNull();
  });
});

describe('landing helpers', () => {
  it('tags the button link so visits from the page can be told apart, keeping the site address', () => {
    expect(landingCtaUrl('https://easy-sign.co.il/pro?ref=a', 'abc123')).toBe('https://easy-sign.co.il/pro?ref=a&utm_source=growthos&utm_medium=landing_page&utm_campaign=abc123');
    expect(landingCtaUrl('not a url', 'x')).toBe('not a url');
  });

  it('knows which languages read right to left', () => {
    expect(isRtlLanguage('he')).toBe(true);
    expect(isRtlLanguage('ar-EG')).toBe(true);
    expect(isRtlLanguage('en')).toBe(false);
  });
});
