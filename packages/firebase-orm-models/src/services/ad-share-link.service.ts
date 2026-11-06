import { createHash, randomBytes } from 'node:crypto';
import { AdShareLinkModel } from '../models/ad-share-link.model';
import { ProjectModel } from '../models/project.model';
import { ProjectNotFoundError } from './resource-library.service';
import { getAdStudioBrief } from './ad-studio.service';
import { recordAuditLogEntry } from './audit-log.service';

/** How long a new link stays open, in days; the person picks one, 30 when they do not. */
export const AD_SHARE_LINK_EXPIRY_DAYS = [7, 30, 90] as const;
export type AdShareLinkExpiryDays = (typeof AD_SHARE_LINK_EXPIRY_DAYS)[number];
export const AD_SHARE_LINK_DEFAULT_EXPIRY_DAYS: AdShareLinkExpiryDays = 30;
export const AD_SHARE_LINK_LABEL_MAX = 80;
/** A link shows the whole project or a short hand-picked list of ads. */
export const AD_SHARE_LINK_MAX_BRIEFS = 20;

const DAY_MS = 24 * 60 * 60 * 1000;
/** 32 random bytes as base64url, no padding. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type AdShareLinkStatus = 'active' | 'expired' | 'revoked';

export class AdShareLinkInvalidError extends Error {
  constructor(public readonly reasons: string[]) {
    super(`The share link is not valid: ${reasons.join(', ')}`);
    this.name = 'AdShareLinkInvalidError';
  }
}

export class AdShareLinkNotFoundError extends Error {
  constructor() {
    super('No share link with this id exists in this project.');
    this.name = 'AdShareLinkNotFoundError';
  }
}

/** A share link as the admin list shows it: never the token, which exists only at creation. */
export interface AdShareLinkView {
  id: string;
  briefIds: string[] | null;
  label: string;
  createdBy: string;
  createdOn: string;
  expiresOn: string;
  revokedOn: string | null;
  status: AdShareLinkStatus;
}

/** What a valid token opens: one project, and either all its ads or the listed ones. */
export interface ResolvedAdShareLink {
  id: string;
  organizationId: string;
  projectId: string;
  briefIds: string[] | null;
  expiresOn: string;
}

/** The stored id of a token: its SHA-256 hex digest. */
export function hashAdShareToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateAdShareToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Whether a string could be a token at all, so junk never reaches the database. */
export function isWellFormedAdShareToken(token: string): boolean {
  return TOKEN_PATTERN.test(token);
}

export function adShareLinkStatus(link: { expires_on: string; revoked_on?: string | null }, now: Date = new Date()): AdShareLinkStatus {
  if (link.revoked_on) return 'revoked';
  return new Date(link.expires_on).getTime() <= now.getTime() ? 'expired' : 'active';
}

export function adShareLinkExpiry(days: number, now: Date = new Date()): string {
  return new Date(now.getTime() + days * DAY_MS).toISOString();
}

export function validateAdShareLinkInput(input: { briefIds: readonly string[] | null; label: string; expiresInDays: number }): string[] {
  const reasons: string[] = [];
  if (!(AD_SHARE_LINK_EXPIRY_DAYS as readonly number[]).includes(input.expiresInDays)) reasons.push('invalid_expiry');
  if (input.label.length > AD_SHARE_LINK_LABEL_MAX) reasons.push('label_too_long');
  if (input.briefIds !== null) {
    if (input.briefIds.length === 0) reasons.push('no_briefs');
    if (input.briefIds.length > AD_SHARE_LINK_MAX_BRIEFS) reasons.push('too_many_briefs');
    if (input.briefIds.some((id) => typeof id !== 'string' || !id || id.includes('/'))) reasons.push('invalid_brief_id');
  }
  return reasons;
}

export function toAdShareLinkView(link: AdShareLinkModel, now: Date = new Date()): AdShareLinkView {
  return {
    id: link.id,
    briefIds: link.brief_ids ?? null,
    label: link.label,
    createdBy: link.created_by,
    createdOn: link.created_on,
    expiresOn: link.expires_on,
    revokedOn: link.revoked_on ?? null,
    status: adShareLinkStatus(link, now),
  };
}

async function requireProject(organizationId: string, projectId: string): Promise<void> {
  const project = await ProjectModel.init(projectId, { organization_id: organizationId });
  if (!project || project.organization_id !== organizationId) throw new ProjectNotFoundError();
}

async function audit(params: { organizationId: string; projectId: string; actorId: string; action: string; linkId: string; summary: string }): Promise<void> {
  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      actorType: 'user',
      actorId: params.actorId,
      action: params.action,
      targetType: 'ad_share_link',
      targetId: params.linkId,
      summary: params.summary,
    });
  } catch {
    // Best-effort, like every other audit write.
  }
}

/**
 * Makes a share link for a project's ads. Returns the token once; only its hash is stored. Every
 * listed brief must belong to the project. Audited.
 */
export async function createAdShareLink(params: {
  organizationId: string;
  projectId: string;
  briefIds: string[] | null;
  label?: string;
  expiresInDays?: number;
  actorId: string;
  now?: Date;
}): Promise<{ token: string; link: AdShareLinkView }> {
  const label = (params.label ?? '').trim();
  const expiresInDays = params.expiresInDays ?? AD_SHARE_LINK_DEFAULT_EXPIRY_DAYS;
  const briefIds = params.briefIds === null ? null : [...new Set(params.briefIds)];
  const reasons = validateAdShareLinkInput({ briefIds, label, expiresInDays });
  if (reasons.length) throw new AdShareLinkInvalidError(reasons);
  await requireProject(params.organizationId, params.projectId);
  if (briefIds) await Promise.all(briefIds.map((briefId) => getAdStudioBrief(params.organizationId, params.projectId, briefId)));

  const now = params.now ?? new Date();
  const token = generateAdShareToken();
  const id = hashAdShareToken(token);
  const link = new AdShareLinkModel();
  link.organization_id = params.organizationId;
  link.project_id = params.projectId;
  link.brief_ids = briefIds;
  link.label = label;
  link.created_by = params.actorId;
  link.created_on = now.toISOString();
  link.expires_on = adShareLinkExpiry(expiresInDays, now);
  link.revoked_on = null;
  link.revoked_by = null;
  await link.save(id);
  await audit({
    organizationId: params.organizationId,
    projectId: params.projectId,
    actorId: params.actorId,
    action: 'ad_studio.share_link_created',
    linkId: id,
    summary: `Shared ${briefIds ? `${briefIds.length} ad(s)` : 'all ads'} for ${expiresInDays} days${label ? ` with ${label}` : ''}`,
  });
  return { token, link: toAdShareLinkView(link, now) };
}

/** The project's share links, newest first, without tokens. */
export async function listAdShareLinks(organizationId: string, projectId: string, now: Date = new Date()): Promise<AdShareLinkView[]> {
  await requireProject(organizationId, projectId);
  const links = await AdShareLinkModel.query().where('project_id', '==', projectId).get();
  return links
    .filter((link) => link.organization_id === organizationId)
    .sort((a, b) => b.created_on.localeCompare(a.created_on))
    .map((link) => toAdShareLinkView(link, now));
}

/** Closes a link at once. Idempotent: revoking a revoked link keeps its first revocation. Audited. */
export async function revokeAdShareLink(params: { organizationId: string; projectId: string; linkId: string; actorId: string; now?: Date }): Promise<AdShareLinkView> {
  const now = params.now ?? new Date();
  const link = /^[0-9a-f]{64}$/.test(params.linkId) ? await AdShareLinkModel.init(params.linkId) : null;
  if (!link || link.organization_id !== params.organizationId || link.project_id !== params.projectId) throw new AdShareLinkNotFoundError();
  if (!link.revoked_on) {
    link.revoked_on = now.toISOString();
    link.revoked_by = params.actorId;
    await link.save();
    await audit({
      organizationId: params.organizationId,
      projectId: params.projectId,
      actorId: params.actorId,
      action: 'ad_studio.share_link_revoked',
      linkId: link.id,
      summary: `Revoked an ad share link${link.label ? ` for ${link.label}` : ''}`,
    });
  }
  return toAdShareLinkView(link, now);
}

/** What a token opens, or null for a malformed, unknown, revoked or expired token alike. */
export async function resolveAdShareToken(token: string, now: Date = new Date()): Promise<ResolvedAdShareLink | null> {
  if (!isWellFormedAdShareToken(token)) return null;
  const link = await AdShareLinkModel.init(hashAdShareToken(token));
  if (!link || adShareLinkStatus(link, now) !== 'active') return null;
  return {
    id: link.id,
    organizationId: link.organization_id,
    projectId: link.project_id,
    briefIds: link.brief_ids ?? null,
    expiresOn: link.expires_on,
  };
}
