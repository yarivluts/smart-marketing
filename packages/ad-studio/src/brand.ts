import { adStudioBriefInput, getAdStudioBrandKit, setAdStudioBrandLogo, type AdStudioBrandKitView, type AdStudioBriefModel } from '@growthos/firebase-orm-models';
import { isAdStudioBrandKitEmpty, sniffReferenceMimeType, type AdStudioBriefInput } from '@growthos/shared';
import { ensureOrm } from './runtime';
import { resolveAdStudioMediaStorage, type AdStudioMediaStorage } from './media-storage';

/**
 * What a prompt knows about the ad: the brief, plus the project's brand kit when one is set, so
 * every script, copy, idea, search ad and image follows the brand's name, tone, banned words and colours.
 */
export async function briefPromptInput(brief: AdStudioBriefModel): Promise<AdStudioBriefInput> {
  const kit = await getAdStudioBrandKit(brief.organization_id, brief.project_id);
  const brand = { brandName: kit.brandName, toneOfVoice: kit.toneOfVoice, avoidWords: kit.avoidWords, colors: kit.colors };
  return { ...adStudioBriefInput(brief), brand: isAdStudioBrandKitEmpty(brand) ? null : brand };
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

/** Removes the project's brand logo (the stored file stays with the project's media). */
export async function removeAdStudioBrandLogo(ctx: { organizationId: string; projectId: string; actorId: string }): Promise<AdStudioBrandKitView> {
  await ensureOrm();
  return setAdStudioBrandLogo({ organizationId: ctx.organizationId, projectId: ctx.projectId, logo: null, actorId: ctx.actorId });
}
