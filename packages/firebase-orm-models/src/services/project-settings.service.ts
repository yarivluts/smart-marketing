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

  project.session_replay_url_template = trimmed || undefined;
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
