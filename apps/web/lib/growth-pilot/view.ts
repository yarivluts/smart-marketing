import type { GrowthActivityKind, GrowthPilotStatus, GrowthProposalStatus, GrowthTargetStatus } from '@growthos/firebase-orm-models';
import type { GrowthSiteAnalysis, GrowthTargetDraft, GrowthTargetKind } from '@growthos/shared';

/** What the Growth Pilot page shows: plain, serializable, no model classes. */
export interface GrowthPilotView {
  id: string;
  siteUrl: string;
  status: GrowthPilotStatus;
  failureCode: string | null;
  analysis: GrowthSiteAnalysis | null;
  pagesRead: { url: string; title: string }[];
  createdOn: string;
}

export interface GrowthTargetView {
  id: string;
  kind: GrowthTargetKind;
  name: string;
  description: string;
  audience: string;
  status: GrowthTargetStatus;
  origin: 'site' | 'request';
}

export interface GrowthProposalView {
  id: string;
  kind: 'target';
  targetId: string | null;
  status: GrowthProposalStatus;
  draft: GrowthTargetDraft | null;
  /** The person's change requests, oldest first, with how the AI handled each. */
  changes: { text: string; on: string; outcome: 'pending' | 'done' | 'failed'; failureCode: string | null }[];
  createdOn: string;
}

export interface GrowthActivityView {
  id: string;
  kind: GrowthActivityKind;
  byPilot: boolean;
  subject: string | null;
  count: number | null;
  on: string;
}

export interface GrowthPilotPageData {
  pilot: GrowthPilotView;
  targets: GrowthTargetView[];
  proposals: GrowthProposalView[];
  activity: GrowthActivityView[];
}

interface PilotRow {
  id: string;
  site_url: string;
  status: GrowthPilotStatus;
  failure_code?: string | null;
  analysis?: GrowthSiteAnalysis | null;
  pages_read?: { url: string; title: string }[] | null;
  created_on: string;
}

export function toGrowthPilotView(row: PilotRow): GrowthPilotView {
  return {
    id: row.id,
    siteUrl: row.site_url,
    status: row.status,
    failureCode: row.failure_code ?? null,
    analysis: row.analysis ?? null,
    pagesRead: row.pages_read ?? [],
    createdOn: row.created_on,
  };
}

export function toGrowthTargetView(row: { id: string; kind: GrowthTargetKind; name: string; description: string; audience: string; status: GrowthTargetStatus; origin: 'site' | 'request' }): GrowthTargetView {
  return { id: row.id, kind: row.kind, name: row.name, description: row.description, audience: row.audience, status: row.status, origin: row.origin };
}

export function toGrowthProposalView(row: {
  id: string;
  kind: 'target';
  target_id?: string | null;
  status: GrowthProposalStatus;
  draft?: GrowthTargetDraft | null;
  change_requests: { text: string; on: string; outcome: 'pending' | 'done' | 'failed'; failure_code?: string | null }[];
  created_on: string;
}): GrowthProposalView {
  return {
    id: row.id,
    kind: row.kind,
    targetId: row.target_id ?? null,
    status: row.status,
    draft: row.draft ?? null,
    changes: row.change_requests.map((change) => ({ text: change.text, on: change.on, outcome: change.outcome, failureCode: change.failure_code ?? null })),
    createdOn: row.created_on,
  };
}

export function toGrowthActivityView(row: { id: string; kind: GrowthActivityKind; actor: string; subject?: string | null; count?: number | null; created_on: string }): GrowthActivityView {
  return { id: row.id, kind: row.kind, byPilot: row.actor === 'pilot', subject: row.subject ?? null, count: row.count ?? null, on: row.created_on };
}

/** Proposals waiting for the person first (oldest first, the order they arrived), then the rest. */
export function waitingProposals(proposals: readonly GrowthProposalView[]): GrowthProposalView[] {
  return proposals.filter((proposal) => proposal.status === 'pending' || proposal.status === 'revising');
}
