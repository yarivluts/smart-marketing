import { z } from 'zod/v4';
import {
  AdStudioQuotaExceededError,
  acquireGrowthPilotLease,
  addRequestedGrowthTarget,
  completeGrowthProposalRevision,
  AdStudioExportUnavailableError,
  createAdStudioBrief,
  listGrowthPilotIndex,
  recordGrowthPilotRun,
  failGrowthPublish,
  getGrowthProposal,
  GrowthProposalNotPendingError,
  listGrowthLandingPages,
  listGrowthProposals,
  markGrowthAdsPublished,
  markGrowthAdsRunning,
  markGrowthTargetNeedsMeta,
  resolveAdStudioExportDestinations,
  saveGrowthPublishProposal,
  setAdStudioMetaAdsStatus,
  failGrowthAudience,
  saveGrowthAudienceProposal,
  updateGrowthAudiencePlan,
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
  audienceTargeting,
  buildAudiencePrompt,
  buildInterestChoicePrompt,
  GROWTH_INTEREST_CANDIDATES_PER_KEYWORD,
  buildLandingPagePrompt,
  landingCtaUrl,
  defaultMetaTargeting,
  buildSiteAnalysisPrompt,
  buildTargetFromRequestPrompt,
  buildTargetRevisionPrompt,
  extractLandingPageContent,
  GROWTH_PILOT_MAX_PAGES,
  GROWTH_TARGET_KINDS,
  growthBriefInput,
  pickSiteLinks,
  proposedTargetsFromAnalysis,
  sanitizeAudienceDraft,
  sanitizeLandingContent,
  sanitizeSiteAnalysis,
  sanitizeTargetDraft,
  type GrowthAudienceDraft,
  type GrowthAudiencePlan,
  type GrowthInterestCandidate,
  type GrowthLandingContent,
  type GrowthSiteAnalysis,
  type GrowthSitePage,
  type GrowthTargetDraft,
} from '@growthos/shared';
import { estimateAdStudioMetaReach, searchAdStudioMetaInterests } from './audiences';
import { publishBriefAd } from './publish';
import { serverKms } from './planning-sources';
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

export const GrowthAudienceDraftSchema = z.object({
  summary: z.string().describe('One or two sentences for the owner, in the site language: who these ads reach and why.'),
  countries: z.array(z.string()).describe('ISO 3166 two-letter country codes.'),
  ageMin: z.number(),
  ageMax: z.number(),
  genders: z.array(z.enum(['male', 'female'])).describe('Empty for everyone.'),
  interestKeywords: z.array(z.string()).describe('3-8 short English words to look up as Meta interests.'),
});

export const GrowthInterestChoiceSchema = z.object({ ids: z.array(z.string()).describe('The ids of the relevant interests, at most 8.') });

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

/** Who advances which pilot, with what: the model, the ad pipeline, and the public origin for landing links. */
export interface GrowthAdvanceContext extends AdStudioCallContext {
  pilotId: string;
  deps?: PlanningSourceDeps;
  autopilot?: AdStudioAutopilotDeps;
  publicWebUrl?: string | null;
}

/**
 * Does the pilot's pending work, one unit (see advanceGrowthPilotOnce), and returns the pilot as it
 * stands. Safe to call repeatedly - the page polls it.
 */
export async function advanceGrowthPilot(ctx: GrowthAdvanceContext): Promise<GrowthPilotModel> {
  return (await advanceGrowthPilotOnce(ctx)).pilot;
}

/**
 * One unit of the pilot's pending work, and whether there was any: reading the site while it is
 * being analyzed; once active, the next step of a target's landing page, audience, ads or publish
 * proposal. A paused pilot, or one with nothing left to do, reports `worked: false`.
 */
export async function advanceGrowthPilotOnce(ctx: GrowthAdvanceContext): Promise<{ pilot: GrowthPilotModel; worked: boolean }> {
  await ensureOrm();
  const pilot = await getGrowthPilot(ctx.organizationId, ctx.projectId, ctx.pilotId);
  if (pilot.status === 'active' && ctx.autopilot) {
    return { pilot, worked: await progressGrowthAds({ ...ctx, autopilot: ctx.autopilot }, pilot) };
  }
  if (pilot.status !== 'analyzing') return { pilot, worked: false };
  const token = await acquireGrowthPilotLease(pilot, { now: ctx.now });
  if (!token) return { pilot, worked: false };
  const site = await readGrowthSite(pilot.site_url, ctx.deps ?? adStudioRuntime().siteReader);
  if (site.status !== 'ok') return { pilot: (await failGrowthPilotAnalysis({ pilot, token, code: `site_${site.reason}`, now: ctx.now })) ?? pilot, worked: true };
  try {
    const prompt = buildSiteAnalysisPrompt(site.pages);
    const raw = await meteredCall(ctx, 'site_analysis', null, () => ctx.llm.generateJson({ ...prompt, schema: GrowthSiteAnalysisSchema, effort: 'high' }));
    const analysis = sanitizeSiteAnalysis(raw);
    const drafts = proposedTargetsFromAnalysis(analysis);
    if (drafts.length === 0) return { pilot: (await failGrowthPilotAnalysis({ pilot, token, code: 'nothing_found', now: ctx.now })) ?? pilot, worked: true };
    const saved = await saveGrowthPilotAnalysis({
      pilot,
      token,
      analysis,
      pages: site.pages.map((page) => ({ url: page.url, title: page.title })),
      drafts,
      generatedBy: { provider: ctx.llm.provider, model: ctx.llm.model },
      now: ctx.now,
    });
    return { pilot: saved ?? pilot, worked: true };
  } catch (error) {
    return { pilot: (await failGrowthPilotAnalysis({ pilot, token, code: growthFailureCode(error), now: ctx.now })) ?? pilot, worked: true };
  }
}

/** The project's current pilot, advanced if it has pending work; null when none was started. */
export async function advanceCurrentGrowthPilot(ctx: AdStudioCallContext & { deps?: PlanningSourceDeps; autopilot?: AdStudioAutopilotDeps; publicWebUrl?: string | null }): Promise<GrowthPilotModel | null> {
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
  if (held.kind === 'audience') return reviseGrowthAudience(ctx, held, scope);
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

type AdsContext = AdStudioCallContext & { autopilot: AdStudioAutopilotDeps; publicWebUrl?: string | null };

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
async function progressGrowthAds(ctx: AdsContext, pilot: GrowthPilotModel): Promise<boolean> {
  const targets = await listGrowthTargets(ctx.organizationId, ctx.projectId, pilot.id);
  const building = targets.find((target) => target.ads_status === 'building' && target.brief_id && target.run_id);
  if (building?.brief_id && building.run_id) {
    let run = await getAdStudioRun(ctx.organizationId, ctx.projectId, building.brief_id, building.run_id);
    if (run.status === 'running') run = await advanceAdStudioAutopilot({ organizationId: ctx.organizationId, projectId: ctx.projectId, briefId: building.brief_id, actorId: ctx.actorId, runId: run.id }, ctx.autopilot);
    if (run.status !== 'running' && run.status !== 'awaiting_approval') await finishAds(ctx, building, run);
    return true;
  }
  if (!pilot.analysis) return false;
  const needsPage = targets.find((target) => target.status === 'active' && (target.landing_status ?? 'none') === 'none');
  if (needsPage) {
    await writeGrowthLanding(ctx, pilot, needsPage);
    return true;
  }
  const needsAudience = targets.find((target) => target.status === 'active' && target.brief_id && (target.audience_status ?? 'none') === 'none');
  if (needsAudience) {
    await planGrowthAudience(ctx, pilot, needsAudience);
    return true;
  }
  const readyToPublish = targets.find(
    (target) =>
      target.status === 'active' &&
      target.ads_status === 'approved' &&
      decided(target.audience_status) &&
      decided(target.landing_status) &&
      ['none', 'needs_meta'].includes(target.publish_status ?? 'none'),
  );
  if (readyToPublish && (await proposeGrowthPublish(ctx, pilot, readyToPublish))) return true;
  const next = targets.find((target) => target.status === 'active' && !target.brief_id && (target.ads_status ?? 'none') === 'none');
  if (!next) return false;
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
  return true;
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

/**
 * Turns the AI's audience into Meta targeting. Each interest word is looked up in Meta, and from all
 * the candidates the AI keeps only the relevant ones - Meta's search matches loosely, so its biggest
 * hit is often unrelated. The result gets a reach estimate. Without Meta (not connected, or it
 * failed) the plan still holds countries, ages and genders, and says why the interests are not matched.
 */
async function resolveAudiencePlan(ctx: AdStudioCallContext, draft: GrowthAudienceDraft, context: { analysis: GrowthSiteAnalysis; target: GrowthTargetModel }): Promise<GrowthAudiencePlan> {
  const lookup = { organizationId: ctx.organizationId, projectId: ctx.projectId };
  const language = context.analysis.language || 'en';
  const candidates: (GrowthInterestCandidate & { sizeLower: number | null; sizeUpper: number | null })[] = [];
  let meta = 'ok';
  for (const word of draft.interestKeywords) {
    const found = await searchAdStudioMetaInterests({ ...lookup, query: word, language });
    if (found.status !== 'ok') {
      meta = found.reason;
      break;
    }
    for (const interest of found.data.slice(0, GROWTH_INTEREST_CANDIDATES_PER_KEYWORD)) {
      if (!candidates.some((candidate) => candidate.id === interest.id)) candidates.push({ id: interest.id, name: interest.name, path: interest.path, keyword: word, sizeLower: interest.sizeLower, sizeUpper: interest.sizeUpper });
    }
  }
  let interests: GrowthAudiencePlan['targeting']['interests'] = [];
  if (meta === 'ok' && candidates.length) {
    const prompt = buildInterestChoicePrompt({ analysis: context.analysis, target: context.target, candidates });
    const chosen = await meteredCall(ctx, 'audience_plan', null, () => ctx.llm.generateJson({ ...prompt, schema: GrowthInterestChoiceSchema }));
    const ids = new Set((chosen as { ids: string[] }).ids);
    interests = candidates.filter((candidate) => ids.has(candidate.id)).slice(0, 8).map((candidate) => ({ id: candidate.id, name: candidate.name, sizeLower: candidate.sizeLower, sizeUpper: candidate.sizeUpper }));
  }
  const matchedWords = new Set(candidates.filter((candidate) => interests.some((interest) => interest.id === candidate.id)).map((candidate) => candidate.keyword));
  const unresolved = draft.interestKeywords.filter((word) => !matchedWords.has(word));
  const targeting = audienceTargeting(draft, interests);
  let reach: GrowthAudiencePlan['reach'] = null;
  if (meta === 'ok') {
    const estimate = await estimateAdStudioMetaReach({ ...lookup, targeting });
    // A failed estimate only means no reach figure: the matched interests stand.
    if (estimate.status === 'ok' && estimate.data.ready) reach = { lower: estimate.data.monthlyLower, upper: estimate.data.monthlyUpper };
  }
  return { summary: draft.summary, targeting, unresolvedInterests: unresolved, reach, meta };
}

async function writeAudienceDraft(ctx: AdStudioCallContext, pilot: GrowthPilotModel, target: GrowthTargetModel, current?: GrowthAudienceDraft, request?: string): Promise<GrowthAudienceDraft> {
  const analysis = pilot.analysis!;
  const prompt = buildAudiencePrompt({ analysis, target, siteUrl: pilot.site_url, current, request });
  const raw = await meteredCall(ctx, 'audience_plan', null, () => ctx.llm.generateJson({ ...prompt, schema: GrowthAudienceDraftSchema }));
  return sanitizeAudienceDraft(raw as GrowthAudienceDraft, defaultMetaTargeting(analysis.language || 'en').countries[0]);
}

/** Proposes the audience for a target whose ads exist (one text call, then Meta lookups). */
async function planGrowthAudience(ctx: AdStudioCallContext, pilot: GrowthPilotModel, target: GrowthTargetModel): Promise<void> {
  const scope = { organizationId: ctx.organizationId, projectId: ctx.projectId, targetId: target.id, now: ctx.now };
  try {
    const draft = await writeAudienceDraft(ctx, pilot, target);
    const plan = await resolveAudiencePlan(ctx, draft, { analysis: pilot.analysis!, target });
    await saveGrowthAudienceProposal({ ...scope, plan });
  } catch (error) {
    await failGrowthAudience({ ...scope, failureCode: growthFailureCode(error) });
  }
}

/** The person asked for a change to an audience: the AI revises it, Meta matches it again, and it comes back. */
async function reviseGrowthAudience(ctx: AdStudioCallContext, held: GrowthProposalModel, scope: { organizationId: string; projectId: string; proposalId: string; now?: Date }): Promise<GrowthProposalModel> {
  try {
    if (!held.audience || !held.target_id) return await completeGrowthProposalRevision({ ...scope, draft: null, failureCode: 'nothing_to_revise' });
    const [pilot, target] = await Promise.all([getGrowthPilot(ctx.organizationId, ctx.projectId, held.pilot_id), getGrowthTarget(ctx.organizationId, ctx.projectId, held.target_id)]);
    if (!pilot.analysis) return await completeGrowthProposalRevision({ ...scope, draft: null, failureCode: 'nothing_to_revise' });
    const current: GrowthAudienceDraft = {
      summary: held.audience.summary,
      countries: held.audience.targeting.countries,
      ageMin: held.audience.targeting.ageMin,
      ageMax: held.audience.targeting.ageMax,
      genders: held.audience.targeting.genders,
      interestKeywords: [...held.audience.targeting.interests.map((interest) => interest.name), ...held.audience.unresolvedInterests],
    };
    const request = held.change_requests[held.change_requests.length - 1].text;
    const draft = await writeAudienceDraft(ctx, pilot, target, current, request);
    const plan = await resolveAudiencePlan(ctx, draft, { analysis: pilot.analysis, target });
    await updateGrowthAudiencePlan({ organizationId: ctx.organizationId, projectId: ctx.projectId, proposalId: held.id, plan, now: ctx.now });
    return await completeGrowthProposalRevision({ ...scope, draft: held.draft ?? null });
  } catch (error) {
    return completeGrowthProposalRevision({ ...scope, draft: null, failureCode: growthFailureCode(error) });
  }
}

/** The person has had their say on this part (approved, rejected, or it failed) - nothing waits on it. */
function decided(status: string | null | undefined): boolean {
  return Boolean(status) && status !== 'none' && status !== 'ready';
}

/** The default daily budget a publish proposal suggests, in the ad account's currency; the person sets their own. */
export const GROWTH_DEFAULT_DAILY_BUDGET = 20;
const MAX_DAILY_BUDGET = 100_000;

/**
 * Proposes publishing a target whose ads are approved and whose audience and page are decided: the
 * approved images, sending people to its published landing page (or the tagged site). Without a
 * Meta ad account it marks the target as waiting for one instead. True when it did a unit of work.
 */
async function proposeGrowthPublish(ctx: AdsContext, pilot: GrowthPilotModel, target: GrowthTargetModel): Promise<boolean> {
  const scope = { organizationId: ctx.organizationId, projectId: ctx.projectId, targetId: target.id, now: ctx.now };
  const destinations = await resolveAdStudioExportDestinations(ctx.organizationId, ctx.projectId);
  if (!destinations.meta.available) {
    if (target.publish_status === 'needs_meta') return false;
    await markGrowthTargetNeedsMeta(scope);
    return true;
  }
  const [proposals, pages, brief] = await Promise.all([
    listGrowthProposals(ctx.organizationId, ctx.projectId, pilot.id),
    listGrowthLandingPages(ctx.organizationId, ctx.projectId, pilot.id),
    getAdStudioBrief(ctx.organizationId, ctx.projectId, target.brief_id!),
  ]);
  const ads = proposals.find((proposal) => proposal.kind === 'ads' && proposal.status === 'approved' && proposal.target_id === target.id);
  const imageIds = ads?.preview_image_ids ?? [];
  if (!imageIds.length) return false;
  const page = pages.find((candidate) => candidate.target_id === target.id && candidate.status === 'published');
  const base = ctx.publicWebUrl?.replace(/\/+$/, '');
  const linkUrl = page ? (base ? `${base}/lp/${page.slug}` : page.cta_url) : landingCtaUrl(pilot.site_url, `target-${target.id}`);
  const language = pilot.analysis?.language || 'en';
  await saveGrowthPublishProposal({
    ...scope,
    plan: {
      destination: 'meta',
      imageIds,
      dailyBudget: GROWTH_DEFAULT_DAILY_BUDGET,
      linkUrl,
      campaignName: `${pilot.analysis?.businessName || 'Growth Pilot'} - ${target.name}`.slice(0, 100),
      countries: brief.meta_targeting?.countries?.length ? brief.meta_targeting.countries : defaultMetaTargeting(language).countries,
    },
  });
  return true;
}

export class GrowthPublishInvalidError extends Error {
  constructor() {
    super('The daily budget must be a positive number.');
    this.name = 'GrowthPublishInvalidError';
  }
}

export interface GrowthPlatformDeps {
  publish?: typeof publishBriefAd;
  setStatus?: typeof setAdStudioMetaAdsStatus;
}

/**
 * The person approved publishing (with the daily budget they chose): every approved image becomes a
 * paused Meta ad in one ad set, with its idea's words and the proposal's link. If the first cannot be
 * created nothing is, and the target says why; turning the ads on becomes the next proposal.
 */
export async function approveGrowthPublish(ctx: AdStudioCallContext & { proposalId: string; dailyBudget?: number }, deps: GrowthPlatformDeps = {}): Promise<GrowthProposalModel> {
  await ensureOrm();
  const proposal = await getGrowthProposal(ctx.organizationId, ctx.projectId, ctx.proposalId);
  if (proposal.status !== 'pending' || proposal.kind !== 'publish' || !proposal.publish || !proposal.target_id) throw new GrowthProposalNotPendingError(proposal.status);
  const budget = ctx.dailyBudget ?? proposal.publish.dailyBudget;
  if (!Number.isFinite(budget) || budget <= 0 || budget > MAX_DAILY_BUDGET) throw new GrowthPublishInvalidError();
  // Before anything is read or created: is there a Meta ad account to publish to?
  const destinations = await resolveAdStudioExportDestinations(ctx.organizationId, ctx.projectId);
  if (!destinations.meta.available) throw new AdStudioExportUnavailableError('meta', destinations.meta.reason);
  const target = await getGrowthTarget(ctx.organizationId, ctx.projectId, proposal.target_id);
  const pilot = await getGrowthPilot(ctx.organizationId, ctx.projectId, proposal.pilot_id);
  const brief = await getAdStudioBrief(ctx.organizationId, ctx.projectId, target.brief_id!);
  const images = await listBriefImages({ organizationId: ctx.organizationId, projectId: ctx.projectId, briefId: brief.id });
  const publish = deps.publish ?? publishBriefAd;
  const plan = proposal.publish;
  const done: string[] = [];
  for (const imageId of plan.imageIds) {
    const concept = (brief.image_concepts ?? []).find((candidate) => candidate.id === images.find((image) => image.id === imageId)?.conceptId);
    const copy = concept?.copy;
    const row = await publish({
      organizationId: ctx.organizationId,
      projectId: ctx.projectId,
      briefId: brief.id,
      destination: 'meta',
      source: { kind: 'image', imageId },
      copy: {
        headline: copy?.headline || concept?.headline || target.name,
        primaryText: copy?.primaryText || concept?.headline || target.description,
        description: copy?.description ?? '',
        linkUrl: plan.linkUrl,
        businessName: pilot.analysis?.businessName || target.name,
      },
      campaignName: plan.campaignName,
      dailyBudget: budget,
      countries: plan.countries,
      ...(done.length ? { addToAdSetOf: done[0] } : {}),
      actorId: ctx.actorId,
    });
    if (row.status === 'done') done.push(row.id);
    else if (!done.length) {
      await failGrowthPublish({ organizationId: ctx.organizationId, projectId: ctx.projectId, targetId: target.id, failureCode: row.failure_code ?? 'publish_failed', now: ctx.now });
      return proposal;
    }
  }
  return markGrowthAdsPublished({ organizationId: ctx.organizationId, projectId: ctx.projectId, proposalId: proposal.id, exportIds: done, dailyBudget: budget, actorId: ctx.actorId, now: ctx.now });
}

/** The person approved turning the ads on: from now they spend up to the daily budget. Refused while the kill switch is on. */
export async function approveGrowthActivation(ctx: AdStudioCallContext & { proposalId: string }, deps: GrowthPlatformDeps = {}): Promise<GrowthProposalModel> {
  await ensureOrm();
  const proposal = await getGrowthProposal(ctx.organizationId, ctx.projectId, ctx.proposalId);
  if (proposal.status !== 'pending' || proposal.kind !== 'activate' || !proposal.target_id) throw new GrowthProposalNotPendingError(proposal.status);
  const target = await getGrowthTarget(ctx.organizationId, ctx.projectId, proposal.target_id);
  const kms = serverKms();
  if (!kms) throw new AdStudioProviderError('not_configured', 'The credential vault is not configured.');
  await (deps.setStatus ?? setAdStudioMetaAdsStatus)({ organizationId: ctx.organizationId, projectId: ctx.projectId, exportIds: target.ad_export_ids ?? [], status: 'ACTIVE', actorId: ctx.actorId, kms });
  return markGrowthAdsRunning({ organizationId: ctx.organizationId, projectId: ctx.projectId, proposalId: proposal.id, actorId: ctx.actorId, now: ctx.now });
}

export interface GrowthSchedulerRun {
  organizationId: string;
  projectId: string;
  units: number;
  outcome: string;
}

/** The most units one scheduled run gives a single pilot, so one busy pilot cannot starve the rest. */
export const GROWTH_SCHEDULER_UNITS_PER_PILOT = 12;

/**
 * Keeps every Growth Pilot moving without an open tab: walks the pilots that have work (being read,
 * or active), least recently run first, and does their pending units on behalf of the person who
 * started each - within the project's daily AI limits like any other call - until the time budget is
 * spent. Publishing and turning ads on are never done here: they wait for the person's approval.
 */
export async function runScheduledGrowthPilots(ctx: {
  llm: AdStudioCallContext['llm'];
  autopilot: AdStudioAutopilotDeps;
  publicWebUrl?: string | null;
  budgetMs: number;
  clock?: () => number;
  now?: Date;
  /** The unit of work (tests); defaults to advanceGrowthPilotOnce. */
  step?: typeof advanceGrowthPilotOnce;
}): Promise<GrowthSchedulerRun[]> {
  await ensureOrm();
  const clock = ctx.clock ?? Date.now;
  const deadline = clock() + ctx.budgetMs;
  const pilots = (await listGrowthPilotIndex())
    .filter((row) => row.status === 'analyzing' || row.status === 'active')
    .sort((a, b) => (a.last_run_on ?? '').localeCompare(b.last_run_on ?? ''));
  const runs: GrowthSchedulerRun[] = [];
  for (const row of pilots) {
    if (clock() >= deadline) break;
    let units = 0;
    let outcome = 'idle';
    try {
      while (units < GROWTH_SCHEDULER_UNITS_PER_PILOT && clock() < deadline) {
        const step = await (ctx.step ?? advanceGrowthPilotOnce)({
          organizationId: row.organization_id,
          projectId: row.project_id,
          actorId: row.started_by,
          llm: ctx.llm,
          pilotId: row.pilot_id,
          autopilot: ctx.autopilot,
          publicWebUrl: ctx.publicWebUrl,
          now: ctx.now,
        });
        if (!step.worked) break;
        units += 1;
        outcome = 'worked';
      }
    } catch (error) {
      outcome = growthFailureCode(error);
    }
    await recordGrowthPilotRun({ organizationId: row.organization_id, projectId: row.project_id, outcome, now: ctx.now });
    runs.push({ organizationId: row.organization_id, projectId: row.project_id, units, outcome });
  }
  return runs;
}
