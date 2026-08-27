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

export interface UpdateProjectDetailsParams {
  organizationId: string;
  projectId: string;
  name: string;
  /** Omit (or pass an empty string) to clear the vertical. */
  vertical?: string;
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

  const before = { name: project.name, vertical: project.vertical ?? '' };

  project.name = trimmedName;
  project.vertical = params.vertical?.trim() ?? '';
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
      after: { name: project.name, vertical: project.vertical ?? '' },
    });
  } catch {
    // Best-effort — audit logging must never turn a successful save into a failure for the caller.
  }

  return project;
}
