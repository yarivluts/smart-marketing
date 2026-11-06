import {
  adStudioBriefInput,
  getAdStudioAdvertiserName,
  getAdStudioBrandKit,
  setAdStudioBrandKit,
  setAdStudioBrandLogo,
  type AdStudioBrandKitView,
  type AdStudioBriefModel,
} from '@growthos/firebase-orm-models';
import sharp from 'sharp';
import { AD_STUDIO_BRAND_LIMITS, isAdStudioBrandKitEmpty, sniffReferenceMimeType, type AdStudioBriefInput } from '@growthos/shared';
import { fetchPublicImage, type PlanningSourceDeps } from './planning-sources';
import { ensureOrm } from './runtime';
import { readAdStudioObject, resolveAdStudioMediaStorage, type AdStudioMediaStorage } from './media-storage';
import type { AdBrandMark } from './ad-typography';

/**
 * What a prompt knows about the ad: the brief, plus the project's brand kit when one is set, so
 * every script, copy, idea, search ad and image follows the brand's name, tone, banned words and colours.
 */
export async function briefPromptInput(brief: AdStudioBriefModel): Promise<AdStudioBriefInput> {
  const kit = await getAdStudioBrandKit(brief.organization_id, brief.project_id);
  const brand = { brandName: kit.brandName, slogan: kit.slogan, toneOfVoice: kit.toneOfVoice, avoidWords: kit.avoidWords, colors: kit.colors };
  return { ...adStudioBriefInput(brief), brand: isAdStudioBrandKitEmpty(brand) ? null : brand };
}

/** A stored logo is at most AD_STUDIO_MAX_LOGO_BYTES; reading one is capped a little above that. */
const MAX_STORED_LOGO_BYTES = 3 * 1024 * 1024;

/**
 * What the brand strip on every ad shows: the name (the brand kit's, else the project's), the slogan,
 * the logo's bytes and the brand colours. A logo that cannot be read leaves the strip without it
 * rather than failing the ad.
 */
export async function resolveAdBrandMark(
  brief: Pick<AdStudioBriefModel, 'organization_id' | 'project_id' | 'language'>,
  storage: AdStudioMediaStorage = resolveAdStudioMediaStorage(),
): Promise<AdBrandMark> {
  const kit = await getAdStudioBrandKit(brief.organization_id, brief.project_id);
  const name = await getAdStudioAdvertiserName(brief.organization_id, brief.project_id, kit);
  let logo: Buffer | null = null;
  if (kit.logo) {
    try {
      logo = await readAdStudioObject(storage, kit.logo.path, MAX_STORED_LOGO_BYTES);
    } catch (error) {
      console.error('[ad-studio] brand logo unreadable', { projectId: brief.project_id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { name, slogan: kit.slogan, logo, colors: kit.colors, language: brief.language };
}

/** The largest logo accepted: a logo is small; anything bigger is a photo uploaded by mistake. */
export const AD_STUDIO_MAX_LOGO_BYTES = 2 * 1024 * 1024;

/** A logo that is not a PNG or JPEG, or too large. */
export class AdStudioBrandLogoError extends Error {
  constructor(public readonly code: 'unsupported_image' | 'image_too_large') {
    super(code === 'image_too_large' ? 'The logo is larger than 2MB.' : 'The logo must be a PNG or JPEG image.');
    this.name = 'AdStudioBrandLogoError';
  }
}

/**
 * Stores an uploaded logo in the private media bucket and makes it the project's brand logo,
 * shown as the advertiser's picture in ad previews. The type comes from the bytes, not the request.
 */
export async function saveAdStudioBrandLogo(
  ctx: { organizationId: string; projectId: string; actorId: string; bytes: Buffer },
  storage: AdStudioMediaStorage = resolveAdStudioMediaStorage(),
): Promise<AdStudioBrandKitView> {
  if (ctx.bytes.length > AD_STUDIO_MAX_LOGO_BYTES) throw new AdStudioBrandLogoError('image_too_large');
  const mimeType = sniffReferenceMimeType(ctx.bytes);
  if (mimeType !== 'image/png' && mimeType !== 'image/jpeg') throw new AdStudioBrandLogoError('unsupported_image');
  await ensureOrm();
  const path = `orgs/${ctx.organizationId}/projects/${ctx.projectId}/brand/logo-${Date.now()}.${mimeType === 'image/png' ? 'png' : 'jpg'}`;
  await storage.upload(path, ctx.bytes, mimeType);
  return setAdStudioBrandLogo({ organizationId: ctx.organizationId, projectId: ctx.projectId, logo: { path, mimeType }, actorId: ctx.actorId });
}

/**
 * Fills what the brand kit is missing from what was read on the business's own site, so a beginner's
 * first ads already carry the brand: the name and slogan the site analysis found, and the logo the
 * home page points at (any image type, made a PNG of at most 512 px). Never overwrites what the person
 * set. Best effort: a logo that cannot be fetched or read leaves the kit without one.
 */
export async function fillAdStudioBrandFromSite(
  ctx: { organizationId: string; projectId: string; actorId: string },
  found: { businessName?: string | null; slogan?: string | null; logoUrl?: string | null },
  deps: { storage?: AdStudioMediaStorage; site?: PlanningSourceDeps } = {},
): Promise<void> {
  try {
    await ensureOrm();
    const kit = await getAdStudioBrandKit(ctx.organizationId, ctx.projectId);
    const brandName = kit.brandName || (found.businessName ?? '').trim().slice(0, AD_STUDIO_BRAND_LIMITS.brandName);
    const slogan = kit.slogan || (found.slogan ?? '').trim().slice(0, AD_STUDIO_BRAND_LIMITS.slogan);
    if (brandName !== kit.brandName || slogan !== kit.slogan) {
      await setAdStudioBrandKit({
        organizationId: ctx.organizationId,
        projectId: ctx.projectId,
        kit: { brandName, slogan, toneOfVoice: kit.toneOfVoice, avoidWords: kit.avoidWords, colors: kit.colors },
        actorId: ctx.actorId,
      });
    }
    if (kit.logo || !found.logoUrl) return;
    const bytes = await fetchPublicImage(found.logoUrl, deps.site);
    if (!bytes) return;
    const png = await sharp(bytes, { limitInputPixels: 50_000_000 }).resize(512, 512, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
    await saveAdStudioBrandLogo({ organizationId: ctx.organizationId, projectId: ctx.projectId, actorId: ctx.actorId, bytes: png }, deps.storage ?? resolveAdStudioMediaStorage());
  } catch (error) {
    console.error('[ad-studio] brand from site failed', { projectId: ctx.projectId, error: error instanceof Error ? error.message : String(error) });
  }
}

/** Removes the project's brand logo (the stored file stays with the project's media). */
export async function removeAdStudioBrandLogo(ctx: { organizationId: string; projectId: string; actorId: string }): Promise<AdStudioBrandKitView> {
  await ensureOrm();
  return setAdStudioBrandLogo({ organizationId: ctx.organizationId, projectId: ctx.projectId, logo: null, actorId: ctx.actorId });
}
