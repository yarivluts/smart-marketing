import { growthChangeAreas, type GrowthChangeArea, type GrowthPerformanceTotals } from '@growthos/shared';
import type { GrowthActivityView, GrowthLandingPageView, GrowthPilotPageData, GrowthProposalView, GrowthTargetView } from './view';

/**
 * Where one target (an approved idea the pilot is promoting) stands, computed from what is stored -
 * nothing estimated. Its pipeline has eight stages; each is done, being worked on, waiting for the
 * person, failed, declined by the person, not started, or skipped (not applicable to this target).
 * The percentage is the share of applicable stages that are done: skipped stages are left out of
 * both sides, everything else counts - so a failed or declined stage holds the number down honestly.
 */

export const GROWTH_STAGES = ['idea', 'audience', 'landing', 'images', 'video', 'published', 'live', 'results'] as const;
export type GrowthStageId = (typeof GROWTH_STAGES)[number];
export type GrowthStageState = 'done' | 'in_progress' | 'waiting' | 'failed' | 'declined' | 'not_started' | 'skipped';

export interface GrowthStage {
  id: GrowthStageId;
  state: GrowthStageState;
  /** When it was done (the decision or the publish), when known. */
  on: string | null;
  /** The stored failure code, for a failed stage. */
  failure: string | null;
  /** The proposal waiting for the person at this stage, if any. */
  proposalId: string | null;
}

export interface GrowthTargetProgress {
  stages: GrowthStage[];
  /** 0-100, rounded: done / applicable stages. */
  percent: number;
  done: number;
  applicable: number;
}

export interface GrowthProgressInput {
  target: GrowthTargetView;
  proposals: readonly GrowthProposalView[];
  landingPages: readonly GrowthLandingPageView[];
  /** Whether the pilot is running (not paused): only then is work "in progress". */
  pilotActive: boolean;
  /** Its ads' numbers from Meta, once there are any. */
  results?: GrowthPerformanceTotals | null;
}

/** This target's proposals of one kind, oldest first. */
function ofKind(input: GrowthProgressInput, kind: GrowthProposalView['kind']): GrowthProposalView[] {
  return input.proposals.filter((proposal) => proposal.targetId === input.target.id && proposal.kind === kind);
}

function open(proposals: readonly GrowthProposalView[]): GrowthProposalView | null {
  return proposals.find((proposal) => proposal.status === 'pending' || proposal.status === 'revising') ?? null;
}

function lastApprovedOn(proposals: readonly GrowthProposalView[]): string | null {
  return proposals.filter((proposal) => proposal.status === 'approved').at(-1)?.decidedOn ?? null;
}

const stage = (id: GrowthStageId, state: GrowthStageState, extra: Partial<Omit<GrowthStage, 'id' | 'state'>> = {}): GrowthStage => ({ id, state, on: null, failure: null, proposalId: null, ...extra });

/** A part with a proposal: waiting while it is pending, in progress while the AI revises it on request. */
function decision(id: GrowthStageId, proposal: GrowthProposalView | null): GrowthStage {
  return stage(id, proposal?.status === 'revising' ? 'in_progress' : 'waiting', { proposalId: proposal?.id ?? null });
}

export function growthTargetProgress(input: GrowthProgressInput): GrowthTargetProgress {
  const { target, pilotActive, results } = input;
  const approved = target.status === 'active' || target.status === 'paused';
  // The pilot works only on approved targets, and only while it runs.
  const working = pilotActive && target.status === 'active';
  const stages: GrowthStage[] = [];

  const ideas = ofKind(input, 'target');
  if (approved) stages.push(stage('idea', 'done', { on: lastApprovedOn(ideas) }));
  else if (target.status === 'rejected') stages.push(stage('idea', 'declined'));
  else stages.push(decision('idea', open(ideas)));

  if (!approved) {
    for (const id of GROWTH_STAGES.slice(1)) stages.push(stage(id, id === 'video' ? 'skipped' : 'not_started'));
    return summarize(stages);
  }

  const audiences = ofKind(input, 'audience');
  const audience = target.audienceStatus;
  if (audience === 'approved') stages.push(stage('audience', 'done', { on: lastApprovedOn(audiences) }));
  else if (audience === 'ready') stages.push(decision('audience', open(audiences)));
  // Declined: the ads reach the default audience instead - nothing left to do here.
  else if (audience === 'rejected') stages.push(stage('audience', 'skipped'));
  else if (audience === 'failed') stages.push(stage('audience', 'failed', { failure: target.audienceFailure }));
  else stages.push(stage('audience', working && target.briefId ? 'in_progress' : 'not_started'));

  const pages = ofKind(input, 'landing_page');
  const landing = target.landingStatus;
  const page = input.landingPages.find((candidate) => candidate.id === target.landingPageId) ?? null;
  if (landing === 'published') stages.push(stage('landing', 'done', { on: page?.publishedOn ?? lastApprovedOn(pages) }));
  else if (landing === 'ready') stages.push(decision('landing', open(pages)));
  // Declined: the ads send people to the site itself.
  else if (landing === 'rejected') stages.push(stage('landing', 'skipped'));
  else if (landing === 'failed') stages.push(stage('landing', 'failed', { failure: target.landingFailure }));
  else stages.push(stage('landing', working ? 'in_progress' : 'not_started'));

  const ads = ofKind(input, 'ads');
  const images = target.adsStatus;
  if (images === 'approved') stages.push(stage('images', 'done', { on: lastApprovedOn(ads) }));
  else if (images === 'ready') stages.push(decision('images', open(ads)));
  else if (images === 'building') stages.push(stage('images', 'in_progress'));
  else if (images === 'rejected') stages.push(stage('images', 'declined'));
  else if (images === 'failed') stages.push(stage('images', 'failed', { failure: target.adsFailure }));
  else stages.push(stage('images', working ? 'in_progress' : 'not_started'));

  // The video is extra: it counts only once one is being made.
  const video = target.videoStatus;
  if (video === 'ready') stages.push(stage('video', 'done'));
  else if (video === 'building') stages.push(stage('video', 'in_progress'));
  else if (video === 'failed') stages.push(stage('video', 'failed', { failure: target.videoFailure }));
  else stages.push(stage('video', 'skipped'));

  const publishes = ofKind(input, 'publish');
  const activations = ofKind(input, 'activate');
  const publish = target.publishStatus;
  const live = publish === 'published' || publish === 'running';
  if (live) stages.push(stage('published', 'done', { on: lastApprovedOn(publishes) }));
  else if (publish === 'ready') stages.push(decision('published', open(publishes)));
  else if (publish === 'needs_meta') stages.push(stage('published', 'waiting'));
  else if (publish === 'rejected') stages.push(stage('published', 'declined'));
  else if (publish === 'failed') stages.push(stage('published', 'failed', { failure: target.publishFailure, proposalId: open(publishes)?.id ?? null }));
  else stages.push(stage('published', 'not_started'));

  const turnOn = open(activations);
  if (publish === 'running') stages.push(stage('live', 'done', { on: lastApprovedOn(activations) }));
  else if (publish === 'published') stages.push(turnOn ? stage('live', 'waiting', { proposalId: turnOn.id }) : stage('live', 'declined'));
  else stages.push(stage('live', 'not_started'));

  if (publish === 'running') stages.push(stage('results', results && results.impressions > 0 ? 'done' : 'in_progress'));
  else stages.push(stage('results', 'not_started'));

  return summarize(stages);
}

function summarize(stages: GrowthStage[]): GrowthTargetProgress {
  const applicable = stages.filter((item) => item.state !== 'skipped').length;
  const done = stages.filter((item) => item.state === 'done').length;
  return { stages, done, applicable, percent: applicable ? Math.round((done / applicable) * 100) : 0 };
}

/** The targets a page shows progress for: approved ones (active or paused). */
export function promotedTargets(data: GrowthPilotPageData): GrowthTargetView[] {
  return data.targets.filter((target) => target.status === 'active' || target.status === 'paused');
}

export interface GrowthPilotOverview {
  percent: number;
  done: number;
  inProgress: number;
  /** Decisions waiting for the person: proposals, plus targets waiting for a Meta ad account. */
  waiting: number;
  targets: number;
}

/** The whole pilot at a glance: every promoted target's stages together, and the decisions waiting. */
export function growthPilotOverview(data: GrowthPilotPageData, results?: Record<string, GrowthPerformanceTotals> | null): GrowthPilotOverview {
  const targets = promotedTargets(data);
  const all = targets.map((target) => growthTargetProgress({ target, proposals: data.proposals, landingPages: data.landingPages, pilotActive: data.pilot.status === 'active', results: results?.[target.id] ?? null }));
  const done = all.reduce((sum, item) => sum + item.done, 0);
  const applicable = all.reduce((sum, item) => sum + item.applicable, 0);
  const inProgress = all.reduce((sum, item) => sum + item.stages.filter((entry) => entry.state === 'in_progress').length, 0);
  const waiting = data.proposals.filter((proposal) => proposal.status === 'pending').length + targets.filter((target) => target.publishStatus === 'needs_meta').length;
  return { percent: applicable ? Math.round((done / applicable) * 100) : 0, done, inProgress, waiting, targets: targets.length };
}

/** Which decision matters most: the one closest to the ads reaching people, then the oldest. */
const DECISION_ORDER: readonly GrowthProposalView['kind'][] = ['activate', 'publish', 'ads', 'audience', 'landing_page', 'target'];

export type GrowthNextDecision = { kind: 'proposal'; proposal: GrowthProposalView } | { kind: 'connect_meta'; target: GrowthTargetView } | null;

/** The single most important thing for the person to decide now, if anything waits for them. */
export function growthNextDecision(data: Pick<GrowthPilotPageData, 'proposals' | 'targets'>, options: { canConnectMeta: boolean; targetId?: string } = { canConnectMeta: false }): GrowthNextDecision {
  const pending = data.proposals.filter((proposal) => proposal.status === 'pending' && proposal.draft && (!options.targetId || proposal.targetId === options.targetId));
  for (const kind of DECISION_ORDER) {
    const found = pending.find((proposal) => proposal.kind === kind);
    if (found) return { kind: 'proposal', proposal: found };
  }
  const needsMeta = data.targets.find((target) => target.publishStatus === 'needs_meta' && (!options.targetId || target.id === options.targetId));
  return needsMeta && options.canConnectMeta ? { kind: 'connect_meta', target: needsMeta } : null;
}

/** The parts the person can ask the pilot to redo for this target now (none while one is already being redone). */
export function targetChangeAreas(target: GrowthTargetView, proposals: readonly GrowthProposalView[]): GrowthChangeArea[] {
  const revising = proposals.filter((proposal) => proposal.targetId === target.id && proposal.status === 'revising');
  const pendingAreas: GrowthChangeArea[] = [
    ...target.changeRequests.filter((change) => change.outcome === 'pending').map((change) => change.area),
    ...revising.flatMap((proposal): GrowthChangeArea[] => (proposal.kind === 'ads' ? ['ads'] : proposal.kind === 'landing_page' ? ['landing'] : proposal.kind === 'audience' ? ['audience'] : [])),
  ];
  return growthChangeAreas({ status: target.status, briefId: target.briefId, adsStatus: target.adsStatus, landingStatus: target.landingStatus, audienceStatus: target.audienceStatus, publishStatus: target.publishStatus, pendingAreas });
}

/**
 * The feed lines about one target, newest first. Lines recorded before lines carried their target
 * are matched by the target's name, but only for the kinds that name a target.
 */
const NAMED_KINDS = new Set<GrowthActivityView['kind']>(['target_requested', 'proposal_approved', 'proposal_rejected', 'change_requested', 'proposal_revised', 'revision_failed', 'ads_building', 'ads_ready', 'ads_failed', 'landing_ready', 'landing_published', 'landing_failed', 'audience_ready', 'audience_failed', 'ads_published', 'publish_failed', 'ads_activated']);

export function targetActivity(activity: readonly GrowthActivityView[], target: Pick<GrowthTargetView, 'id' | 'name'>): GrowthActivityView[] {
  return activity.filter((row) => (row.targetId ? row.targetId === target.id : NAMED_KINDS.has(row.kind) && row.subject === target.name));
}

/** Two feeds as one, newest first, each line once. */
export function mergeActivity(a: readonly GrowthActivityView[], b: readonly GrowthActivityView[]): GrowthActivityView[] {
  const byId = new Map<string, GrowthActivityView>();
  for (const row of [...a, ...b]) byId.set(row.id, row);
  return [...byId.values()].sort((x, y) => y.on.localeCompare(x.on));
}
