/**
 * What Growth Pilot learns from a website and what it proposes from it. A target is one thing to
 * grow: a product or a service the business sells, or an audience it should reach. The AI proposes
 * targets; the person approves, rejects or asks for a change. Nothing here calls a model: the types,
 * the prompts and the clean-up of what a model returned.
 */

export const GROWTH_TARGET_KINDS = ['product', 'service', 'audience'] as const;
export type GrowthTargetKind = (typeof GROWTH_TARGET_KINDS)[number];

export function isGrowthTargetKind(value: unknown): value is GrowthTargetKind {
  return typeof value === 'string' && (GROWTH_TARGET_KINDS as readonly string[]).includes(value);
}

/** One page of the site as read for the analysis. */
export interface GrowthSitePage {
  url: string;
  title: string;
  description: string;
  headings: string[];
  text: string;
}

export interface GrowthSiteAnalysis {
  businessName: string;
  /** Two or three sentences: what the business does and for whom. */
  summary: string;
  /** The site's language as a two-letter code ("he", "en"). */
  language: string;
  offerings: { kind: 'product' | 'service'; name: string; description: string; forWhom: string; why: string }[];
  audiences: { name: string; description: string; needs: string; why: string }[];
}

/** A target as the AI drafts it, before the person decides. */
export interface GrowthTargetDraft {
  kind: GrowthTargetKind;
  name: string;
  description: string;
  /** Who it is for (a product or service) or what they need (an audience). */
  audience: string;
  /** Why the AI proposes it, in one sentence, for the approval card. */
  reason: string;
}

/** How many targets the first analysis proposes. */
export const GROWTH_PILOT_MAX_PROPOSED_TARGETS = 6;
/** How much of each page's text goes into the analysis prompt. */
const PAGE_TEXT_CHARS = 3_000;
const NAME_CHARS = 80;
const TEXT_CHARS = 600;

function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

const LANGUAGE_RULE =
  'Write every name, description and sentence in the language of the site itself (Hebrew for a Hebrew site), naturally, as a marketer from that market would. Use only what the pages say; never invent products, prices, numbers, awards or customers.';

export function buildSiteAnalysisPrompt(pages: readonly GrowthSitePage[]): { system: string; user: string } {
  const body = pages
    .map((page, index) =>
      [
        `### Page ${index + 1}: ${page.url}`,
        page.title ? `Title: ${page.title}` : '',
        page.description ? `Description: ${page.description}` : '',
        page.headings.length ? `Headings: ${page.headings.join(' | ')}` : '',
        page.text ? `Text: ${page.text.slice(0, PAGE_TEXT_CHARS)}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .join('\n\n');
  return {
    system: [
      'You are a senior performance marketer onboarding a new client. You read their website and work out what they sell and to whom, so that ads, landing pages and audiences can be built for each offering.',
      LANGUAGE_RULE,
      'Offerings: the distinct products or services a customer can buy, each with who it is for. Merge near-duplicates; skip generic pages (contact, blog posts).',
      'Audiences: the distinct customer groups the site speaks to, each with what they need. Prefer concrete groups ("small law firms") over vague ones ("businesses").',
      'For each offering and audience, "why" is one sentence a marketer would say to the owner: why it is worth advertising - the opportunity, not a repeat of the description or of who it is for.',
    ].join('\n'),
    user: `The website pages:\n\n${body}\n\nReturn the business name, a short summary, the site language code, the offerings and the audiences.`,
  };
}

export function buildTargetRevisionPrompt(params: {
  analysis: Pick<GrowthSiteAnalysis, 'businessName' | 'summary' | 'language'>;
  draft: GrowthTargetDraft;
  request: string;
}): { system: string; user: string } {
  return {
    system: [
      `You help ${params.analysis.businessName || 'a business'} grow. ${params.analysis.summary}`,
      'The person asked you to change a proposed growth target. Apply the change faithfully and keep everything they did not ask to change.',
      LANGUAGE_RULE.replace('the site itself', `the site (${params.analysis.language || 'its language'})`),
    ].join('\n'),
    user: [
      'The current target:',
      JSON.stringify(params.draft, null, 2),
      '',
      `The change they asked for: ${params.request}`,
      '',
      'Return the whole revised target. The reason says, in one sentence, why this target is worth growing as revised.',
    ].join('\n'),
  };
}

export function buildTargetFromRequestPrompt(params: { analysis: GrowthSiteAnalysis; request: string }): { system: string; user: string } {
  return {
    system: [
      `You help ${params.analysis.businessName || 'a business'} grow. ${params.analysis.summary}`,
      'The person asked for a new growth target: a product, a service or an audience to promote. Turn their request into one well-defined target that fits the business.',
      LANGUAGE_RULE.replace('the site itself', `the site (${params.analysis.language || 'its language'})`),
    ].join('\n'),
    user: [
      'What the site offers:',
      ...params.analysis.offerings.map((offering) => `- ${offering.kind}: ${offering.name} - ${offering.description}`),
      'Audiences the site speaks to:',
      ...params.analysis.audiences.map((audience) => `- ${audience.name} - ${audience.description}`),
      '',
      `Their request: ${params.request}`,
    ].join('\n'),
  };
}

/** Trims and caps what a model returned; drops entries without a name. */
export function sanitizeSiteAnalysis(raw: GrowthSiteAnalysis): GrowthSiteAnalysis {
  return {
    businessName: clean(raw.businessName, NAME_CHARS),
    summary: clean(raw.summary, TEXT_CHARS),
    language: clean(raw.language, 5).toLowerCase() || 'en',
    offerings: (raw.offerings ?? [])
      .map((offering) => ({ kind: offering.kind === 'product' ? ('product' as const) : ('service' as const), name: clean(offering.name, NAME_CHARS), description: clean(offering.description, TEXT_CHARS), forWhom: clean(offering.forWhom, TEXT_CHARS), why: clean(offering.why, TEXT_CHARS) }))
      .filter((offering) => offering.name)
      .slice(0, 12),
    audiences: (raw.audiences ?? [])
      .map((audience) => ({ name: clean(audience.name, NAME_CHARS), description: clean(audience.description, TEXT_CHARS), needs: clean(audience.needs, TEXT_CHARS), why: clean(audience.why, TEXT_CHARS) }))
      .filter((audience) => audience.name)
      .slice(0, 12),
  };
}

export function sanitizeTargetDraft(raw: GrowthTargetDraft): GrowthTargetDraft | null {
  const name = clean(raw.name, NAME_CHARS);
  if (!name || !isGrowthTargetKind(raw.kind)) return null;
  return { kind: raw.kind, name, description: clean(raw.description, TEXT_CHARS), audience: clean(raw.audience, TEXT_CHARS), reason: clean(raw.reason, TEXT_CHARS) };
}

/** A reason only when it says something the card does not already say. */
function distinctReason(reason: string, others: readonly string[]): string {
  const key = reason.trim().toLowerCase();
  return key && !others.some((other) => other.trim().toLowerCase() === key) ? reason.trim() : '';
}

/**
 * The first targets to propose from an analysis: the offerings first (what is sold), then the
 * audiences, so a business with few offerings still gets audience targets. Names are not repeated.
 */
export function proposedTargetsFromAnalysis(analysis: GrowthSiteAnalysis, limit: number = GROWTH_PILOT_MAX_PROPOSED_TARGETS): GrowthTargetDraft[] {
  const drafts: GrowthTargetDraft[] = [
    ...analysis.offerings.map((offering) => ({ kind: offering.kind, name: offering.name, description: offering.description, audience: offering.forWhom, reason: distinctReason(offering.why, [offering.description, offering.forWhom]) })),
    ...analysis.audiences.map((audience) => ({ kind: 'audience' as const, name: audience.name, description: audience.description, audience: audience.needs, reason: distinctReason(audience.why, [audience.description, audience.needs]) })),
  ];
  const seen = new Set<string>();
  const unique = drafts.filter((draft) => {
    const key = draft.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // Keep a mix: never let offerings crowd out every audience when both exist.
  const offerings = unique.filter((draft) => draft.kind !== 'audience');
  const audiences = unique.filter((draft) => draft.kind === 'audience');
  const audienceSlots = audiences.length ? Math.min(audiences.length, Math.max(2, limit - offerings.length)) : 0;
  return [...offerings.slice(0, limit - audienceSlots), ...audiences.slice(0, audienceSlots)].slice(0, limit);
}
