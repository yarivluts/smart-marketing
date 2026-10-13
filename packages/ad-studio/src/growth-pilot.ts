import { z } from 'zod/v4';
import {
  AdStudioQuotaExceededError,
  acquireGrowthPilotLease,
  addRequestedGrowthTarget,
  completeGrowthProposalRevision,
  failGrowthPilotAnalysis,
  getCurrentGrowthPilot,
  getGrowthPilot,
  requestGrowthProposalChange,
  saveGrowthPilotAnalysis,
  type GrowthPilotModel,
  type GrowthProposalModel,
} from '@growthos/firebase-orm-models';
import {
  buildSiteAnalysisPrompt,
  buildTargetFromRequestPrompt,
  buildTargetRevisionPrompt,
  extractLandingPageContent,
  GROWTH_PILOT_MAX_PAGES,
  GROWTH_TARGET_KINDS,
  pickSiteLinks,
  proposedTargetsFromAnalysis,
  sanitizeSiteAnalysis,
  sanitizeTargetDraft,
  type GrowthSitePage,
  type GrowthTargetDraft,
} from '@growthos/shared';
import { AdStudioProviderError } from './llm';
import { meteredCall, type AdStudioCallContext } from './metering';
import { fetchHtmlPage, type PlanningSourceDeps } from './planning-sources';
import { adStudioRuntime, ensureOrm } from './runtime';

/**
 * Growth Pilot engine: reads the person's website (the home page and the few pages that say what is
 * sold), asks the text model what the business offers and to whom, and proposes targets for the
 * person to decide on. Also rewrites a proposal on the person's request, and turns a request for a
 * new target into one. Every model call is metered against the project's daily text limit.
 */

export const GrowthSiteAnalysisSchema = z.object({
  businessName: z.string().describe('The business or brand name as the site shows it.'),
  summary: z.string().describe('Two or three sentences: what the business does and for whom, in the site language.'),
  language: z.string().describe('The site language as a two-letter code, e.g. "he" or "en".'),
  offerings: z.array(
    z.object({
      kind: z.enum(['product', 'service']),
      name: z.string(),
      description: z.string(),
      forWhom: z.string().describe('Who this offering is for.'),
    }),
  ),
  audiences: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      needs: z.string().describe('What this group needs that the business answers.'),
    }),
  ),
});

export const GrowthTargetDraftSchema = z.object({
  kind: z.enum(GROWTH_TARGET_KINDS),
  name: z.string(),
  description: z.string(),
  audience: z.string().describe('Who it is for (a product or service) or what they need (an audience).'),
  reason: z.string().describe('One sentence: why this target is worth growing.'),
});

export type GrowthSiteRead = { status: 'ok'; pages: GrowthSitePage[] } | { status: 'unavailable'; reason: string };

function toPage(url: string, html: string): GrowthSitePage | null {
  const page = extractLandingPageContent(html);
  if (!page.title && !page.description && page.headings.length === 0 && !page.text) return null;
  return { url, title: page.title, description: page.description, headings: page.headings, text: page.text };
}

/**
 * Reads the site: the home page, then up to {@link GROWTH_PILOT_MAX_PAGES}-1 same-site pages that most
 * likely say what is sold (products, services, pricing, about), in parallel. A page that cannot be
 * read is skipped; only an unreadable home page fails the read.
 */
export async function readGrowthSite(siteUrl: string, deps: PlanningSourceDeps = {}): Promise<GrowthSiteRead> {
  const home = await fetchHtmlPage(siteUrl, deps);
  if (home.status !== 'ok') return { status: 'unavailable', reason: home.reason };
  const first = toPage(home.url, home.html);
  if (!first) return { status: 'unavailable', reason: 'empty_page' };
  const links = pickSiteLinks(home.html, home.url, GROWTH_PILOT_MAX_PAGES - 1);
  const more = await Promise.all(
    links.map(async (link) => {
      const fetched = await fetchHtmlPage(link, deps);
      return fetched.status === 'ok' ? toPage(fetched.url, fetched.html) : null;
    }),
  );
  return { status: 'ok', pages: [first, ...more.filter((page): page is GrowthSitePage => page !== null)] };
}

/** A failure as a stable code the page words: the daily limit, a provider problem, or anything else. */
export function growthFailureCode(error: unknown): string {
  if (error instanceof AdStudioQuotaExceededError) return 'quota_exceeded';
  if (error instanceof AdStudioProviderError) return error.code;
  return 'provider_error';
}

/**
 * Does the pilot's pending work: while the site is being analyzed, the caller holding the lease reads
 * the site and proposes targets. Returns the pilot as it stands (untouched when there was nothing to
 * do or another caller is on it). Safe to call repeatedly - the page polls it.
 */
export async function advanceGrowthPilot(ctx: AdStudioCallContext & { pilotId: string; deps?: PlanningSourceDeps }): Promise<GrowthPilotModel> {
  await ensureOrm();
  const pilot = await getGrowthPilot(ctx.organizationId, ctx.projectId, ctx.pilotId);
  if (pilot.status !== 'analyzing') return pilot;
  const token = await acquireGrowthPilotLease(pilot, { now: ctx.now });
  if (!token) return pilot;
  const site = await readGrowthSite(pilot.site_url, ctx.deps ?? adStudioRuntime().siteReader);
  if (site.status !== 'ok') return (await failGrowthPilotAnalysis({ pilot, token, code: `site_${site.reason}`, now: ctx.now })) ?? pilot;
  try {
    const prompt = buildSiteAnalysisPrompt(site.pages);
    const raw = await meteredCall(ctx, 'site_analysis', null, () => ctx.llm.generateJson({ ...prompt, schema: GrowthSiteAnalysisSchema, effort: 'high' }));
    const analysis = sanitizeSiteAnalysis(raw);
    const drafts = proposedTargetsFromAnalysis(analysis);
    if (drafts.length === 0) return (await failGrowthPilotAnalysis({ pilot, token, code: 'nothing_found', now: ctx.now })) ?? pilot;
    const saved = await saveGrowthPilotAnalysis({
      pilot,
      token,
      analysis,
      pages: site.pages.map((page) => ({ url: page.url, title: page.title })),
      drafts,
      generatedBy: { provider: ctx.llm.provider, model: ctx.llm.model },
      now: ctx.now,
    });
    return saved ?? pilot;
  } catch (error) {
    return (await failGrowthPilotAnalysis({ pilot, token, code: growthFailureCode(error), now: ctx.now })) ?? pilot;
  }
}

/** The project's current pilot, advanced if it has pending work; null when none was started. */
export async function advanceCurrentGrowthPilot(ctx: AdStudioCallContext & { deps?: PlanningSourceDeps }): Promise<GrowthPilotModel | null> {
  await ensureOrm();
  const pilot = await getCurrentGrowthPilot(ctx.organizationId, ctx.projectId);
  return pilot ? advanceGrowthPilot({ ...ctx, pilotId: pilot.id }) : null;
}

/**
 * The person asks for a change to a pending proposal: it is held while the AI rewrites it, then comes
 * back for their decision - rewritten, or unchanged with the failure noted when the rewrite failed.
 */
export async function reviseGrowthProposal(ctx: AdStudioCallContext & { proposalId: string; request: string }): Promise<GrowthProposalModel> {
  await ensureOrm();
  const held = await requestGrowthProposalChange({ organizationId: ctx.organizationId, projectId: ctx.projectId, proposalId: ctx.proposalId, text: ctx.request, actorId: ctx.actorId, now: ctx.now });
  const scope = { organizationId: ctx.organizationId, projectId: ctx.projectId, proposalId: held.id, now: ctx.now };
  try {
    const pilot = await getGrowthPilot(ctx.organizationId, ctx.projectId, held.pilot_id);
    if (!held.draft || !pilot.analysis) return await completeGrowthProposalRevision({ ...scope, draft: null, failureCode: 'nothing_to_revise' });
    const request = held.change_requests[held.change_requests.length - 1].text;
    const prompt = buildTargetRevisionPrompt({ analysis: pilot.analysis, draft: held.draft, request });
    const raw = await meteredCall(ctx, 'target_writing', null, () => ctx.llm.generateJson({ ...prompt, schema: GrowthTargetDraftSchema }));
    const draft = sanitizeTargetDraft(raw as GrowthTargetDraft);
    return await completeGrowthProposalRevision({ ...scope, draft, failureCode: draft ? undefined : 'invalid_output' });
  } catch (error) {
    return completeGrowthProposalRevision({ ...scope, draft: null, failureCode: growthFailureCode(error) });
  }
}

export class GrowthPilotNotReadyError extends Error {
  constructor() {
    super('The site has not been read yet.');
    this.name = 'GrowthPilotNotReadyError';
  }
}

export class GrowthTargetRequestInvalidError extends Error {
  constructor() {
    super('Say what to grow - a product, a service or an audience.');
    this.name = 'GrowthTargetRequestInvalidError';
  }
}

/** The person asks for a new target in their own words; the AI defines it and it waits for their approval. */
export async function requestGrowthTarget(ctx: AdStudioCallContext & { pilotId: string; request: string }): Promise<GrowthProposalModel> {
  await ensureOrm();
  const request = ctx.request.replace(/\s+/g, ' ').trim().slice(0, 1_000);
  if (!request) throw new GrowthTargetRequestInvalidError();
  const pilot = await getGrowthPilot(ctx.organizationId, ctx.projectId, ctx.pilotId);
  if (!pilot.analysis) throw new GrowthPilotNotReadyError();
  const prompt = buildTargetFromRequestPrompt({ analysis: pilot.analysis, request });
  const raw = await meteredCall(ctx, 'target_writing', null, () => ctx.llm.generateJson({ ...prompt, schema: GrowthTargetDraftSchema }));
  const draft = sanitizeTargetDraft(raw as GrowthTargetDraft);
  if (!draft) throw new AdStudioProviderError('invalid_output', 'The AI did not return a usable target.');
  return addRequestedGrowthTarget({ organizationId: ctx.organizationId, projectId: ctx.projectId, pilotId: pilot.id, draft, actorId: ctx.actorId, now: ctx.now });
}
