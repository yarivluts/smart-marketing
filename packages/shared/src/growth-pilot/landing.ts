import type { GrowthSiteAnalysis } from './analysis';
import type { GrowthBriefTarget } from './brief';

/**
 * A landing page Growth Pilot writes for one target: one page that speaks to that target's
 * audience and sends them to the site. Structured content - the app renders it - so a page cannot
 * carry scripts or broken markup, and every word was read by the person before it went live.
 */

export interface GrowthLandingContent {
  /** A short line above the headline (who it is for). */
  eyebrow: string;
  headline: string;
  subheadline: string;
  benefits: { title: string; text: string }[];
  /** How it works, in order; may be empty. */
  steps: string[];
  faq: { question: string; answer: string }[];
  ctaText: string;
  /** The last line before the final button. */
  closingHeadline: string;
}

const LINE = 160;
const TEXT = 500;

function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

/** Trims and caps what a model returned; null when it lacks the parts a page cannot do without. */
export function sanitizeLandingContent(raw: GrowthLandingContent): GrowthLandingContent | null {
  const content: GrowthLandingContent = {
    eyebrow: clean(raw.eyebrow, LINE),
    headline: clean(raw.headline, LINE),
    subheadline: clean(raw.subheadline, TEXT),
    benefits: (raw.benefits ?? [])
      .map((benefit) => ({ title: clean(benefit.title, LINE), text: clean(benefit.text, TEXT) }))
      .filter((benefit) => benefit.title)
      .slice(0, 6),
    steps: (raw.steps ?? []).map((step) => clean(step, TEXT)).filter(Boolean).slice(0, 5),
    faq: (raw.faq ?? [])
      .map((item) => ({ question: clean(item.question, LINE), answer: clean(item.answer, TEXT) }))
      .filter((item) => item.question && item.answer)
      .slice(0, 6),
    ctaText: clean(raw.ctaText, 60),
    closingHeadline: clean(raw.closingHeadline, LINE),
  };
  return content.headline && content.ctaText ? content : null;
}

const RULES = [
  'Write in the language of the site, naturally, as a conversion copywriter from that market would.',
  'Use only facts the business information below states: never invent prices, numbers, discounts, trials, awards, testimonials, customer names, integrations or guarantees.',
  'Speak to the one audience given; benefits are outcomes for that audience, each backed by something the business information says.',
  'Short sentences. The call to action is 2-4 words, an action ("Start free", "Try it now") that matches what the site offers.',
].join('\n');

export function buildLandingPagePrompt(params: { analysis: GrowthSiteAnalysis; target: GrowthBriefTarget; current?: GrowthLandingContent; request?: string }): { system: string; user: string } {
  const { analysis, target } = params;
  const facts = [
    `Business: ${analysis.businessName}. ${analysis.summary}`,
    'What it offers:',
    ...analysis.offerings.map((offering) => `- ${offering.name}: ${offering.description} (for ${offering.forWhom})`),
    analysis.audiences.length ? 'Who it serves:' : '',
    ...analysis.audiences.map((audience) => `- ${audience.name}: ${audience.description} (needs: ${audience.needs})`),
  ].filter(Boolean);
  const focus = `This page is for: ${target.name} (${target.kind}). ${target.description} Audience: ${target.audience}`;
  if (params.current && params.request) {
    return {
      system: ['You revise a landing page on the business owner\'s request. Apply the change faithfully; keep what they did not ask to change.', RULES].join('\n'),
      user: [...facts, '', focus, '', 'The current page:', JSON.stringify(params.current, null, 2), '', `The change they asked for: ${params.request}`, '', 'Return the whole revised page.'].join('\n'),
    };
  }
  return {
    system: ['You write high-converting landing pages for paid ads.', RULES].join('\n'),
    user: [...facts, '', focus, '', 'Write the page: eyebrow, headline, subheadline, 3-4 benefits, 0-4 steps of how it works, 3-5 FAQ items, the call-to-action text and a closing headline.'].join('\n'),
  };
}

/** Where the page's buttons lead: the site, tagged so its visits can be told apart. */
export function landingCtaUrl(siteUrl: string, slug: string): string {
  try {
    const url = new URL(siteUrl);
    url.searchParams.set('utm_source', 'growthos');
    url.searchParams.set('utm_medium', 'landing_page');
    url.searchParams.set('utm_campaign', slug);
    return url.toString();
  } catch {
    return siteUrl;
  }
}

/** Right-to-left languages, for the page's direction. */
export function isRtlLanguage(language: string): boolean {
  return ['he', 'ar', 'fa', 'ur'].includes(language.toLowerCase().slice(0, 2));
}
