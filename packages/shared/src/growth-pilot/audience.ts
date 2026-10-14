import { AD_STUDIO_META_AGE, AD_STUDIO_MAX_COUNTRIES, AD_STUDIO_MAX_INTERESTS, type AdStudioGender, type AdStudioMetaTargeting } from '../ad-studio/audiences';
import type { GrowthSiteAnalysis } from './analysis';
import type { GrowthBriefTarget } from './brief';

/**
 * The audience Growth Pilot proposes for a target's ads: where, which ages, which genders, and the
 * interests people who need it have. The AI writes interests as plain words; with Meta connected
 * each is matched to a real Meta interest (with its size) and the whole is given a reach estimate.
 */

/** What the AI writes. */
export interface GrowthAudienceDraft {
  /** One or two sentences for the owner: who these ads should reach and why. */
  summary: string;
  countries: string[];
  ageMin: number;
  ageMax: number;
  /** Empty for everyone. */
  genders: AdStudioGender[];
  /** Words to look up as Meta interests ("small business", "lawyers"). */
  interestKeywords: string[];
}

/** What the person approves: the targeting as it will be used, and what could not be matched. */
export interface GrowthAudiencePlan {
  summary: string;
  targeting: AdStudioMetaTargeting;
  /** Interest words not matched to a Meta interest (Meta not connected, or no match). */
  unresolvedInterests: string[];
  /** Meta's monthly reach estimate, when Meta could give one. */
  reach: { lower: number | null; upper: number | null } | null;
  /** `ok`, or why Meta could not be asked (`no_credential`, `meta_auth_failed`...). */
  meta: string;
}

const MAX_KEYWORDS = 8;

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const number = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.min(max, Math.max(min, number));
}

/** Cleans what the model wrote: real two-letter countries, ages within Meta's range, known genders, a few distinct keywords. */
export function sanitizeAudienceDraft(raw: GrowthAudienceDraft, fallbackCountry: string): GrowthAudienceDraft {
  const countries = [...new Set((raw.countries ?? []).map((code) => String(code).trim().toUpperCase()).filter((code) => /^[A-Z]{2}$/.test(code)))].slice(0, AD_STUDIO_MAX_COUNTRIES);
  let ageMin = clamp(raw.ageMin, AD_STUDIO_META_AGE.min, AD_STUDIO_META_AGE.max, AD_STUDIO_META_AGE.min);
  let ageMax = clamp(raw.ageMax, AD_STUDIO_META_AGE.min, AD_STUDIO_META_AGE.max, AD_STUDIO_META_AGE.max);
  if (ageMin > ageMax) [ageMin, ageMax] = [ageMax, ageMin];
  const genders = [...new Set((raw.genders ?? []).filter((gender): gender is AdStudioGender => gender === 'male' || gender === 'female'))];
  const interestKeywords = [...new Set((raw.interestKeywords ?? []).map((word) => String(word).replace(/\s+/g, ' ').trim().slice(0, 60)).filter(Boolean))].slice(0, MAX_KEYWORDS);
  return {
    summary: String(raw.summary ?? '').replace(/\s+/g, ' ').trim().slice(0, 500),
    countries: countries.length ? countries : [fallbackCountry],
    ageMin,
    ageMax,
    // Both genders listed is the same as everyone.
    genders: genders.length === 2 ? [] : genders,
    interestKeywords,
  };
}

/** Matched interests are capped at Meta's limit; the targeting has no custom audiences yet. */
export function audienceTargeting(draft: GrowthAudienceDraft, interests: AdStudioMetaTargeting['interests']): AdStudioMetaTargeting {
  return { countries: draft.countries, ageMin: draft.ageMin, ageMax: draft.ageMax, genders: draft.genders, customAudiences: [], interests: interests.slice(0, AD_STUDIO_MAX_INTERESTS) };
}

const RULES = [
  'Propose a Meta (Facebook and Instagram) audience for these ads: countries as ISO two-letter codes, an age range (18-65, where 65 means 65 and over), genders only when the offer is clearly for one, and 3-8 interest keywords.',
  'Interest keywords are short English words Meta has interests for (professions, industries, tools, life situations) - not sentences, not brand names of the business itself.',
  'Prefer broad and reachable over narrow: small budgets need enough people. Never invent facts about the business.',
  'The summary is one or two sentences in the language of the site, for the owner: who these ads reach and why.',
].join('\n');

export function buildAudiencePrompt(params: { analysis: GrowthSiteAnalysis; target: GrowthBriefTarget; siteUrl: string; current?: GrowthAudienceDraft; request?: string }): { system: string; user: string } {
  const { analysis, target } = params;
  const facts = [
    `Business: ${analysis.businessName} (${params.siteUrl}). ${analysis.summary}`,
    `Site language: ${analysis.language}`,
    `Target: ${target.name} (${target.kind}). ${target.description} Audience: ${target.audience}`,
  ];
  if (params.current && params.request) {
    return {
      system: ["You revise a Meta ads audience on the business owner's request. Apply the change faithfully; keep what they did not ask to change.", RULES].join('\n'),
      user: [...facts, '', 'The current audience:', JSON.stringify(params.current, null, 2), '', `The change they asked for: ${params.request}`, '', 'Return the whole revised audience.'].join('\n'),
    };
  }
  return { system: ['You plan Meta ads audiences for small businesses.', RULES].join('\n'), user: [...facts, '', 'Propose the audience.'].join('\n') };
}

/** A Meta interest found for one of the AI's keywords: what it is, where Meta files it, how big it is. */
export interface GrowthInterestCandidate {
  id: string;
  name: string;
  path: string[];
  keyword: string;
}

/** How many Meta results per keyword the AI chooses from. */
export const GROWTH_INTEREST_CANDIDATES_PER_KEYWORD = 5;

/**
 * Meta's interest search matches words loosely ("action" finds action movies), so its biggest
 * result is often unrelated. The AI picks, from all candidates, only the interests that people who
 * would buy this actually have.
 */
export function buildInterestChoicePrompt(params: { analysis: GrowthSiteAnalysis; target: GrowthBriefTarget; candidates: readonly GrowthInterestCandidate[] }): { system: string; user: string } {
  const list = params.candidates.map((candidate) => `- id ${candidate.id}: ${candidate.name} [${candidate.path.join(' > ')}] (for "${candidate.keyword}")`).join('\n');
  return {
    system: [
      'You choose Meta ad interests. Keep only interests that the people who would buy this offer plausibly have - their profession, industry, business needs or the tools they use.',
      'Drop anything unrelated even if its name shares a word (entertainment, games, sports, hobbies unless the offer is about them). When unsure, leave it out: fewer relevant interests beat many loose ones.',
    ].join('\n'),
    user: [
      `Business: ${params.analysis.businessName}. ${params.analysis.summary}`,
      `Offer: ${params.target.name} (${params.target.kind}). ${params.target.description} Audience: ${params.target.audience}`,
      '',
      'Candidate interests:',
      list,
      '',
      'Return the ids of the relevant ones, at most 8.',
    ].join('\n'),
  };
}
