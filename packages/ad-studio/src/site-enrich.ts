import { z } from 'zod/v4';
import {
  buildSiteEnrichmentPrompt,
  isAdStudioVoicePreset,
  normalizeSiteUrl,
  sanitizeSiteEnrichment,
  type AdStudioBrandKit,
} from '@growthos/shared';
import {
  adStudioBriefInput,
  getAdStudioBrandKit,
  getAdStudioBrief,
  getAdStudioDemoAccess,
  getCurrentGrowthPilot,
  listAdStudioBriefs,
  ProjectModel,
  saveAdStudioVoice,
  updateAdStudioBriefDetails,
  updateProjectDetails,
  type AdStudioBriefModel,
} from '@growthos/firebase-orm-models';
import { fillAdStudioBrandFromSite } from './brand';
import { readGrowthSite } from './growth-pilot';
import { meteredCall, type AdStudioCallContext } from './metering';
import type { PlanningSourceDeps } from './planning-sources';
import { adStudioRuntime, ensureOrm } from './runtime';

const SiteEnrichmentSchema = z.object({
  brandName: z.string(),
  slogan: z.string(),
  toneOfVoice: z.string(),
  colors: z.array(z.string()),
  productDescription: z.string(),
  objective: z.string(),
  currency: z.string(),
  timezone: z.string(),
  vertical: z.string(),
  voicePreset: z.string(),
  language: z.string(),
});

const ISO_CURRENCY = /^[A-Z]{3}$/;
const MIN_OBJECTIVE_CHARS = 15;
const MIN_DESCRIPTION_CHARS = 40;

function isValidCurrency(value: string): boolean {
  return ISO_CURRENCY.test(value);
}

function isValidTimezone(value: string): boolean {
  if (!value) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function safeOriginUrl(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const normalized = normalizeSiteUrl(raw);
  if (!normalized) return null;
  try {
    return new URL(normalized).origin;
  } catch {
    return null;
  }
}

/**
 * Resolves the target website URL for a brief/project from any available source:
 * explicit input -> brief's own URL -> Growth Pilot site URL -> Demo Access URL/origin -> sibling brief URL.
 */
export async function resolveBriefTargetSiteUrl(
  organizationId: string,
  projectId: string,
  brief: Pick<AdStudioBriefModel, 'id' | 'landing_page_url'>,
  explicitSiteUrl?: string | null,
): Promise<string | null> {
  const fromExplicit = explicitSiteUrl ? normalizeSiteUrl(explicitSiteUrl) : null;
  if (fromExplicit) return fromExplicit;

  const fromBrief = brief.landing_page_url ? normalizeSiteUrl(brief.landing_page_url) : null;
  if (fromBrief) return fromBrief;

  const pilot = await getCurrentGrowthPilot(organizationId, projectId).catch(() => null);
  const fromPilot = pilot?.site_url ? normalizeSiteUrl(pilot.site_url) : null;
  if (fromPilot) return fromPilot;

  const demoAccess = await getAdStudioDemoAccess(organizationId, projectId, null).catch(() => null);
  if (demoAccess) {
    const fromDemo = demoAccess.publicSite ? normalizeSiteUrl(demoAccess.loginUrl) : safeOriginUrl(demoAccess.loginUrl);
    if (fromDemo) return fromDemo;
  }

  const briefs = await listAdStudioBriefs(organizationId, projectId).catch(() => [] as AdStudioBriefModel[]);
  for (const sibling of briefs) {
    if (sibling.id === brief.id) continue;
    const url = sibling.landing_page_url ? normalizeSiteUrl(sibling.landing_page_url) : null;
    if (url) return url;
  }
  return null;
}

export interface SiteEnrichmentResult {
  status: 'done' | 'skipped';
  reason: string | null;
  siteUrl: string | null;
  filled: string[];
}

/**
 * Automatically reads the project/brief's target website and populates any missing brand kit,
 * project settings, and brief fields without ever overwriting user-entered values.
 */
export async function enrichProjectAndBriefFromSite(
  ctx: AdStudioCallContext & { briefId: string; siteUrl?: string | null; deps?: PlanningSourceDeps },
): Promise<SiteEnrichmentResult> {
  await ensureOrm();
  const [brief, brandKit, project] = await Promise.all([
    getAdStudioBrief(ctx.organizationId, ctx.projectId, ctx.briefId),
    getAdStudioBrandKit(ctx.organizationId, ctx.projectId),
    ProjectModel.init(ctx.projectId, { organization_id: ctx.organizationId }).catch(() => null),
  ]);

  const siteUrl = await resolveBriefTargetSiteUrl(ctx.organizationId, ctx.projectId, brief, ctx.siteUrl);
  if (!siteUrl) {
    return { status: 'skipped', reason: 'no_site_url', siteUrl: null, filled: [] };
  }

  const missingBrandName = !brandKit.brandName.trim();
  const missingSlogan = !brandKit.slogan.trim();
  const missingTone = !brandKit.toneOfVoice.trim();
  const missingColors = brandKit.colors.length === 0;
  const missingLogo = !brandKit.logo;

  const missingCurrency = Boolean(project && !project.currency?.trim());
  const missingTimezone = Boolean(project && !project.timezone?.trim());
  const missingVertical = Boolean(project && !project.vertical?.trim());

  const missingLandingUrl = !brief.landing_page_url?.trim();
  const thinObjective = brief.objective.trim().length < MIN_OBJECTIVE_CHARS;
  const thinProductDesc = brief.product_description.trim().length < MIN_DESCRIPTION_CHARS;
  const missingVoice = !brief.narrator_voice;

  const needsSiteRead =
    missingBrandName ||
    missingSlogan ||
    missingTone ||
    missingColors ||
    missingLogo ||
    missingCurrency ||
    missingTimezone ||
    missingVertical ||
    missingLandingUrl ||
    thinObjective ||
    thinProductDesc ||
    missingVoice;

  if (!needsSiteRead) {
    return { status: 'skipped', reason: 'already_done', siteUrl, filled: [] };
  }

  const site = await readGrowthSite(siteUrl, ctx.deps ?? adStudioRuntime().siteReader);
  const filled: string[] = [];

  if (site.status !== 'ok') {
    if (missingLandingUrl) {
      await updateAdStudioBriefDetails({
        organizationId: ctx.organizationId,
        projectId: ctx.projectId,
        briefId: brief.id,
        input: { ...adStudioBriefInput(brief), landingPageUrl: siteUrl },
        now: ctx.now,
      });
      filled.push('brief.landing_page_url');
    }
    return { status: 'skipped', reason: `site_${site.reason}`, siteUrl, filled };
  }

  const detectedColors = site.colors ?? [];
  const needsLlm =
    missingBrandName ||
    missingSlogan ||
    missingTone ||
    (missingColors && detectedColors.length === 0) ||
    missingCurrency ||
    missingTimezone ||
    missingVertical ||
    thinObjective ||
    thinProductDesc ||
    missingVoice;

  let extracted = sanitizeSiteEnrichment({});
  if (needsLlm) {
    const existingBrand: AdStudioBrandKit = {
      brandName: brandKit.brandName,
      slogan: brandKit.slogan,
      toneOfVoice: brandKit.toneOfVoice,
      avoidWords: brandKit.avoidWords,
      colors: brandKit.colors,
    };
    const prompt = buildSiteEnrichmentPrompt({
      pages: site.pages,
      brief: {
        name: brief.name,
        objective: brief.objective,
        productDescription: brief.product_description,
        language: brief.language,
      },
      existingBrand,
      detectedColors,
    });
    const raw = await meteredCall(ctx, 'site_analysis', brief.id, () => ctx.llm.generateJson({ ...prompt, schema: SiteEnrichmentSchema }));
    extracted = sanitizeSiteEnrichment(raw);
  }

  const mergedColors = [...new Set([...detectedColors, ...extracted.colors])].slice(0, 5);
  await fillAdStudioBrandFromSite(
    { organizationId: ctx.organizationId, projectId: ctx.projectId, actorId: ctx.actorId },
    {
      businessName: missingBrandName ? extracted.brandName : undefined,
      slogan: missingSlogan ? extracted.slogan : undefined,
      toneOfVoice: missingTone ? extracted.toneOfVoice : undefined,
      colors: missingColors ? mergedColors : undefined,
      logoUrl: missingLogo ? site.logoUrl : undefined,
    },
    { site: ctx.deps ?? adStudioRuntime().siteReader },
  );
  if (missingBrandName && extracted.brandName) filled.push('brand.brandName');
  if (missingSlogan && extracted.slogan) filled.push('brand.slogan');
  if (missingTone && extracted.toneOfVoice) filled.push('brand.toneOfVoice');
  if (missingColors && mergedColors.length > 0) filled.push('brand.colors');
  if (missingLogo && site.logoUrl) filled.push('brand.logo');

  if (project) {
    const nextCurrency = missingCurrency && isValidCurrency(extracted.currency) ? extracted.currency : undefined;
    const nextTimezone = missingTimezone && isValidTimezone(extracted.timezone) ? extracted.timezone : undefined;
    const nextVertical = missingVertical && extracted.vertical ? extracted.vertical : undefined;
    if (nextCurrency || nextTimezone || nextVertical) {
      try {
        await updateProjectDetails({
          organizationId: ctx.organizationId,
          projectId: ctx.projectId,
          name: project.name,
          vertical: project.vertical?.trim() ? project.vertical : (nextVertical ?? ''),
          ...(nextCurrency ? { currency: nextCurrency } : {}),
          ...(nextTimezone ? { timezone: nextTimezone } : {}),
          actorUserId: ctx.actorId,
        });
        if (nextCurrency) filled.push('project.currency');
        if (nextTimezone) filled.push('project.timezone');
        if (nextVertical) filled.push('project.vertical');
      } catch (error) {
        console.error('[ad-studio] site enrichment project update failed', {
          projectId: ctx.projectId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  const nextObjective = thinObjective && extracted.objective ? extracted.objective : brief.objective;
  const nextDescription = thinProductDesc && extracted.productDescription ? extracted.productDescription : brief.product_description;
  const nextLandingUrl = missingLandingUrl ? siteUrl : (brief.landing_page_url ?? null);
  if (
    nextLandingUrl !== (brief.landing_page_url ?? null) ||
    nextObjective !== brief.objective ||
    nextDescription !== brief.product_description
  ) {
    await updateAdStudioBriefDetails({
      organizationId: ctx.organizationId,
      projectId: ctx.projectId,
      briefId: brief.id,
      input: {
        ...adStudioBriefInput(brief),
        landingPageUrl: nextLandingUrl,
        objective: nextObjective,
        productDescription: nextDescription,
      },
      now: ctx.now,
    });
    if (missingLandingUrl) filled.push('brief.landing_page_url');
    if (nextObjective !== brief.objective) filled.push('brief.objective');
    if (nextDescription !== brief.product_description) filled.push('brief.product_description');
  }

  if (missingVoice && isAdStudioVoicePreset(extracted.voicePreset)) {
    await saveAdStudioVoice({
      organizationId: ctx.organizationId,
      projectId: ctx.projectId,
      briefId: brief.id,
      voice: { preset: extracted.voicePreset },
      now: ctx.now,
    });
    filled.push('brief.narrator_voice');
  }

  return { status: 'done', reason: null, siteUrl, filled };
}
