import { buildSessionReplayLink } from '@growthos/shared';
import { ProjectModel } from '../models/project.model';
import { ProjectNotFoundError } from './resource-library.service';
import { recordAuditLogEntry } from './audit-log.service';

export class InvalidSessionReplayUrlTemplateError extends Error {
  constructor() {
    super('Session replay URL template must be an http(s) URL.');
    this.name = 'InvalidSessionReplayUrlTemplateError';
  }
}

export interface SetProjectSessionReplayUrlTemplateParams {
  organizationId: string;
  projectId: string;
  /** The template, or an empty string / undefined to clear it. */
  template?: string;
  setByUserId: string;
}

/**
 * Sets (or clears) the project's session-replay deep-link template — the
 * admin surface behind the landing-page board's "watch the recordings for
 * this page" links.
 *
 * Validation goes through the *same* `buildSessionReplayLink` the renderer
 * uses, with a throwaway sample page, rather than a second hand-rolled URL
 * check: a template that this rejects is exactly a template that would have
 * rendered no link, so an admin can never save something that silently does
 * nothing (or, worse, a `javascript:` href — see that function's own note on
 * why the scheme check is the security boundary here).
 */
export async function setProjectSessionReplayUrlTemplate(
  params: SetProjectSessionReplayUrlTemplateParams,
): Promise<ProjectModel> {
  const project = await ProjectModel.init(params.projectId, { organization_id: params.organizationId });
  if (!project || project.organization_id !== params.organizationId) {
    throw new ProjectNotFoundError();
  }

  const trimmed = params.template?.trim() ?? '';
  if (trimmed && !buildSessionReplayLink(trimmed, 'https://example.com/')) {
    throw new InvalidSessionReplayUrlTemplateError();
  }

  // Assigning `trimmed` (never `undefined`) rather than `trimmed || undefined`: the ORM's
  // `getDocumentData()` omits any field whose in-memory value is `undefined` from the
  // `updateDoc()` call entirely, so clearing the template that way would leave the old value
  // stored in Firestore forever while the API response lied and said it was cleared.
  project.session_replay_url_template = trimmed;
  project.setPathParams({ organization_id: params.organizationId });
  await project.save();

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      actorType: 'user',
      actorId: params.setByUserId,
      action: 'project.session_replay_template.set',
      targetType: 'project',
      targetId: params.projectId,
      summary: trimmed ? 'Set the session replay URL template' : 'Cleared the session replay URL template',
    });
  } catch {
    // Best-effort — audit logging must never turn a successful save into a failure for the caller.
  }

  return project;
}

export class InvalidProjectNameError extends Error {
  constructor() {
    super('Project name is required.');
    this.name = 'InvalidProjectNameError';
  }
}

export class InvalidProjectCurrencyError extends Error {
  constructor() {
    super('Currency must be a three-letter ISO-4217 code, e.g. ILS or USD.');
    this.name = 'InvalidProjectCurrencyError';
  }
}

export class InvalidProjectTimezoneError extends Error {
  constructor() {
    super('Timezone must be a valid IANA time zone name, e.g. Asia/Jerusalem.');
    this.name = 'InvalidProjectTimezoneError';
  }
}

const ISO_4217_PATTERN = /^[A-Z]{3}$/;

/** `Intl` is the one IANA zone catalog Node ships with — no dependency, and it's exactly what the runtime would use to format in that zone. */
function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export interface UpdateProjectDetailsParams {
  organizationId: string;
  projectId: string;
  name: string;
  /** Omit (or pass an empty string) to clear the vertical. */
  vertical?: string;
  /** ISO-4217 code; omit to leave unchanged, pass an empty string to clear. */
  currency?: string;
  /** IANA time zone; omit to leave unchanged, pass an empty string to clear. */
  timezone?: string;
  actorUserId: string;
}

/**
 * Corrects a project's own `name`/`vertical` — the same "create + list
 * only, no way to fix a typo'd definition" gap KAN-100/117/119/120/121
 * already closed for their own sibling registries, except this is the
 * project record itself: until now a project's name (set once at
 * `createProject` time) could never be corrected, only left as-is forever.
 * `organization_id` stays immutable — moving a project to a different org
 * isn't a correction, it's a different tenancy structure entirely, the same
 * "structural fact, not a fixable typo" posture `updateFieldMapping` applies
 * to `kind`/`environmentId`. `session_replay_url_template` is edited via its
 * own dedicated {@link setProjectSessionReplayUrlTemplate}, not here.
 *
 * Gated at the route layer on `project.manage`, the same per-project
 * admin-config permission the session-replay and cost-guardrail routes use.
 */
export async function updateProjectDetails(params: UpdateProjectDetailsParams): Promise<ProjectModel> {
  const project = await ProjectModel.init(params.projectId, { organization_id: params.organizationId });
  if (!project || project.organization_id !== params.organizationId) {
    throw new ProjectNotFoundError();
  }

  const trimmedName = params.name.trim();
  if (!trimmedName) {
    throw new InvalidProjectNameError();
  }

  const currency = params.currency?.trim().toUpperCase();
  if (currency !== undefined && currency !== '' && !ISO_4217_PATTERN.test(currency)) {
    throw new InvalidProjectCurrencyError();
  }
  const timezone = params.timezone?.trim();
  if (timezone !== undefined && timezone !== '' && !isValidTimezone(timezone)) {
    throw new InvalidProjectTimezoneError();
  }

  const snapshot = (): Record<string, string> => ({
    name: project.name,
    vertical: project.vertical ?? '',
    currency: project.currency ?? '',
    timezone: project.timezone ?? '',
  });
  const before = snapshot();

  project.name = trimmedName;
  project.vertical = params.vertical?.trim() ?? '';
  if (currency !== undefined) {
    project.currency = currency;
  }
  if (timezone !== undefined) {
    project.timezone = timezone;
  }
  project.setPathParams({ organization_id: params.organizationId });
  await project.save();

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      actorType: 'user',
      actorId: params.actorUserId,
      action: 'project.update',
      targetType: 'project',
      targetId: params.projectId,
      summary: `Updated project "${project.name}"`,
      before,
      after: snapshot(),
    });
  } catch {
    // Best-effort — audit logging must never turn a successful save into a failure for the caller.
  }

  return project;
}

/**
 * Retires a project (EasySign audit J-06: a duplicate project had no way
 * out of the org except a full delete) — stamps `archived_at`, which hides
 * it from `listOrgProjects` and everything built on it; nothing under the
 * project is touched. Idempotent. See `ProjectModel.archived_at`.
 */
export async function archiveProject(organizationId: string, projectId: string, actorUserId: string): Promise<ProjectModel> {
  return setProjectArchived(organizationId, projectId, actorUserId, true);
}

/** Reverses {@link archiveProject}. */
export async function unarchiveProject(organizationId: string, projectId: string, actorUserId: string): Promise<ProjectModel> {
  return setProjectArchived(organizationId, projectId, actorUserId, false);
}

async function setProjectArchived(organizationId: string, projectId: string, actorUserId: string, archived: boolean): Promise<ProjectModel> {
  const project = await ProjectModel.init(projectId, { organization_id: organizationId });
  if (!project || project.organization_id !== organizationId) {
    throw new ProjectNotFoundError();
  }
  const wasArchived = project.archived_at !== undefined;
  if (wasArchived === archived) {
    return project;
  }

  // `@arbel/firebase-orm` drops `undefined` fields from the update it sends
  // (see `GoalModel.target_value`'s doc comment), so clearing the stamp has
  // to go through an explicit `null`; readers treat both as "not archived".
  project.archived_at = (archived ? new Date().toISOString() : null) as string | undefined;
  project.setPathParams({ organization_id: organizationId });
  await project.save();

  try {
    await recordAuditLogEntry({
      organizationId,
      projectId,
      actorType: 'user',
      actorId: actorUserId,
      action: archived ? 'project.archive' : 'project.unarchive',
      targetType: 'project',
      targetId: projectId,
      summary: `${archived ? 'Archived' : 'Unarchived'} project "${project.name}"`,
      before: { archived: wasArchived },
      after: { archived },
    });
  } catch {
    // Best-effort — see updateProjectDetails.
  }

  return project;
}
