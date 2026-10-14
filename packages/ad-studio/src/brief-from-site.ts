import {
  buildSiteAnalysisPrompt,
  growthBriefInput,
  normalizeSiteUrl,
  proposedTargetsFromAnalysis,
  sanitizeSiteAnalysis,
} from '@growthos/shared';
import { createAdStudioBrief, type AdStudioBriefModel } from '@growthos/firebase-orm-models';
import { ensureOrm, adStudioRuntime } from './runtime';
import { meteredCall, type AdStudioCallContext } from './metering';
import { GrowthSiteAnalysisSchema, readGrowthSite } from './growth-pilot';
import type { PlanningSourceDeps } from './planning-sources';

/** Why an ad could not be made from a website: an address that is not a website, a site that cannot be read, or nothing on it to advertise. */
export class AdStudioSiteError extends Error {
  constructor(public readonly reason: string) {
    super(`Could not make an ad from the website: ${reason}`);
    this.name = 'AdStudioSiteError';
  }
}

/**
 * Makes a whole ad brief from nothing but a website, for someone who would not know what to write
 * in one: reads the site (the home page and the pages that say what is sold), lets the AI say what
 * the business offers and to whom (one metered `site_analysis` call - the same reading Growth Pilot
 * does), and writes the brief for the first offering it found - in the site's language, sending
 * people to the site. The person reviews everything that follows; nothing is published.
 */
export async function createAdStudioBriefFromSite(ctx: AdStudioCallContext & { siteUrl: string; deps?: PlanningSourceDeps }): Promise<AdStudioBriefModel> {
  await ensureOrm();
  const siteUrl = normalizeSiteUrl(ctx.siteUrl);
  if (!siteUrl) throw new AdStudioSiteError('invalid_url');
  const site = await readGrowthSite(siteUrl, ctx.deps ?? adStudioRuntime().siteReader);
  if (site.status !== 'ok') throw new AdStudioSiteError(`site_${site.reason}`);
  const prompt = buildSiteAnalysisPrompt(site.pages);
  const raw = await meteredCall(ctx, 'site_analysis', null, () => ctx.llm.generateJson({ ...prompt, schema: GrowthSiteAnalysisSchema, effort: 'high' }));
  const analysis = sanitizeSiteAnalysis(raw);
  const drafts = proposedTargetsFromAnalysis(analysis);
  // What is sold makes a clearer first ad than an audience; an audience-only site still gets one.
  const target = drafts.find((draft) => draft.kind !== 'audience') ?? drafts[0];
  if (!target) throw new AdStudioSiteError('nothing_found');
  return createAdStudioBrief({
    organizationId: ctx.organizationId,
    projectId: ctx.projectId,
    input: growthBriefInput({ analysis, target, siteUrl }),
    createdByUserId: ctx.actorId,
    now: ctx.now,
  });
}
