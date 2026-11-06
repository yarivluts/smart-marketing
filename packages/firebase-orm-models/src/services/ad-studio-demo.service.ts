import { randomUUID } from 'node:crypto';
import {
  demoAccessFieldIssues,
  type AdStudioDemoAccessInput,
  type AdStudioDemoAccessView,
  type AdStudioDemoRecordingView,
  type AdStudioDemoSegment,
} from '@growthos/shared';
import { AdStudioDemoAccessModel, AdStudioDemoRecordingModel, type AdStudioDemoSegmentRecord } from '../models/ad-studio-demo.model';
import { ProjectModel } from '../models/project.model';
import { decryptSecret, encryptSecret, type KmsProvider } from '../vault';
import { ProjectNotFoundError } from './resource-library.service';
import { assertPublicHttpsUrl, InvalidBackfillEndpointError, type HostResolver } from './backfill.service';
import { recordAuditLogEntry } from './audit-log.service';

/**
 * The trial account the Ad Studio records a product walkthrough with, and the recordings it made.
 * The username and password are sealed with the vault under a tenant id bound to the organization
 * and the project, so they cannot be opened under any other project's id. Views never carry the
 * password; audit entries carry neither the username nor the password.
 */

const DEMO_ACCESS_ID = 'demo';

/** The fields that are missing or malformed, by name, for the form to point at. */
export class AdStudioDemoAccessInvalidError extends Error {
  constructor(public readonly fields: string[]) {
    super(`The trial access is not valid: ${fields.join(', ')}`);
    this.name = 'AdStudioDemoAccessInvalidError';
  }
}

export class AdStudioDemoRecordingNotFoundError extends Error {
  constructor() {
    super('Ad Studio walkthrough recording not found.');
    this.name = 'AdStudioDemoRecordingNotFoundError';
  }
}

/** The vault binding of a project's demo access. */
export function demoAccessTenantId(organizationId: string, projectId: string): string {
  return `${organizationId}:${projectId}:demo-access`;
}

function pathParams(organizationId: string, projectId: string) {
  return { organization_id: organizationId, project_id: projectId };
}

function nowIso(now?: Date): string {
  return (now ?? new Date()).toISOString();
}

async function audit(params: { organizationId: string; projectId: string; actorId: string; action: string; summary: string; after?: Record<string, unknown> }): Promise<void> {
  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      actorType: 'user',
      actorId: params.actorId,
      action: params.action,
      targetType: 'ad_studio_demo_access',
      targetId: params.projectId,
      summary: params.summary,
      ...(params.after ? { after: params.after } : {}),
    });
  } catch {
    // Best-effort, like every other audit write.
  }
}

async function loadAccess(organizationId: string, projectId: string): Promise<AdStudioDemoAccessModel | null> {
  const access = await AdStudioDemoAccessModel.init(DEMO_ACCESS_ID, pathParams(organizationId, projectId));
  return access && access.project_id === projectId ? access : null;
}

/**
 * The project's demo access for a page: the address, the username (decrypted when `kms` is given
 * and can open it, else null), whether a password is stored, the notes. Never the password.
 */
export async function getAdStudioDemoAccess(organizationId: string, projectId: string, kms: KmsProvider | null): Promise<AdStudioDemoAccessView | null> {
  const access = await loadAccess(organizationId, projectId);
  if (!access) return null;
  let username: string | null = null;
  if (kms) {
    try {
      username = await decryptSecret(access.encrypted_username, demoAccessTenantId(organizationId, projectId), kms);
    } catch {
      username = null;
    }
  }
  return {
    loginUrl: access.login_url,
    username,
    hasPassword: Boolean(access.encrypted_password?.ciphertext),
    notes: access.notes ?? '',
    lastChangedOn: access.last_changed_on ?? null,
  };
}

/** Everything the recorder needs, password included - server-only, in memory, for one run. Null without access. */
export async function revealAdStudioDemoAccess(
  organizationId: string,
  projectId: string,
  kms: KmsProvider,
): Promise<{ loginUrl: string; username: string; password: string; notes: string } | null> {
  const access = await loadAccess(organizationId, projectId);
  if (!access) return null;
  const tenantId = demoAccessTenantId(organizationId, projectId);
  const [username, password] = await Promise.all([decryptSecret(access.encrypted_username, tenantId, kms), decryptSecret(access.encrypted_password, tenantId, kms)]);
  return { loginUrl: access.login_url, username, password, notes: access.notes ?? '' };
}

/**
 * Saves the demo access. The address must be public https (the SSRF guard); an empty password keeps
 * the stored one. Audited without the username or the password.
 */
export async function setAdStudioDemoAccess(params: {
  organizationId: string;
  projectId: string;
  input: AdStudioDemoAccessInput;
  actorId: string;
  kms: KmsProvider;
  resolver?: HostResolver;
  now?: Date;
}): Promise<AdStudioDemoAccessView> {
  const project = await ProjectModel.init(params.projectId, { organization_id: params.organizationId });
  if (!project || project.organization_id !== params.organizationId) throw new ProjectNotFoundError();
  const existing = await loadAccess(params.organizationId, params.projectId);
  const issues = demoAccessFieldIssues(params.input, Boolean(existing?.encrypted_password?.ciphertext));
  let loginUrl = params.input.loginUrl;
  if (!issues.includes('login_url')) {
    try {
      loginUrl = (await assertPublicHttpsUrl(loginUrl, params.resolver)).toString();
    } catch (error) {
      if (!(error instanceof InvalidBackfillEndpointError)) throw error;
      issues.unshift('login_url');
    }
  }
  if (issues.length) throw new AdStudioDemoAccessInvalidError(issues);

  const tenantId = demoAccessTenantId(params.organizationId, params.projectId);
  const access = existing ?? new AdStudioDemoAccessModel();
  access.organization_id = params.organizationId;
  access.project_id = params.projectId;
  access.login_url = loginUrl;
  access.encrypted_username = await encryptSecret(params.input.username, tenantId, params.kms);
  if (params.input.password) access.encrypted_password = await encryptSecret(params.input.password, tenantId, params.kms);
  access.notes = params.input.notes;
  access.changed_by = params.actorId;
  access.last_changed_on = nowIso(params.now);
  access.setPathParams(pathParams(params.organizationId, params.projectId));
  await (existing ? access.save() : access.save(DEMO_ACCESS_ID));
  await audit({
    organizationId: params.organizationId,
    projectId: params.projectId,
    actorId: params.actorId,
    action: 'ad_studio.demo_access_set',
    summary: `Set the trial access for product walkthroughs (${new URL(loginUrl).host})`,
    after: { login_host: new URL(loginUrl).host, password_changed: Boolean(params.input.password), has_notes: Boolean(params.input.notes) },
  });
  return (await getAdStudioDemoAccess(params.organizationId, params.projectId, params.kms)) as AdStudioDemoAccessView;
}

/** Removes the demo access (recordings already made are kept). Audited. */
export async function clearAdStudioDemoAccess(params: { organizationId: string; projectId: string; actorId: string }): Promise<void> {
  const existing = await loadAccess(params.organizationId, params.projectId);
  if (!existing) return;
  await existing.remove();
  await audit({ organizationId: params.organizationId, projectId: params.projectId, actorId: params.actorId, action: 'ad_studio.demo_access_cleared', summary: 'Removed the trial access for product walkthroughs' });
}

export function toAdStudioDemoSegment(segment: AdStudioDemoSegmentRecord): AdStudioDemoSegment {
  return { id: segment.id, startSeconds: segment.start_seconds, endSeconds: segment.end_seconds, title: segment.title, description: segment.description, selected: segment.selected === true };
}

export function toAdStudioDemoRecordingView(recording: AdStudioDemoRecordingModel): AdStudioDemoRecordingView {
  return {
    id: recording.id,
    status: recording.status,
    failureCode: recording.failure_code ?? null,
    durationSeconds: recording.duration_seconds ?? null,
    segments: (recording.segments ?? []).map(toAdStudioDemoSegment),
    site: recording.site ?? null,
    requestedOn: recording.requested_on,
    completedOn: recording.completed_on ?? null,
  };
}

/** Every recording of the project, newest first. */
export async function listAdStudioDemoRecordings(organizationId: string, projectId: string): Promise<AdStudioDemoRecordingModel[]> {
  const rows = await AdStudioDemoRecordingModel.initPath(pathParams(organizationId, projectId)).query().get();
  return rows.filter((row) => row.project_id === projectId).sort((a, b) => b.requested_on.localeCompare(a.requested_on));
}

export async function getAdStudioDemoRecording(organizationId: string, projectId: string, recordingId: string): Promise<AdStudioDemoRecordingModel> {
  const recording = await AdStudioDemoRecordingModel.init(recordingId, pathParams(organizationId, projectId));
  if (!recording || recording.project_id !== projectId || recording.organization_id !== organizationId) throw new AdStudioDemoRecordingNotFoundError();
  return recording;
}

/** The newest ready recording, or null - what video ads take their moments from. */
export async function getLatestReadyAdStudioDemoRecording(organizationId: string, projectId: string): Promise<AdStudioDemoRecordingModel | null> {
  return (await listAdStudioDemoRecordings(organizationId, projectId)).find((row) => row.status === 'ready' && row.gcs_path) ?? null;
}

export async function createAdStudioDemoRecording(params: { organizationId: string; projectId: string; site: string | null; requestedBy: string; now?: Date }): Promise<AdStudioDemoRecordingModel> {
  const recording = new AdStudioDemoRecordingModel();
  recording.organization_id = params.organizationId;
  recording.project_id = params.projectId;
  recording.status = 'recording';
  recording.site = params.site;
  recording.gcs_path = null;
  recording.duration_seconds = null;
  recording.segments = [];
  recording.failure_code = null;
  recording.requested_by = params.requestedBy;
  recording.requested_on = nowIso(params.now);
  recording.completed_on = null;
  recording.setPathParams(pathParams(params.organizationId, params.projectId));
  await recording.save();
  return recording;
}

export async function markAdStudioDemoRecordingReady(
  recording: Pick<AdStudioDemoRecordingModel, 'id' | 'organization_id' | 'project_id'>,
  params: { gcsPath: string; durationSeconds: number; segments: AdStudioDemoSegment[]; now?: Date },
): Promise<AdStudioDemoRecordingModel> {
  const fresh = await getAdStudioDemoRecording(recording.organization_id, recording.project_id, recording.id);
  if (fresh.status !== 'recording') return fresh;
  fresh.status = 'ready';
  fresh.gcs_path = params.gcsPath;
  fresh.duration_seconds = params.durationSeconds;
  fresh.segments = params.segments.map((segment) => ({
    id: segment.id,
    start_seconds: segment.startSeconds,
    end_seconds: segment.endSeconds,
    title: segment.title,
    description: segment.description,
    selected: segment.selected,
  }));
  fresh.completed_on = nowIso(params.now);
  await fresh.save();
  return fresh;
}

export async function markAdStudioDemoRecordingFailed(
  recording: Pick<AdStudioDemoRecordingModel, 'id' | 'organization_id' | 'project_id'>,
  code: string,
  now?: Date,
): Promise<AdStudioDemoRecordingModel> {
  const fresh = await getAdStudioDemoRecording(recording.organization_id, recording.project_id, recording.id);
  if (fresh.status !== 'recording') return fresh;
  fresh.status = 'failed';
  fresh.failure_code = code;
  fresh.completed_on = nowIso(now);
  await fresh.save();
  return fresh;
}

/** A segment id that is not part of the recording. */
export class AdStudioDemoSegmentsInvalidError extends Error {
  constructor(public readonly unknownIds: string[]) {
    super(`Unknown walkthrough moments: ${unknownIds.join(', ')}`);
    this.name = 'AdStudioDemoSegmentsInvalidError';
  }
}

/** Sets which moments of a ready recording video ads use (exactly the ids given). */
export async function selectAdStudioDemoSegments(params: { organizationId: string; projectId: string; recordingId: string; segmentIds: readonly string[] }): Promise<AdStudioDemoRecordingModel> {
  const recording = await getAdStudioDemoRecording(params.organizationId, params.projectId, params.recordingId);
  const known = new Set((recording.segments ?? []).map((segment) => segment.id));
  const unknown = params.segmentIds.filter((id) => !known.has(id));
  if (unknown.length) throw new AdStudioDemoSegmentsInvalidError(unknown);
  const chosen = new Set(params.segmentIds);
  recording.segments = (recording.segments ?? []).map((segment) => ({ ...segment, selected: chosen.has(segment.id) }));
  await recording.save();
  return recording;
}

/** A fresh id for a recorded moment. */
export function newDemoSegmentId(): string {
  return randomUUID().slice(0, 8);
}
