import { describe, expect, it } from 'vitest';
import type { GrowthSiteAnalysis } from './analysis';
import { audienceTargeting, buildAudiencePrompt, buildInterestChoicePrompt, sanitizeAudienceDraft, type GrowthAudienceDraft } from './audience';

const ANALYSIS: GrowthSiteAnalysis = { businessName: 'EasySign', summary: 'Signatures on WhatsApp.', language: 'he', offerings: [], audiences: [] };
const TARGET = { kind: 'audience' as const, name: 'Freelancers', description: 'Self-employed', audience: 'Fast signatures' };
const DRAFT: GrowthAudienceDraft = { summary: 'Freelancers in Israel', countries: ['IL'], ageMin: 25, ageMax: 55, genders: [], interestKeywords: ['Freelancer', 'Small business'] };

describe('sanitizeAudienceDraft', () => {
  it('keeps real country codes, ages within Meta range, known genders and distinct keywords', () => {
    const clean = sanitizeAudienceDraft({ summary: '  Who  ', countries: ['il', 'Israel', 'IL', 'us'], ageMin: 70, ageMax: 12, genders: ['female', 'other' as 'male'], interestKeywords: [' Lawyers ', 'Lawyers', '', 'x'.repeat(100)] }, 'IL');
    expect(clean).toEqual({ summary: 'Who', countries: ['IL', 'US'], ageMin: 18, ageMax: 65, genders: ['female'], interestKeywords: ['Lawyers', 'x'.repeat(60)] });
  });

  it('falls back to the main country, and treats both genders as everyone', () => {
    const clean = sanitizeAudienceDraft({ ...DRAFT, countries: [], genders: ['male', 'female'], ageMin: Number.NaN, ageMax: 40 }, 'IL');
    expect(clean).toMatchObject({ countries: ['IL'], genders: [], ageMin: 18, ageMax: 40 });
  });
});

describe('audience targeting and prompt', () => {
  it('makes Meta targeting from the draft and the matched interests', () => {
    const interests = [{ id: '6003', name: 'Freelancer', sizeLower: 1, sizeUpper: 2 }];
    expect(audienceTargeting(DRAFT, interests)).toEqual({ countries: ['IL'], ageMin: 25, ageMax: 55, genders: [], customAudiences: [], interests });
  });

  it('asks for a reachable audience with English interest words and an owner summary in the site language; revises on request', () => {
    const prompt = buildAudiencePrompt({ analysis: ANALYSIS, target: TARGET, siteUrl: 'https://easy-sign.co.il/' });
    expect(prompt.user).toContain('Target: Freelancers (audience)');
    expect(prompt.system).toMatch(/ISO two-letter/);
    expect(prompt.system).toMatch(/short English words/);
    const revise = buildAudiencePrompt({ analysis: ANALYSIS, target: TARGET, siteUrl: 'https://easy-sign.co.il/', current: DRAFT, request: 'Only women 30-45' });
    expect(revise.user).toContain('Only women 30-45');
    expect(revise.user).toContain('"ageMin": 25');
  });
});

describe('interest choice prompt', () => {
  it('lists every candidate with where Meta files it, and asks to drop what only shares a word', () => {
    const prompt = buildInterestChoicePrompt({ analysis: ANALYSIS, target: TARGET, candidates: [{ id: 'm1', name: 'Action movies', path: ['Interests', 'Movies'], keyword: 'Freelancer' }] });
    expect(prompt.user).toContain('- id m1: Action movies [Interests > Movies] (for "Freelancer")');
    expect(prompt.user).toContain('Offer: Freelancers (audience)');
    expect(prompt.system).toMatch(/even if its name shares a word/);
  });
});
