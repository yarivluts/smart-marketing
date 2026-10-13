import { z } from 'zod/v4';
import {
  AdStudioQuotaExceededError,
  acquireGrowthPilotLease,
  addRequestedGrowthTarget,
  completeGrowthProposalRevision,
  createAdStudioBrief,
  failGrowthLanding,
  getGrowthLandingPage,
  saveGrowthLandingDraft,
  updateGrowthLandingContent,
  finishGrowthTargetAds,
  getAdStudioBrief,
  getAdStudioRun,
  getGrowthTarget,
  linkGrowthTargetAds,
  listGrowthTargets,
  failGrowthPilotAnalysis,
  getCurrentGrowthPilot,
  getGrowthPilot,
  requestGrowthProposalChange,
  saveGrowthPilotAnalysis,
  type AdStudioRunModel,
  type GrowthPilotModel,
  type GrowthTargetModel,
  type GrowthProposalModel,
} from '@growthos/firebase-orm-models';
import {
  buildLandingPagePrompt,
  buildSiteAnalysisPrompt,
  buildTargetFromRequestPrompt,
  buildTargetRevisionPrompt,
  extractLandingPageContent,
  GROWTH_PILOT_MAX_PAGES,
  GROWTH_TARGET_KINDS,
  growthBriefInput,
  pickSiteLinks,
  proposedTargetsFromAnalysis,
  sanitizeLandingContent,
  sanitizeSiteAnalysis,
  sanitizeTargetDraft,
  type GrowthLandingContent,
  type GrowthSitePage,
  type GrowthTargetDraft,
} from '@growthos/shared';
import { advanceAdStudioAutopilot, startAdStudioAutopilot, type AdStudioAutopilotDeps } from './autopilot';
import { listBriefImages, rewriteAdStudioImageConcept } from './image-pipeline';
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
      why: z.string().describe('One sentence: why this offering is worth advertising.'),
    }),
  ),
  audiences: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      needs: z.string().describe('What this group needs that the business answers.'),
      why: z.string().describe('One sentence: why this group is worth reaching.'),
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

export const GrowthLandingContentSchema = z.object({
  eyebrow: z.string().describe('A short line above the headline: who the page is for.'),
  headline: z.string(),
  subheadline: z.string(),
  benefits: z.array(z.object({ title: z.string(), text: z.string() })),
  steps: z.array(z.string()).describe('How it works, in order; may be empty.'),
  faq: z.array(z.object({ question: z.string(), answer: z.string() })),
  ctaText: z.string().describe('The button: 2-4 words.'),
  closingHeadline: z.string(),
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
export async function advanceGrowthPilot(ctx: AdStudioCallContext & { pilotId: string; deps?: PlanningSourceDeps; autopilot?: AdStudioAutopilotDeps }): Promise<GrowthPilotModel> {
  await ensureOrm();
  const pilot = await getGrowthPilot(ctx.organizationId, ctx.projectId, ctx.pilotId);
  if (pilot.status === 'active' && ctx.autopilot) {
    await progressGrowthAds({ ...ctx, autopilot: ctx.autopilot }, pilot);
    return pilot;
  }
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
export async function advanceCurrentGrowthPilot(ctx: AdStudioCallContext & { deps?: PlanningSourceDeps; autopilot?: AdStudioAutopilotDeps }): Promise<GrowthPilotModel | null> {
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
  if (held.kind === 'ads') return reviseGrowthAds(ctx, held, scope);
  if (held.kind === 'landing_page') return reviseGrowthLanding(ctx, held, scope);
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

/** How the pilot makes ads: image ads in the Ad Studio's default placements, no video (the costly part is the person's call). */
export const GROWTH_ADS_RUN_OPTIONS = { plan: true, images: true, video: false, confirmPlan: false } as const;
/** How many images an ads proposal previews. */
const PREVIEW_IMAGES = 6;

type AdsContext = AdStudioCallContext & { autopilot: AdStudioAutopilotDeps };

/** Why a finished run left no usable images: the run's own failure, the images step's reason, or none rendered. */
function runFailureCode(run: AdStudioRunModel): string {
  if (run.status === 'failed' || run.status === 'cancelled') return run.failure_code ?? run.status;
  return run.steps.find((step) => step.id === 'images')?.reason ?? 'no_images';
}

async function finishAds(ctx: AdsContext, target: GrowthTargetModel, run: AdStudioRunModel): Promise<void> {
  const images = run.status === 'done' && target.brief_id ? await listBriefImages({ organizationId: ctx.organizationId, projectId: ctx.projectId, briefId: target.brief_id }) : [];
  const preview = images.filter((image) => image.selected && image.status === 'ready').slice(0, PREVIEW_IMAGES).map((image) => image.id);
  await finishGrowthTargetAds({ organizationId: ctx.organizationId, projectId: ctx.projectId, targetId: target.id, previewImageIds: preview, failureCode: preview.length ? null : runFailureCode(run), now: ctx.now });
}

/**
 * One unit of ads work, so each call stays short: advance a running autopilot by a step (and finish
 * the target when it is done), or else open a brief and start the autopilot for the next approved
 * target that has no ads yet. A paused pilot does none of this.
 */
async function progressGrowthAds(ctx: AdsContext, pilot: GrowthPilotModel): Promise<void> {
  const targets = await listGrowthTargets(ctx.organizationId, ctx.projectId, pilot.id);
  const building = targets.find((target) => target.ads_status === 'building' && target.brief_id && target.run_id);
  if (building?.brief_id && building.run_id) {
    let run = await getAdStudioRun(ctx.organizationId, ctx.projectId, building.brief_id, building.run_id);
    if (run.status === 'running') run = await advanceAdStudioAutopilot({ organizationId: ctx.organizationId, projectId: ctx.projectId, briefId: building.brief_id, actorId: ctx.actorId, runId: run.id }, ctx.autopilot);
    if (run.status !== 'running' && run.status !== 'awaiting_approval') await finishAds(ctx, building, run);
    return;
  }
  if (!pilot.analysis) return;
  const needsPage = targets.find((target) => target.status === 'active' && (target.landing_status ?? 'none') === 'none');
  if (needsPage) {
    await writeGrowthLanding(ctx, pilot, needsPage);
    return;
  }
  const next = targets.find((target) => target.status === 'active' && !target.brief_id && (target.ads_status ?? 'none') === 'none');
  if (!next) return;
  const brief = await createAdStudioBrief({
    organizationId: ctx.organizationId,
    projectId: ctx.projectId,
    input: growthBriefInput({ analysis: pilot.analysis, target: next, siteUrl: pilot.site_url }),
    createdByUserId: ctx.actorId,
    now: ctx.now,
  });
  const scope = { organizationId: ctx.organizationId, projectId: ctx.projectId, targetId: next.id, now: ctx.now };
  try {
    const run = await startAdStudioAutopilot({ organizationId: ctx.organizationId, projectId: ctx.projectId, briefId: brief.id, actorId: ctx.actorId, options: GROWTH_ADS_RUN_OPTIONS });
    await linkGrowthTargetAds({ ...scope, briefId: brief.id, runId: run.id });
  } catch (error) {
    // The brief stays linked so the person can open it; the target says why its ads did not start.
    await linkGrowthTargetAds({ ...scope, briefId: brief.id, runId: '' });
    await finishGrowthTargetAds({ ...scope, previewImageIds: [], failureCode: growthFailureCode(error) });
  }
}

/**
 * The person asked for a change to a target's ads: every image idea is rewritten by their request
 * and the autopilot renders what changed. The proposal stays held until the new images are ready,
 * then comes back with them (see finishGrowthTargetAds).
 */
async function reviseGrowthAds(ctx: AdStudioCallContext, held: GrowthProposalModel, scope: { organizationId: string; projectId: string; proposalId: string; now?: Date }): Promise<GrowthProposalModel> {
  try {
    if (!held.brief_id || !held.target_id) return await completeGrowthProposalRevision({ ...scope, draft: null, failureCode: 'nothing_to_revise' });
    const request = held.change_requests[held.change_requests.length - 1].text;
    const brief = await getAdStudioBrief(ctx.organizationId, ctx.projectId, held.brief_id);
    for (const concept of brief.image_concepts ?? []) {
      await rewriteAdStudioImageConcept({ ...ctx, briefId: brief.id, conceptId: concept.id, instruction: request });
    }
    const target = await getGrowthTarget(ctx.organizationId, ctx.projectId, held.target_id);
    const run = await startAdStudioAutopilot({ organizationId: ctx.organizationId, projectId: ctx.projectId, briefId: brief.id, actorId: ctx.actorId, options: GROWTH_ADS_RUN_OPTIONS });
    await linkGrowthTargetAds({ organizationId: ctx.organizationId, projectId: ctx.projectId, targetId: target.id, briefId: brief.id, runId: run.id, now: ctx.now });
    return held;
  } catch (error) {
    return completeGrowthProposalRevision({ ...scope, draft: null, failureCode: growthFailureCode(error) });
  }
}

/** Writes the landing page for an approved target (one text call) and puts it up for approval. */
async function writeGrowthLanding(ctx: AdStudioCallContext, pilot: GrowthPilotModel, target: GrowthTargetModel): Promise<void> {
  const scope = { organizationId: ctx.organizationId, projectId: ctx.projectId, targetId: target.id, now: ctx.now };
  try {
    const prompt = buildLandingPagePrompt({ analysis: pilot.analysis!, target });
    const raw = await meteredCall(ctx, 'landing_page', null, () => ctx.llm.generateJson({ ...prompt, schema: GrowthLandingContentSchema, effort: 'high' }));
    const content = sanitizeLandingContent(raw as GrowthLandingContent);
    if (!content) {
      await failGrowthLanding({ ...scope, failureCode: 'invalid_output' });
      return;
    }
    await saveGrowthLandingDraft({ ...scope, content, language: pilot.analysis!.language || 'en', siteUrl: pilot.site_url });
  } catch (error) {
    await failGrowthLanding({ ...scope, failureCode: growthFailureCode(error) });
  }
}

/** The person asked for a change to a landing page: the AI revises it and it comes back for a decision. */
async function reviseGrowthLanding(ctx: AdStudioCallContext, held: GrowthProposalModel, scope: { organizationId: string; projectId: string; proposalId: string; now?: Date }): Promise<GrowthProposalModel> {
  try {
    if (!held.landing_page_id || !held.target_id) return await completeGrowthProposalRevision({ ...scope, draft: null, failureCode: 'nothing_to_revise' });
    const [pilot, page, target] = await Promise.all([
      getGrowthPilot(ctx.organizationId, ctx.projectId, held.pilot_id),
      getGrowthLandingPage(ctx.organizationId, ctx.projectId, held.landing_page_id),
      getGrowthTarget(ctx.organizationId, ctx.projectId, held.target_id),
    ]);
    if (!pilot.analysis) return await completeGrowthProposalRevision({ ...scope, draft: null, failureCode: 'nothing_to_revise' });
    const request = held.change_requests[held.change_requests.length - 1].text;
    const prompt = buildLandingPagePrompt({ analysis: pilot.analysis, target, current: page.content, request });
    const raw = await meteredCall(ctx, 'landing_page', null, () => ctx.llm.generateJson({ ...prompt, schema: GrowthLandingContentSchema, effort: 'high' }));
    const content = sanitizeLandingContent(raw as GrowthLandingContent);
    if (!content) return await completeGrowthProposalRevision({ ...scope, draft: null, failureCode: 'invalid_output' });
    await updateGrowthLandingContent({ organizationId: ctx.organizationId, projectId: ctx.projectId, pageId: page.id, content, now: ctx.now });
    return await completeGrowthProposalRevision({ ...scope, draft: held.draft ?? null });
  } catch (error) {
    return completeGrowthProposalRevision({ ...scope, draft: null, failureCode: growthFailureCode(error) });
  }
}
