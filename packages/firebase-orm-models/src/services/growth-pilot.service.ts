import { randomBytes, randomUUID } from 'node:crypto';
import { landingCtaUrl, normalizeSiteUrl, siteHost, type GrowthAudiencePlan, type GrowthLandingContent, type GrowthSiteAnalysis, type GrowthTargetDraft } from '@growthos/shared';
import {
  GrowthActivityModel,
  GrowthLandingPageModel,
  GrowthLandingSlugModel,
  GrowthPilotIndexModel,
  GrowthPilotModel,
  GrowthProposalModel,
  GrowthTargetModel,
  type GrowthActivityKind,
  type GrowthPublishPlan,
  type GrowthPilotPage,
} from '../models/growth-pilot.model';
import { recordAuditLogEntry } from './audit-log.service';
import { saveAdStudioMetaTargeting } from './ad-studio-audience.service';

/**
 * Growth Pilot state: the pilot (one website), its targets, the proposals waiting for the person,
 * and the activity feed. The engine (`@growthos/ad-studio`) reads the site and writes with the AI;
 * this keeps the records, the lease that stops two callers from reading the same site at once, and
 * the audit trail of every human decision.
 */

export class GrowthPilotNotFoundError extends Error {
  constructor() {
    super('Growth Pilot not found.');
    this.name = 'GrowthPilotNotFoundError';
  }
}

export class GrowthPilotSiteInvalidError extends Error {
  constructor() {
    super('Enter a website address, like example.com.');
    this.name = 'GrowthPilotSiteInvalidError';
  }
}

export class GrowthChangeRequestEmptyError extends Error {
  constructor() {
    super('Say what to change.');
    this.name = 'GrowthChangeRequestEmptyError';
  }
}

export class GrowthProposalNotFoundError extends Error {
  constructor() {
    super('Proposal not found.');
    this.name = 'GrowthProposalNotFoundError';
  }
}

export class GrowthProposalNotPendingError extends Error {
  constructor(public readonly status: string) {
    super('This proposal is not waiting for a decision.');
    this.name = 'GrowthProposalNotPendingError';
  }
}

/** How long one site read may hold the pilot before another caller may try again. */
export const GROWTH_PILOT_LEASE_MS = 5 * 60_000;
/** The longest change request a person can send. */
export const GROWTH_CHANGE_REQUEST_MAX_CHARS = 1_000;

function pathParams(organizationId: string, projectId: string) {
  return { organization_id: organizationId, project_id: projectId };
}

interface Scope {
  organizationId: string;
  projectId: string;
}

async function audit(scope: Scope, actorId: string, action: string, targetType: string, targetId: string, summary: string, after?: Record<string, unknown>): Promise<void> {
  try {
    await recordAuditLogEntry({ organizationId: scope.organizationId, projectId: scope.projectId, actorType: 'user', actorId, action, targetType, targetId, summary, after });
  } catch {
    // Best-effort: the decision itself is saved either way.
  }
}

export async function recordGrowthActivity(params: Scope & { pilotId: string; kind: GrowthActivityKind; actor: string; subject?: string | null; count?: number | null; now?: Date }): Promise<GrowthActivityModel> {
  const row = new GrowthActivityModel();
  row.organization_id = params.organizationId;
  row.project_id = params.projectId;
  row.pilot_id = params.pilotId;
  row.kind = params.kind;
  row.actor = params.actor;
  row.subject = params.subject ?? null;
  row.count = params.count ?? null;
  row.created_on = (params.now ?? new Date()).toISOString();
  row.setPathParams(pathParams(params.organizationId, params.projectId));
  await row.save();
  return row;
}

/** The project's current pilot: the newest one that is not archived; null before the person starts one. */
export async function getCurrentGrowthPilot(organizationId: string, projectId: string): Promise<GrowthPilotModel | null> {
  const rows = await GrowthPilotModel.initPath(pathParams(organizationId, projectId)).where('project_id', '==', projectId).get();
  return rows.filter((row) => row.status !== 'archived').sort((a, b) => b.created_on.localeCompare(a.created_on))[0] ?? null;
}

export async function getGrowthPilot(organizationId: string, projectId: string, pilotId: string): Promise<GrowthPilotModel> {
  const pilot = await GrowthPilotModel.init(pilotId, pathParams(organizationId, projectId));
  if (!pilot || pilot.organization_id !== organizationId || pilot.project_id !== projectId) throw new GrowthPilotNotFoundError();
  return pilot;
}

/**
 * Starts a pilot for a website. A project has one current pilot: starting over (a new address, or
 * after a failed read) archives the previous one, whose targets and history stay readable.
 */
export async function startGrowthPilot(params: Scope & { siteUrl: string; actorId: string; now?: Date }): Promise<GrowthPilotModel> {
  const siteUrl = normalizeSiteUrl(params.siteUrl);
  if (!siteUrl) throw new GrowthPilotSiteInvalidError();
  const now = (params.now ?? new Date()).toISOString();
  const current = await getCurrentGrowthPilot(params.organizationId, params.projectId);
  if (current) {
    current.status = 'archived';
    current.updated_on = now;
    await current.save();
  }
  const pilot = new GrowthPilotModel();
  pilot.organization_id = params.organizationId;
  pilot.project_id = params.projectId;
  pilot.site_url = siteUrl;
  pilot.status = 'analyzing';
  pilot.analysis = null;
  pilot.pages_read = null;
  pilot.failure_code = null;
  pilot.generated_by = null;
  pilot.lease_until = null;
  pilot.lease_token = null;
  pilot.started_by = params.actorId;
  pilot.created_on = now;
  pilot.updated_on = now;
  pilot.setPathParams(pathParams(params.organizationId, params.projectId));
  await pilot.save();
  await syncGrowthPilotIndex(pilot, params.now);
  await recordGrowthActivity({ ...params, pilotId: pilot.id, kind: 'pilot_started', actor: params.actorId, subject: siteHost(siteUrl), now: params.now });
  await audit(params, params.actorId, 'growth_pilot.started', 'growth_pilot', pilot.id, `Started Growth Pilot for ${siteHost(siteUrl)}`, { site_url: siteUrl, archived: current?.id ?? null });
  return pilot;
}

/** Takes the pilot's lease while it is being analyzed; null when someone else holds it or there is nothing to analyze. */
export async function acquireGrowthPilotLease(pilot: Pick<GrowthPilotModel, 'id' | 'organization_id' | 'project_id'>, params: { ttlMs?: number; now?: Date } = {}): Promise<string | null> {
  const now = params.now ?? new Date();
  const fresh = await GrowthPilotModel.init(pilot.id, pathParams(pilot.organization_id, pilot.project_id));
  if (!fresh || fresh.status !== 'analyzing') return null;
  if (fresh.lease_until && fresh.lease_until > now.toISOString()) return null;
  const token = randomUUID();
  fresh.lease_token = token;
  fresh.lease_until = new Date(now.getTime() + (params.ttlMs ?? GROWTH_PILOT_LEASE_MS)).toISOString();
  await fresh.save();
  const check = await GrowthPilotModel.init(pilot.id, pathParams(pilot.organization_id, pilot.project_id));
  return check?.lease_token === token ? token : null;
}

async function heldPilot(pilot: Pick<GrowthPilotModel, 'id' | 'organization_id' | 'project_id'>, token: string): Promise<GrowthPilotModel | null> {
  const fresh = await GrowthPilotModel.init(pilot.id, pathParams(pilot.organization_id, pilot.project_id));
  return fresh && fresh.lease_token === token && fresh.status === 'analyzing' ? fresh : null;
}

function newTarget(scope: Scope, pilotId: string, draft: GrowthTargetDraft, origin: 'site' | 'request', now: string): GrowthTargetModel {
  const target = new GrowthTargetModel();
  target.organization_id = scope.organizationId;
  target.project_id = scope.projectId;
  target.pilot_id = pilotId;
  target.kind = draft.kind;
  target.name = draft.name;
  target.description = draft.description;
  target.audience = draft.audience;
  target.status = 'proposed';
  target.origin = origin;
  target.brief_id = null;
  target.run_id = null;
  target.ads_status = 'none';
  target.ads_failure = null;
  target.landing_page_id = null;
  target.landing_status = 'none';
  target.landing_failure = null;
  target.audience_status = 'none';
  target.audience_failure = null;
  target.publish_status = 'none';
  target.publish_failure = null;
  target.ad_export_ids = null;
  target.created_on = now;
  target.updated_on = now;
  target.setPathParams(pathParams(scope.organizationId, scope.projectId));
  return target;
}

function newTargetProposal(scope: Scope, pilotId: string, targetId: string, draft: GrowthTargetDraft, now: string): GrowthProposalModel {
  const proposal = new GrowthProposalModel();
  proposal.organization_id = scope.organizationId;
  proposal.project_id = scope.projectId;
  proposal.pilot_id = pilotId;
  proposal.target_id = targetId;
  proposal.kind = 'target';
  proposal.status = 'pending';
  proposal.draft = draft;
  proposal.brief_id = null;
  proposal.landing_page_id = null;
  proposal.audience = null;
  proposal.publish = null;
  proposal.preview_image_ids = null;
  proposal.change_requests = [];
  proposal.decided_by = null;
  proposal.decided_on = null;
  proposal.created_on = now;
  proposal.updated_on = now;
  proposal.setPathParams(pathParams(scope.organizationId, scope.projectId));
  return proposal;
}

/**
 * Saves what the site read learned and proposes the first targets, each as a proposal waiting for
 * the person. Only the lease holder may save, and only once: a second caller finds it done.
 */
export async function saveGrowthPilotAnalysis(params: {
  pilot: Pick<GrowthPilotModel, 'id' | 'organization_id' | 'project_id'>;
  token: string;
  analysis: GrowthSiteAnalysis;
  pages: GrowthPilotPage[];
  drafts: GrowthTargetDraft[];
  generatedBy: { provider: string; model: string };
  now?: Date;
}): Promise<GrowthPilotModel | null> {
  const fresh = await heldPilot(params.pilot, params.token);
  if (!fresh) return null;
  const now = (params.now ?? new Date()).toISOString();
  const scope = { organizationId: fresh.organization_id, projectId: fresh.project_id };
  // One millisecond apart, so the lists keep the order the AI proposed them in.
  const base = new Date(now).getTime();
  for (const [index, draft] of params.drafts.entries()) {
    const at = new Date(base + index).toISOString();
    const target = newTarget(scope, fresh.id, draft, 'site', at);
    await target.save();
    await newTargetProposal(scope, fresh.id, target.id, draft, at).save();
  }
  fresh.analysis = params.analysis;
  fresh.pages_read = params.pages;
  fresh.status = 'active';
  fresh.failure_code = null;
  fresh.generated_by = { ...params.generatedBy, generated_at: now };
  fresh.lease_token = null;
  fresh.lease_until = null;
  fresh.updated_on = now;
  await fresh.save();
  await syncGrowthPilotIndex(fresh, params.now);
  await recordGrowthActivity({ ...scope, pilotId: fresh.id, kind: 'site_read', actor: 'pilot', subject: siteHost(fresh.site_url), count: params.pages.length, now: params.now });
  await recordGrowthActivity({ ...scope, pilotId: fresh.id, kind: 'targets_proposed', actor: 'pilot', count: params.drafts.length, now: params.now });
  return fresh;
}

/** Records a failed site read; the person can try again (a new pilot). */
export async function failGrowthPilotAnalysis(params: { pilot: Pick<GrowthPilotModel, 'id' | 'organization_id' | 'project_id'>; token: string; code: string; now?: Date }): Promise<GrowthPilotModel | null> {
  const fresh = await heldPilot(params.pilot, params.token);
  if (!fresh) return null;
  const now = (params.now ?? new Date()).toISOString();
  fresh.status = 'failed';
  fresh.failure_code = params.code;
  fresh.lease_token = null;
  fresh.lease_until = null;
  fresh.updated_on = now;
  await fresh.save();
  await syncGrowthPilotIndex(fresh, params.now);
  await recordGrowthActivity({ organizationId: fresh.organization_id, projectId: fresh.project_id, pilotId: fresh.id, kind: 'analysis_failed', actor: 'pilot', subject: params.code, now: params.now });
  return fresh;
}

export async function listGrowthTargets(organizationId: string, projectId: string, pilotId: string): Promise<GrowthTargetModel[]> {
  const rows = await GrowthTargetModel.initPath(pathParams(organizationId, projectId)).where('pilot_id', '==', pilotId).get();
  return rows.sort((a, b) => a.created_on.localeCompare(b.created_on));
}

export async function listGrowthProposals(organizationId: string, projectId: string, pilotId: string): Promise<GrowthProposalModel[]> {
  const rows = await GrowthProposalModel.initPath(pathParams(organizationId, projectId)).where('pilot_id', '==', pilotId).get();
  return rows.sort((a, b) => a.created_on.localeCompare(b.created_on));
}

export async function listGrowthActivity(organizationId: string, projectId: string, pilotId: string, limit = 30): Promise<GrowthActivityModel[]> {
  const rows = await GrowthActivityModel.initPath(pathParams(organizationId, projectId)).where('pilot_id', '==', pilotId).get();
  return rows.sort((a, b) => b.created_on.localeCompare(a.created_on)).slice(0, limit);
}

export async function getGrowthProposal(organizationId: string, projectId: string, proposalId: string): Promise<GrowthProposalModel> {
  const proposal = await GrowthProposalModel.init(proposalId, pathParams(organizationId, projectId));
  if (!proposal || proposal.organization_id !== organizationId || proposal.project_id !== projectId) throw new GrowthProposalNotFoundError();
  return proposal;
}

async function proposalTarget(proposal: GrowthProposalModel): Promise<GrowthTargetModel | null> {
  if (!proposal.target_id) return null;
  return GrowthTargetModel.init(proposal.target_id, pathParams(proposal.organization_id, proposal.project_id));
}

/** The person approves or rejects a pending proposal. Approving a target makes it active as proposed. */
export async function decideGrowthProposal(params: Scope & { proposalId: string; decision: 'approve' | 'reject'; actorId: string; now?: Date }): Promise<GrowthProposalModel> {
  const proposal = await getGrowthProposal(params.organizationId, params.projectId, params.proposalId);
  if (proposal.status !== 'pending') throw new GrowthProposalNotPendingError(proposal.status);
  if (params.decision === 'approve' && (proposal.kind === 'publish' || proposal.kind === 'activate')) throw new GrowthProposalNeedsPlatformError();
  const now = (params.now ?? new Date()).toISOString();
  proposal.status = params.decision === 'approve' ? 'approved' : 'rejected';
  proposal.decided_by = params.actorId;
  proposal.decided_on = now;
  proposal.updated_on = now;
  await proposal.save();
  const target = await proposalTarget(proposal);
  if (target && proposal.kind === 'target') {
    if (params.decision === 'approve' && proposal.draft) {
      target.kind = proposal.draft.kind;
      target.name = proposal.draft.name;
      target.description = proposal.draft.description;
      target.audience = proposal.draft.audience;
    }
    target.status = params.decision === 'approve' ? 'active' : 'rejected';
    target.updated_on = now;
    await target.save();
  }
  if (target && proposal.kind === 'landing_page' && proposal.landing_page_id) {
    const page = await GrowthLandingPageModel.init(proposal.landing_page_id, pathParams(params.organizationId, params.projectId));
    if (page) {
      page.status = params.decision === 'approve' ? 'published' : 'rejected';
      page.published_on = params.decision === 'approve' ? now : (page.published_on ?? null);
      page.updated_on = now;
      await page.save();
    }
    target.landing_status = params.decision === 'approve' ? 'published' : 'rejected';
    target.updated_on = now;
    await target.save();
    if (params.decision === 'approve') await recordGrowthActivity({ ...params, pilotId: proposal.pilot_id, kind: 'landing_published', actor: params.actorId, subject: target.name, now: params.now });
  }
  if (target && proposal.kind === 'audience') {
    // Approving puts the audience on the target's ads, where publishing reads it.
    if (params.decision === 'approve' && proposal.audience && target.brief_id) {
      await saveAdStudioMetaTargeting({ organizationId: params.organizationId, projectId: params.projectId, briefId: target.brief_id, targeting: proposal.audience.targeting, now: params.now });
    }
    target.audience_status = params.decision === 'approve' ? 'approved' : 'rejected';
    target.updated_on = now;
    await target.save();
  }
  // Approving these two acts on the ad platform, so it goes through approveGrowthPublish/approveGrowthActivation; here only rejecting.
  if (target && (proposal.kind === 'publish' || proposal.kind === 'activate') && params.decision === 'reject') {
    target.publish_status = proposal.kind === 'publish' ? 'rejected' : 'published';
    target.updated_on = now;
    await target.save();
  }
  if (target && proposal.kind === 'ads') {
    target.ads_status = params.decision === 'approve' ? 'approved' : 'rejected';
    target.updated_on = now;
    await target.save();
  }
  const name = proposal.draft?.name ?? '';
  await recordGrowthActivity({ ...params, pilotId: proposal.pilot_id, kind: params.decision === 'approve' ? 'proposal_approved' : 'proposal_rejected', actor: params.actorId, subject: name, now: params.now });
  await audit(params, params.actorId, `growth_pilot.proposal_${params.decision === 'approve' ? 'approved' : 'rejected'}`, 'growth_proposal', proposal.id, `${params.decision === 'approve' ? 'Approved' : 'Rejected'} "${name}"`, { kind: proposal.kind, target_id: proposal.target_id ?? null });
  return proposal;
}

/** The person asks the AI to change a pending proposal: it is held as `revising` until the rewrite lands. */
export async function requestGrowthProposalChange(params: Scope & { proposalId: string; text: string; actorId: string; now?: Date }): Promise<GrowthProposalModel> {
  const text = params.text.replace(/\s+/g, ' ').trim().slice(0, GROWTH_CHANGE_REQUEST_MAX_CHARS);
  if (!text) throw new GrowthChangeRequestEmptyError();
  const proposal = await getGrowthProposal(params.organizationId, params.projectId, params.proposalId);
  if (proposal.status !== 'pending') throw new GrowthProposalNotPendingError(proposal.status);
  const now = (params.now ?? new Date()).toISOString();
  proposal.status = 'revising';
  proposal.change_requests = [...proposal.change_requests, { text, by: params.actorId, on: now, outcome: 'pending', failure_code: null }];
  proposal.updated_on = now;
  await proposal.save();
  await recordGrowthActivity({ ...params, pilotId: proposal.pilot_id, kind: 'change_requested', actor: params.actorId, subject: proposal.draft?.name ?? '', now: params.now });
  return proposal;
}

/** Saves the AI's rewrite of a proposal under revision (or, with no draft, that it failed) and puts it back in front of the person. */
export async function completeGrowthProposalRevision(params: Scope & { proposalId: string; draft: GrowthTargetDraft | null; failureCode?: string; now?: Date }): Promise<GrowthProposalModel> {
  const proposal = await getGrowthProposal(params.organizationId, params.projectId, params.proposalId);
  if (proposal.status !== 'revising') throw new GrowthProposalNotPendingError(proposal.status);
  const now = (params.now ?? new Date()).toISOString();
  const last = proposal.change_requests.length - 1;
  proposal.change_requests = proposal.change_requests.map((request, index) =>
    index === last ? { ...request, outcome: params.draft ? 'done' : 'failed', failure_code: params.draft ? null : (params.failureCode ?? 'provider_error') } : request,
  );
  if (params.draft) proposal.draft = params.draft;
  proposal.status = 'pending';
  proposal.updated_on = now;
  await proposal.save();
  await recordGrowthActivity({ ...params, pilotId: proposal.pilot_id, kind: params.draft ? 'proposal_revised' : 'revision_failed', actor: 'pilot', subject: proposal.draft?.name ?? '', now: params.now });
  return proposal;
}

/** A target the person asked for, as the AI defined it: proposed, so they confirm the AI understood them. */
export async function addRequestedGrowthTarget(params: Scope & { pilotId: string; draft: GrowthTargetDraft; actorId: string; now?: Date }): Promise<GrowthProposalModel> {
  const pilot = await getGrowthPilot(params.organizationId, params.projectId, params.pilotId);
  const now = (params.now ?? new Date()).toISOString();
  const target = newTarget(params, pilot.id, params.draft, 'request', now);
  await target.save();
  const proposal = newTargetProposal(params, pilot.id, target.id, params.draft, now);
  await proposal.save();
  await recordGrowthActivity({ ...params, pilotId: pilot.id, kind: 'target_requested', actor: params.actorId, subject: params.draft.name, now: params.now });
  return proposal;
}

/** Pauses or resumes the pilot. A paused pilot proposes and runs nothing; decisions the person makes still apply. */
export async function setGrowthPilotPaused(params: Scope & { pilotId: string; paused: boolean; actorId: string; now?: Date }): Promise<GrowthPilotModel> {
  const pilot = await getGrowthPilot(params.organizationId, params.projectId, params.pilotId);
  if (params.paused ? pilot.status !== 'active' : pilot.status !== 'paused') return pilot;
  const now = (params.now ?? new Date()).toISOString();
  pilot.status = params.paused ? 'paused' : 'active';
  pilot.updated_on = now;
  await pilot.save();
  await syncGrowthPilotIndex(pilot, params.now);
  await recordGrowthActivity({ ...params, pilotId: pilot.id, kind: params.paused ? 'pilot_paused' : 'pilot_resumed', actor: params.actorId, now: params.now });
  await audit(params, params.actorId, params.paused ? 'growth_pilot.paused' : 'growth_pilot.resumed', 'growth_pilot', pilot.id, `${params.paused ? 'Paused' : 'Resumed'} Growth Pilot for ${siteHost(pilot.site_url)}`);
  return pilot;
}

export async function getGrowthTarget(organizationId: string, projectId: string, targetId: string): Promise<GrowthTargetModel> {
  const target = await GrowthTargetModel.init(targetId, pathParams(organizationId, projectId));
  if (!target || target.organization_id !== organizationId || target.project_id !== projectId) throw new GrowthPilotNotFoundError();
  return target;
}

/** The target's ads are being made: its brief and the autopilot run making them. */
export async function linkGrowthTargetAds(params: Scope & { targetId: string; briefId: string; runId: string; now?: Date }): Promise<GrowthTargetModel> {
  const target = await getGrowthTarget(params.organizationId, params.projectId, params.targetId);
  const now = (params.now ?? new Date()).toISOString();
  const first = !target.brief_id;
  target.brief_id = params.briefId;
  target.run_id = params.runId;
  target.ads_status = 'building';
  target.ads_failure = null;
  target.updated_on = now;
  await target.save();
  if (first) await recordGrowthActivity({ ...params, pilotId: target.pilot_id, kind: 'ads_building', actor: 'pilot', subject: target.name, now: params.now });
  return target;
}

async function revisingAdsProposal(scope: Scope, target: GrowthTargetModel): Promise<GrowthProposalModel | null> {
  const rows = await GrowthProposalModel.initPath(pathParams(scope.organizationId, scope.projectId)).where('target_id', '==', target.id).get();
  return rows.find((row) => row.kind === 'ads' && row.status === 'revising') ?? null;
}

/**
 * The autopilot finished a target's ads. Ready: they go in front of the person as a proposal with
 * previews - or, when the person had asked for a change, the same proposal comes back with the new
 * ones. Failed: the target says why, and a pending change request is closed as failed.
 */
export async function finishGrowthTargetAds(params: Scope & { targetId: string; previewImageIds: string[]; failureCode?: string | null; now?: Date }): Promise<GrowthTargetModel> {
  const target = await getGrowthTarget(params.organizationId, params.projectId, params.targetId);
  const now = (params.now ?? new Date()).toISOString();
  const revising = await revisingAdsProposal(params, target);
  if (params.failureCode) {
    target.ads_status = revising ? 'ready' : 'failed';
    target.ads_failure = params.failureCode;
    target.updated_on = now;
    await target.save();
    if (revising) await completeGrowthProposalRevision({ organizationId: params.organizationId, projectId: params.projectId, proposalId: revising.id, draft: null, failureCode: params.failureCode, now: params.now });
    else await recordGrowthActivity({ ...params, pilotId: target.pilot_id, kind: 'ads_failed', actor: 'pilot', subject: target.name, now: params.now });
    return target;
  }
  target.ads_status = 'ready';
  target.ads_failure = null;
  target.updated_on = now;
  await target.save();
  if (revising) {
    revising.preview_image_ids = params.previewImageIds;
    await revising.save();
    await completeGrowthProposalRevision({ organizationId: params.organizationId, projectId: params.projectId, proposalId: revising.id, draft: revising.draft ?? null, now: params.now });
    return target;
  }
  const proposal = new GrowthProposalModel();
  proposal.organization_id = params.organizationId;
  proposal.project_id = params.projectId;
  proposal.pilot_id = target.pilot_id;
  proposal.target_id = target.id;
  proposal.kind = 'ads';
  proposal.status = 'pending';
  proposal.draft = { kind: target.kind, name: target.name, description: target.description, audience: target.audience, reason: '' };
  proposal.brief_id = target.brief_id ?? null;
  proposal.preview_image_ids = params.previewImageIds;
  proposal.change_requests = [];
  proposal.decided_by = null;
  proposal.decided_on = null;
  proposal.created_on = now;
  proposal.updated_on = now;
  proposal.setPathParams(pathParams(params.organizationId, params.projectId));
  await proposal.save();
  await recordGrowthActivity({ ...params, pilotId: target.pilot_id, kind: 'ads_ready', actor: 'pilot', subject: target.name, count: params.previewImageIds.length, now: params.now });
  return target;
}

/** A random, unguessable public address part: 12 characters, letters, digits, - and _. */
export function newLandingSlug(): string {
  return randomBytes(9).toString('base64url');
}

export async function getGrowthLandingPage(organizationId: string, projectId: string, pageId: string): Promise<GrowthLandingPageModel> {
  const page = await GrowthLandingPageModel.init(pageId, pathParams(organizationId, projectId));
  if (!page || page.organization_id !== organizationId || page.project_id !== projectId) throw new GrowthPilotNotFoundError();
  return page;
}

/**
 * The pilot wrote a landing page for a target: it is saved as a draft with its public address
 * reserved, and put in front of the person as a proposal. Nothing is public until they approve it.
 */
export async function saveGrowthLandingDraft(params: Scope & { targetId: string; content: GrowthLandingContent; language: string; siteUrl: string; now?: Date }): Promise<GrowthLandingPageModel> {
  const target = await getGrowthTarget(params.organizationId, params.projectId, params.targetId);
  const now = (params.now ?? new Date()).toISOString();
  const slug = newLandingSlug();
  const page = new GrowthLandingPageModel();
  page.organization_id = params.organizationId;
  page.project_id = params.projectId;
  page.pilot_id = target.pilot_id;
  page.target_id = target.id;
  page.slug = slug;
  page.status = 'draft';
  page.content = params.content;
  page.language = params.language;
  page.cta_url = landingCtaUrl(params.siteUrl, slug);
  page.published_on = null;
  page.created_on = now;
  page.updated_on = now;
  page.setPathParams(pathParams(params.organizationId, params.projectId));
  await page.save();
  const index = new GrowthLandingSlugModel();
  index.organization_id = params.organizationId;
  index.project_id = params.projectId;
  index.landing_page_id = page.id;
  // Saved under the slug itself, so the public route finds the page in one read.
  await index.save(slug);

  const proposal = new GrowthProposalModel();
  proposal.organization_id = params.organizationId;
  proposal.project_id = params.projectId;
  proposal.pilot_id = target.pilot_id;
  proposal.target_id = target.id;
  proposal.kind = 'landing_page';
  proposal.status = 'pending';
  proposal.draft = { kind: target.kind, name: target.name, description: target.description, audience: target.audience, reason: '' };
  proposal.brief_id = null;
  proposal.landing_page_id = page.id;
  proposal.preview_image_ids = null;
  proposal.change_requests = [];
  proposal.decided_by = null;
  proposal.decided_on = null;
  proposal.created_on = now;
  proposal.updated_on = now;
  proposal.setPathParams(pathParams(params.organizationId, params.projectId));
  await proposal.save();

  target.landing_page_id = page.id;
  target.landing_status = 'ready';
  target.landing_failure = null;
  target.updated_on = now;
  await target.save();
  await recordGrowthActivity({ ...params, pilotId: target.pilot_id, kind: 'landing_ready', actor: 'pilot', subject: target.name, now: params.now });
  return page;
}

/** The page could not be written: the target says why (and is not retried until the person asks). */
export async function failGrowthLanding(params: Scope & { targetId: string; failureCode: string; now?: Date }): Promise<GrowthTargetModel> {
  const target = await getGrowthTarget(params.organizationId, params.projectId, params.targetId);
  target.landing_status = 'failed';
  target.landing_failure = params.failureCode;
  target.updated_on = (params.now ?? new Date()).toISOString();
  await target.save();
  await recordGrowthActivity({ ...params, pilotId: target.pilot_id, kind: 'landing_failed', actor: 'pilot', subject: target.name, now: params.now });
  return target;
}

/** Replaces a draft's content with the AI's revision (the proposal is completed by the caller). */
export async function updateGrowthLandingContent(params: Scope & { pageId: string; content: GrowthLandingContent; now?: Date }): Promise<GrowthLandingPageModel> {
  const page = await getGrowthLandingPage(params.organizationId, params.projectId, params.pageId);
  page.content = params.content;
  page.updated_on = (params.now ?? new Date()).toISOString();
  await page.save();
  return page;
}

/** The page a public address shows: only a published one; null for anything else, so drafts never leak. */
export async function getPublishedGrowthLanding(slug: string): Promise<GrowthLandingPageModel | null> {
  if (!/^[A-Za-z0-9_-]{8,32}$/.test(slug)) return null;
  const index = await GrowthLandingSlugModel.init(slug);
  if (!index) return null;
  const page = await GrowthLandingPageModel.init(index.landing_page_id, pathParams(index.organization_id, index.project_id));
  return page && page.status === 'published' && page.slug === slug ? page : null;
}

export async function listGrowthLandingPages(organizationId: string, projectId: string, pilotId: string): Promise<GrowthLandingPageModel[]> {
  const rows = await GrowthLandingPageModel.initPath(pathParams(organizationId, projectId)).where('pilot_id', '==', pilotId).get();
  return rows.sort((a, b) => a.created_on.localeCompare(b.created_on));
}

/** The pilot proposes an audience for a target's ads; it waits for the person like everything else. */
export async function saveGrowthAudienceProposal(params: Scope & { targetId: string; plan: GrowthAudiencePlan; now?: Date }): Promise<GrowthProposalModel> {
  const target = await getGrowthTarget(params.organizationId, params.projectId, params.targetId);
  const now = (params.now ?? new Date()).toISOString();
  const proposal = new GrowthProposalModel();
  proposal.organization_id = params.organizationId;
  proposal.project_id = params.projectId;
  proposal.pilot_id = target.pilot_id;
  proposal.target_id = target.id;
  proposal.kind = 'audience';
  proposal.status = 'pending';
  proposal.draft = { kind: target.kind, name: target.name, description: target.description, audience: target.audience, reason: '' };
  proposal.brief_id = target.brief_id ?? null;
  proposal.landing_page_id = null;
  proposal.audience = params.plan;
  proposal.preview_image_ids = null;
  proposal.change_requests = [];
  proposal.decided_by = null;
  proposal.decided_on = null;
  proposal.created_on = now;
  proposal.updated_on = now;
  proposal.setPathParams(pathParams(params.organizationId, params.projectId));
  await proposal.save();
  target.audience_status = 'ready';
  target.audience_failure = null;
  target.updated_on = now;
  await target.save();
  await recordGrowthActivity({ ...params, pilotId: target.pilot_id, kind: 'audience_ready', actor: 'pilot', subject: target.name, now: params.now });
  return proposal;
}

export async function failGrowthAudience(params: Scope & { targetId: string; failureCode: string; now?: Date }): Promise<GrowthTargetModel> {
  const target = await getGrowthTarget(params.organizationId, params.projectId, params.targetId);
  target.audience_status = 'failed';
  target.audience_failure = params.failureCode;
  target.updated_on = (params.now ?? new Date()).toISOString();
  await target.save();
  await recordGrowthActivity({ ...params, pilotId: target.pilot_id, kind: 'audience_failed', actor: 'pilot', subject: target.name, now: params.now });
  return target;
}

/** Replaces a proposed audience with the AI's revision (the proposal is completed by the caller). */
export async function updateGrowthAudiencePlan(params: Scope & { proposalId: string; plan: GrowthAudiencePlan; now?: Date }): Promise<GrowthProposalModel> {
  const proposal = await getGrowthProposal(params.organizationId, params.projectId, params.proposalId);
  proposal.audience = params.plan;
  proposal.updated_on = (params.now ?? new Date()).toISOString();
  await proposal.save();
  return proposal;
}

export class GrowthProposalNeedsPlatformError extends Error {
  constructor() {
    super('Approving this proposal publishes on the ad platform; use the publishing flow.');
    this.name = 'GrowthProposalNeedsPlatformError';
  }
}

function newPlatformProposal(scope: Scope, target: GrowthTargetModel, kind: 'publish' | 'activate', plan: GrowthPublishPlan, now: string): GrowthProposalModel {
  const proposal = new GrowthProposalModel();
  proposal.organization_id = scope.organizationId;
  proposal.project_id = scope.projectId;
  proposal.pilot_id = target.pilot_id;
  proposal.target_id = target.id;
  proposal.kind = kind;
  proposal.status = 'pending';
  proposal.draft = { kind: target.kind, name: target.name, description: target.description, audience: target.audience, reason: '' };
  proposal.brief_id = target.brief_id ?? null;
  proposal.landing_page_id = null;
  proposal.audience = null;
  proposal.publish = plan;
  proposal.preview_image_ids = plan.imageIds;
  proposal.change_requests = [];
  proposal.decided_by = null;
  proposal.decided_on = null;
  proposal.created_on = now;
  proposal.updated_on = now;
  proposal.setPathParams(pathParams(scope.organizationId, scope.projectId));
  return proposal;
}

/** The target's ads, audience and page are decided: the pilot proposes publishing them, paused. */
export async function saveGrowthPublishProposal(params: Scope & { targetId: string; plan: GrowthPublishPlan; now?: Date }): Promise<GrowthProposalModel> {
  const target = await getGrowthTarget(params.organizationId, params.projectId, params.targetId);
  const now = (params.now ?? new Date()).toISOString();
  const proposal = newPlatformProposal(params, target, 'publish', params.plan, now);
  await proposal.save();
  target.publish_status = 'ready';
  target.publish_failure = null;
  target.updated_on = now;
  await target.save();
  return proposal;
}

/** Ready to publish, but no Meta ad account is connected yet: the target says so until one is. */
export async function markGrowthTargetNeedsMeta(params: Scope & { targetId: string; now?: Date }): Promise<GrowthTargetModel> {
  const target = await getGrowthTarget(params.organizationId, params.projectId, params.targetId);
  if (target.publish_status === 'needs_meta') return target;
  target.publish_status = 'needs_meta';
  target.updated_on = (params.now ?? new Date()).toISOString();
  await target.save();
  return target;
}

/**
 * The person approved publishing and the ads now exist, paused, on Meta: the proposal is decided, the
 * target remembers its ads, and turning them on becomes the next proposal - spending is its own decision.
 */
export async function markGrowthAdsPublished(params: Scope & { proposalId: string; exportIds: string[]; dailyBudget: number; actorId: string; now?: Date }): Promise<GrowthProposalModel> {
  const proposal = await getGrowthProposal(params.organizationId, params.projectId, params.proposalId);
  if (proposal.status !== 'pending' || proposal.kind !== 'publish' || !proposal.target_id || !proposal.publish) throw new GrowthProposalNotPendingError(proposal.status);
  const now = (params.now ?? new Date()).toISOString();
  proposal.status = 'approved';
  proposal.decided_by = params.actorId;
  proposal.decided_on = now;
  proposal.publish = { ...proposal.publish, dailyBudget: params.dailyBudget };
  proposal.updated_on = now;
  await proposal.save();
  const target = await getGrowthTarget(params.organizationId, params.projectId, proposal.target_id);
  target.publish_status = 'published';
  target.publish_failure = null;
  target.ad_export_ids = params.exportIds;
  target.updated_on = now;
  await target.save();
  await newPlatformProposal(params, target, 'activate', { ...proposal.publish }, now).save();
  await recordGrowthActivity({ ...params, pilotId: target.pilot_id, kind: 'ads_published', actor: params.actorId, subject: target.name, count: params.exportIds.length, now: params.now });
  await audit(params, params.actorId, 'growth_pilot.ads_published', 'growth_proposal', proposal.id, `Published ${params.exportIds.length} paused Meta ad(s) for "${target.name}"`, { export_ids: params.exportIds, daily_budget: params.dailyBudget });
  return proposal;
}

/** Publishing failed on the platform: the target says why and the proposal stays, so the person can try again. */
export async function failGrowthPublish(params: Scope & { targetId: string; failureCode: string; now?: Date }): Promise<GrowthTargetModel> {
  const target = await getGrowthTarget(params.organizationId, params.projectId, params.targetId);
  target.publish_status = 'failed';
  target.publish_failure = params.failureCode;
  target.updated_on = (params.now ?? new Date()).toISOString();
  await target.save();
  await recordGrowthActivity({ ...params, pilotId: target.pilot_id, kind: 'publish_failed', actor: 'pilot', subject: target.name, now: params.now });
  return target;
}

/** The person turned the ads on (they now spend up to the daily budget). */
export async function markGrowthAdsRunning(params: Scope & { proposalId: string; actorId: string; now?: Date }): Promise<GrowthProposalModel> {
  const proposal = await getGrowthProposal(params.organizationId, params.projectId, params.proposalId);
  if (proposal.status !== 'pending' || proposal.kind !== 'activate' || !proposal.target_id) throw new GrowthProposalNotPendingError(proposal.status);
  const now = (params.now ?? new Date()).toISOString();
  proposal.status = 'approved';
  proposal.decided_by = params.actorId;
  proposal.decided_on = now;
  proposal.updated_on = now;
  await proposal.save();
  const target = await getGrowthTarget(params.organizationId, params.projectId, proposal.target_id);
  target.publish_status = 'running';
  target.updated_on = now;
  await target.save();
  await recordGrowthActivity({ ...params, pilotId: target.pilot_id, kind: 'ads_activated', actor: params.actorId, subject: target.name, now: params.now });
  await audit(params, params.actorId, 'growth_pilot.ads_activated', 'growth_proposal', proposal.id, `Turned on the ads for "${target.name}"`, { daily_budget: proposal.publish?.dailyBudget ?? null });
  return proposal;
}

function indexId(organizationId: string, projectId: string): string {
  return `${organizationId}_${projectId}`;
}

/** Keeps the project's line in the platform-wide index in step with its current pilot. */
export async function syncGrowthPilotIndex(pilot: Pick<GrowthPilotModel, 'id' | 'organization_id' | 'project_id' | 'site_url' | 'status' | 'started_by'>, now?: Date): Promise<void> {
  const id = indexId(pilot.organization_id, pilot.project_id);
  let existing = await GrowthPilotIndexModel.init(id);
  if (existing && existing.pilot_id !== pilot.id) {
    // A new pilot for the project: a fresh line, so the old pilot's last run is not carried over.
    await existing.remove();
    existing = null;
  }
  const row = existing ?? new GrowthPilotIndexModel();
  row.organization_id = pilot.organization_id;
  row.project_id = pilot.project_id;
  row.pilot_id = pilot.id;
  row.site_url = pilot.site_url;
  row.status = pilot.status;
  row.started_by = pilot.started_by;
  row.updated_on = (now ?? new Date()).toISOString();
  if (existing) await row.save();
  else await row.save(id);
}

/** Every project's pilot line, for the scheduler and the operators. */
export async function listGrowthPilotIndex(): Promise<GrowthPilotIndexModel[]> {
  return GrowthPilotIndexModel.getAll();
}

/** Records how a scheduled run of this pilot went. */
export async function recordGrowthPilotRun(params: Scope & { outcome: string; now?: Date }): Promise<void> {
  const row = await GrowthPilotIndexModel.init(indexId(params.organizationId, params.projectId));
  if (!row) return;
  const now = (params.now ?? new Date()).toISOString();
  row.last_run_on = now;
  row.last_run_outcome = params.outcome;
  row.updated_on = now;
  await row.save();
}

/**
 * Adds or corrects the project's index line when it is missing or out of step - for pilots started
 * before the index existed, or a write that was lost. One read when everything is in order.
 */
export async function ensureGrowthPilotIndexed(pilot: Pick<GrowthPilotModel, 'id' | 'organization_id' | 'project_id' | 'site_url' | 'status' | 'started_by'>, now?: Date): Promise<boolean> {
  const row = await GrowthPilotIndexModel.init(indexId(pilot.organization_id, pilot.project_id));
  if (row && row.pilot_id === pilot.id && row.status === pilot.status) return false;
  await syncGrowthPilotIndex(pilot, now);
  return true;
}
