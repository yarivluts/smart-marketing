import { EMPTY_AD_STUDIO_BRAND_KIT, validateAdStudioBrandKit, type AdStudioBrandKit } from '@growthos/shared';
import { AdStudioBrandKitModel } from '../models/ad-studio-brand-kit.model';
import { ProjectModel } from '../models/project.model';
import { ProjectNotFoundError } from './resource-library.service';
import { recordAuditLogEntry } from './audit-log.service';

const BRAND_KIT_ID = 'brand';

/** A brand kit that breaks the limits, with the codes the UI translates. */
export class AdStudioBrandKitInvalidError extends Error {
  constructor(public readonly issues: string[]) {
    super(`The brand kit is not valid: ${issues.join(', ')}`);
    this.name = 'AdStudioBrandKitInvalidError';
  }
}

export interface AdStudioBrandKitView extends AdStudioBrandKit {
  lastChangedOn: string | null;
  /** Where the logo is stored and its type; null without a logo. */
  logo: { path: string; mimeType: string } | null;
}

/** The project's brand kit, or an empty one when none was saved. */
export async function getAdStudioBrandKit(organizationId: string, projectId: string): Promise<AdStudioBrandKitView> {
  const kit = await AdStudioBrandKitModel.init(BRAND_KIT_ID, { organization_id: organizationId, project_id: projectId });
  if (!kit) return { ...EMPTY_AD_STUDIO_BRAND_KIT, lastChangedOn: null, logo: null };
  return {
    brandName: kit.brand_name,
    toneOfVoice: kit.tone_of_voice,
    avoidWords: kit.avoid_words ?? [],
    colors: kit.colors ?? [],
    lastChangedOn: kit.last_changed_on,
    logo: kit.logo_path && kit.logo_mime ? { path: kit.logo_path, mimeType: kit.logo_mime } : null,
  };
}

/**
 * Sets (or with null clears) the project's logo, already stored in the media bucket. Creates an
 * empty brand kit when the project has none yet. Audited.
 */
export async function setAdStudioBrandLogo(params: {
  organizationId: string;
  projectId: string;
  logo: { path: string; mimeType: string } | null;
  actorId: string;
  now?: Date;
}): Promise<AdStudioBrandKitView> {
  const project = await ProjectModel.init(params.projectId, { organization_id: params.organizationId });
  if (!project || project.organization_id !== params.organizationId) throw new ProjectNotFoundError();
  const existing = await AdStudioBrandKitModel.init(BRAND_KIT_ID, { organization_id: params.organizationId, project_id: params.projectId });
  const kit = existing ?? new AdStudioBrandKitModel();
  if (!existing) {
    kit.organization_id = params.organizationId;
    kit.project_id = params.projectId;
    kit.brand_name = '';
    kit.tone_of_voice = '';
    kit.avoid_words = [];
    kit.colors = [];
  }
  kit.logo_path = params.logo?.path ?? null;
  kit.logo_mime = params.logo?.mimeType ?? null;
  kit.changed_by = params.actorId;
  kit.last_changed_on = (params.now ?? new Date()).toISOString();
  kit.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
  await (existing ? kit.save() : kit.save(BRAND_KIT_ID));
  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      actorType: 'user',
      actorId: params.actorId,
      action: params.logo ? 'ad_studio.brand_logo_set' : 'ad_studio.brand_logo_removed',
      targetType: 'ad_studio_brand_kit',
      targetId: params.projectId,
      summary: params.logo ? 'Set the Ad Studio brand logo' : 'Removed the Ad Studio brand logo',
    });
  } catch {
    // Best-effort, like every other audit write.
  }
  return getAdStudioBrandKit(params.organizationId, params.projectId);
}

/** Saves the project's brand kit (validated) and records the change in the audit log. */
export async function setAdStudioBrandKit(params: {
  organizationId: string;
  projectId: string;
  kit: AdStudioBrandKit;
  actorId: string;
  now?: Date;
}): Promise<AdStudioBrandKitView> {
  const issues = validateAdStudioBrandKit(params.kit);
  if (issues.length) throw new AdStudioBrandKitInvalidError(issues);
  const project = await ProjectModel.init(params.projectId, { organization_id: params.organizationId });
  if (!project || project.organization_id !== params.organizationId) throw new ProjectNotFoundError();

  const before = await getAdStudioBrandKit(params.organizationId, params.projectId);
  const existing = await AdStudioBrandKitModel.init(BRAND_KIT_ID, { organization_id: params.organizationId, project_id: params.projectId });
  const kit = existing ?? new AdStudioBrandKitModel();
  kit.organization_id = params.organizationId;
  kit.project_id = params.projectId;
  kit.brand_name = params.kit.brandName;
  kit.tone_of_voice = params.kit.toneOfVoice;
  kit.avoid_words = params.kit.avoidWords;
  kit.colors = params.kit.colors;
  kit.changed_by = params.actorId;
  kit.last_changed_on = (params.now ?? new Date()).toISOString();
  kit.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
  await (existing ? kit.save() : kit.save(BRAND_KIT_ID));
  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      actorType: 'user',
      actorId: params.actorId,
      action: 'ad_studio.brand_kit_changed',
      targetType: 'ad_studio_brand_kit',
      targetId: params.projectId,
      summary: `Updated the Ad Studio brand kit${params.kit.brandName ? ` for ${params.kit.brandName}` : ''}`,
      before: { brand_name: before.brandName, tone_of_voice: before.toneOfVoice, avoid_words: before.avoidWords, colors: before.colors },
      after: { brand_name: params.kit.brandName, tone_of_voice: params.kit.toneOfVoice, avoid_words: params.kit.avoidWords, colors: params.kit.colors },
    });
  } catch {
    // Best-effort, like every other audit write.
  }
  return getAdStudioBrandKit(params.organizationId, params.projectId);
}
