import {
  AD_SHARE_MAX_FEEDBACK_PER_LINK,
  isAdShareFeedbackStatus,
  validateClientFeedbackInput,
  type AdShareFeedbackItem,
  type AdShareFeedbackStatus,
  type AdShareProposalChanges,
  type AdShareProposalKind,
  type AdShareProposalStatus,
  type AdShareProposalView,
  type AdShareTargetKind,
  type AdShareVerdict,
} from '@growthos/shared';
import { AdShareFeedbackModel, AdShareProposalModel } from '../models/ad-share-feedback.model';
import { ProjectModel } from '../models/project.model';
import { AdStudioBriefNotFoundError, getAdStudioBrief } from './ad-studio.service';
import { recordAuditLogEntry } from './audit-log.service';
import { ProjectNotFoundError } from './resource-library.service';

export class AdShareFeedbackInvalidError extends Error {
  constructor(public readonly reasons: string[]) {
    super(`Invalid client feedback: ${reasons.join(', ')}`);
    this.name = 'AdShareFeedbackInvalidError';
  }
}

export class AdShareFeedbackLimitError extends Error {
  constructor() {
    super('This share link has reached its feedback limit.');
    this.name = 'AdShareFeedbackLimitError';
  }
}

export class AdShareProposalNotFoundError extends Error {
  constructor() {
    super('No AI proposal with this id exists in this project.');
    this.name = 'AdShareProposalNotFoundError';
  }
}

function pathParams(organizationId: string, projectId: string) {
  return { organization_id: organizationId, project_id: projectId };
}

async function requireProject(organizationId: string, projectId: string): Promise<void> {
  const project = await ProjectModel.init(projectId, { organization_id: organizationId });
  if (!project || project.organization_id !== organizationId) throw new ProjectNotFoundError();
}

export function toAdShareFeedbackItem(model: AdShareFeedbackModel): AdShareFeedbackItem {
  return {
    id: model.id,
    shareLinkId: model.share_link_id,
    clientLabel: model.client_label,
    authorName: model.author_name,
    targetKind: model.target_kind,
    briefId: model.brief_id ?? null,
    briefName: model.brief_name ?? null,
    creativeRef: model.creative_ref ?? null,
    campaignId: model.campaign_id ?? null,
    campaignLabel: model.campaign_label ?? null,
    verdict: model.verdict,
    comment: model.comment,
    status: model.status,
    createdOn: model.created_on,
    resolvedOn: model.resolved_on ?? null,
  };
}

export function toAdShareProposalView(model: AdShareProposalModel): AdShareProposalView {
  return {
    id: model.id,
    feedbackIds: [...(model.feedback_ids ?? [])],
    clientQuote: model.client_quote,
    kind: model.kind,
    briefId: model.brief_id ?? null,
    briefName: model.brief_name ?? null,
    title: model.title,
    summary: model.summary,
    rationale: model.rationale,
    changes: model.changes ?? {},
    status: model.status,
    appliedBriefId: model.applied_brief_id ?? null,
    runId: model.run_id ?? null,
    failureReason: model.failure_reason ?? null,
    createdOn: model.created_on,
    decidedOn: model.decided_on ?? null,
  };
}

/** Records a client comment, verdict, or change request on the project. */
export async function createAdShareFeedback(params: {
  organizationId: string;
  projectId: string;
  shareLinkId: string;
  clientLabel?: string;
  authorName?: string | null;
  targetKind: AdShareTargetKind;
  briefId?: string | null;
  creativeRef?: string | null;
  campaignId?: string | null;
  campaignLabel?: string | null;
  verdict: AdShareVerdict;
  comment?: string | null;
  now?: Date;
}): Promise<AdShareFeedbackItem> {
  const issues = validateClientFeedbackInput(params);
  if (issues.length) throw new AdShareFeedbackInvalidError(issues);

  await requireProject(params.organizationId, params.projectId);
  let briefName: string | null = null;
  if (params.briefId) {
    const brief = await getAdStudioBrief(params.organizationId, params.projectId, params.briefId);
    briefName = brief.name;
  }

  if (params.shareLinkId !== 'manual') {
    const existingForProject = await AdShareFeedbackModel.initPath(
      pathParams(params.organizationId, params.projectId),
    )
      .query()
      .get();
    const linkCount = existingForProject.filter((entry) => entry.share_link_id === params.shareLinkId).length;
    if (linkCount >= AD_SHARE_MAX_FEEDBACK_PER_LINK) {
      throw new AdShareFeedbackLimitError();
    }
  }

  const nowIso = (params.now ?? new Date()).toISOString();
  const row = new AdShareFeedbackModel();
  row.organization_id = params.organizationId;
  row.project_id = params.projectId;
  row.share_link_id = params.shareLinkId;
  row.client_label = (params.clientLabel ?? '').trim();
  row.author_name = (params.authorName ?? '').trim();
  row.target_kind = params.targetKind;
  row.brief_id = params.briefId ?? null;
  row.brief_name = briefName;
  row.creative_ref = params.creativeRef?.trim() || null;
  row.campaign_id = params.campaignId?.trim() || null;
  row.campaign_label = params.campaignLabel?.trim() || null;
  row.verdict = params.verdict;
  row.comment = (params.comment ?? '').trim();
  row.status = 'open';
  row.created_on = nowIso;
  row.resolved_on = null;
  row.setPathParams(pathParams(params.organizationId, params.projectId));
  await row.save();

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      actorType: 'user',
      actorId: params.shareLinkId === 'manual' ? 'manager' : `client:${params.shareLinkId.slice(0, 12)}`,
      action: 'ad_studio.client_feedback_created',
      targetType: 'ad_share_feedback',
      targetId: row.id,
      summary: `Client ${params.verdict} feedback added${briefName ? ` on ${briefName}` : ''}`,
    });
  } catch {
    // Best-effort audit write.
  }

  return toAdShareFeedbackItem(row);
}

/** Lists all client feedback items for a project, newest first. */
export async function listAdShareFeedbackForProject(
  organizationId: string,
  projectId: string,
): Promise<AdShareFeedbackItem[]> {
  await requireProject(organizationId, projectId);
  const rows = await AdShareFeedbackModel.initPath(pathParams(organizationId, projectId)).query().get();
  return rows.sort((a, b) => b.created_on.localeCompare(a.created_on)).map(toAdShareFeedbackItem);
}

/** Lists feedback submitted under one specific share link (for display on the public client view), oldest first. */
export async function listAdShareFeedbackForLink(
  organizationId: string,
  projectId: string,
  shareLinkId: string,
): Promise<AdShareFeedbackItem[]> {
  const rows = await AdShareFeedbackModel.initPath(pathParams(organizationId, projectId)).query().get();
  return rows
    .filter((entry) => entry.share_link_id === shareLinkId)
    .sort((a, b) => a.created_on.localeCompare(b.created_on))
    .map(toAdShareFeedbackItem);
}

/** Updates lifecycle status (`open` | `proposed` | `applied` | `declined` | `sent_to_client`) for feedback items. */
export async function updateAdShareFeedbackStatus(params: {
  organizationId: string;
  projectId: string;
  feedbackIds: readonly string[];
  status: AdShareFeedbackStatus;
  now?: Date;
}): Promise<AdShareFeedbackItem[]> {
  if (!isAdShareFeedbackStatus(params.status)) {
    throw new AdShareFeedbackInvalidError(['invalid_status']);
  }
  const uniqueIds = [...new Set(params.feedbackIds.filter((id) => typeof id === 'string' && id.length > 0))];
  if (uniqueIds.length === 0) return [];
  const rows = await AdShareFeedbackModel.initPath(pathParams(params.organizationId, params.projectId)).query().get();
  const wanted = new Set(uniqueIds);
  const resolvedOn =
    params.status === 'applied' || params.status === 'declined' || params.status === 'sent_to_client'
      ? (params.now ?? new Date()).toISOString()
      : null;

  const updated: AdShareFeedbackItem[] = [];
  for (const row of rows) {
    if (!wanted.has(row.id)) continue;
    row.status = params.status;
    if (resolvedOn) row.resolved_on = resolvedOn;
    await row.save();
    updated.push(toAdShareFeedbackItem(row));
  }
  return updated;
}

export interface CreateAdShareProposalInput {
  feedbackIds: string[];
  clientQuote: string;
  kind: AdShareProposalKind;
  briefId: string | null;
  briefName: string | null;
  title: string;
  summary: string;
  rationale: string;
  changes: AdShareProposalChanges;
}

/** Stores newly synthesized AI change proposals (`status: 'pending'`) and marks referenced open feedback as `'proposed'`. */
export async function saveAdShareProposals(params: {
  organizationId: string;
  projectId: string;
  proposals: readonly CreateAdShareProposalInput[];
  actorId: string;
  now?: Date;
}): Promise<AdShareProposalView[]> {
  await requireProject(params.organizationId, params.projectId);
  const nowIso = (params.now ?? new Date()).toISOString();
  const saved: AdShareProposalView[] = [];
  const touchedFeedbackIds: string[] = [];

  for (const entry of params.proposals) {
    if (entry.briefId) {
      try {
        await getAdStudioBrief(params.organizationId, params.projectId, entry.briefId);
      } catch (err) {
        if (err instanceof AdStudioBriefNotFoundError) {
          throw new AdShareFeedbackInvalidError(['brief_not_found']);
        }
        throw err;
      }
    }
    const model = new AdShareProposalModel();
    model.organization_id = params.organizationId;
    model.project_id = params.projectId;
    model.feedback_ids = [...new Set(entry.feedbackIds)];
    model.client_quote = entry.clientQuote.trim().slice(0, 500);
    model.kind = entry.kind;
    model.brief_id = entry.briefId;
    model.brief_name = entry.briefName;
    model.title = entry.title.trim().slice(0, 140);
    model.summary = entry.summary.trim().slice(0, 600);
    model.rationale = entry.rationale.trim().slice(0, 400);
    model.changes = entry.changes;
    model.status = 'pending';
    model.applied_brief_id = null;
    model.run_id = null;
    model.failure_reason = null;
    model.created_by = params.actorId;
    model.created_on = nowIso;
    model.decided_by = null;
    model.decided_on = null;
    model.setPathParams(pathParams(params.organizationId, params.projectId));
    await model.save();
    saved.push(toAdShareProposalView(model));
    touchedFeedbackIds.push(...model.feedback_ids);
  }

  if (touchedFeedbackIds.length > 0) {
    const allFeedback = await AdShareFeedbackModel.initPath(
      pathParams(params.organizationId, params.projectId),
    )
      .query()
      .get();
    const touchedSet = new Set(touchedFeedbackIds);
    for (const fb of allFeedback) {
      if (touchedSet.has(fb.id) && fb.status === 'open') {
        fb.status = 'proposed';
        await fb.save();
      }
    }
  }

  return saved;
}

/** Lists all AI client-request proposals for the project, newest first. */
export async function listAdShareProposals(
  organizationId: string,
  projectId: string,
): Promise<AdShareProposalView[]> {
  await requireProject(organizationId, projectId);
  const rows = await AdShareProposalModel.initPath(pathParams(organizationId, projectId)).query().get();
  return rows.sort((a, b) => b.created_on.localeCompare(a.created_on)).map(toAdShareProposalView);
}

export async function getAdShareProposal(
  organizationId: string,
  projectId: string,
  proposalId: string,
): Promise<AdShareProposalModel> {
  const row = await AdShareProposalModel.init(proposalId, pathParams(organizationId, projectId));
  if (!row || row.organization_id !== organizationId || row.project_id !== projectId) {
    throw new AdShareProposalNotFoundError();
  }
  return row;
}

export async function updateAdShareProposalOutcome(params: {
  organizationId: string;
  projectId: string;
  proposalId: string;
  status: AdShareProposalStatus;
  appliedBriefId?: string | null;
  runId?: string | null;
  failureReason?: string | null;
  actorId: string;
  now?: Date;
}): Promise<AdShareProposalView> {
  const row = await getAdShareProposal(params.organizationId, params.projectId, params.proposalId);
  row.status = params.status;
  if (params.appliedBriefId !== undefined) row.applied_brief_id = params.appliedBriefId;
  if (params.runId !== undefined) row.run_id = params.runId;
  if (params.failureReason !== undefined) row.failure_reason = params.failureReason;
  row.decided_by = params.actorId;
  row.decided_on = (params.now ?? new Date()).toISOString();
  await row.save();
  return toAdShareProposalView(row);
}
