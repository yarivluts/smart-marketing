import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import type { GrowthSiteAnalysis, GrowthTargetDraft } from '@growthos/shared';
import {
  acquireGrowthPilotLease,
  addRequestedGrowthTarget,
  completeGrowthProposalRevision,
  createOrganizationWithOwner,
  createProject,
  decideGrowthProposal,
  ensureUserForFirebaseSession,
  failGrowthPilotAnalysis,
  getCurrentGrowthPilot,
  GrowthChangeRequestEmptyError,
  GrowthPilotSiteInvalidError,
  GrowthProposalNotPendingError,
  listGrowthActivity,
  listGrowthProposals,
  listGrowthTargets,
  requestGrowthProposalChange,
  saveGrowthPilotAnalysis,
  setGrowthPilotPaused,
  startGrowthPilot,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

beforeAll(async () => {
  await connectToFirestoreEmulator('growth-pilot-tests');
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

const ANALYSIS: GrowthSiteAnalysis = {
  businessName: 'EasySign',
  summary: 'Digital signatures over WhatsApp.',
  language: 'en',
  offerings: [{ kind: 'service', name: 'Digital signature', description: 'Sign in 30 seconds', forWhom: 'Small law firms', why: 'Worth it' }],
  audiences: [{ name: 'Law firms', description: 'Small firms', needs: 'Faster signatures', why: 'Worth it' }],
};
const DRAFTS: GrowthTargetDraft[] = [
  { kind: 'service', name: 'Digital signature', description: 'Sign in 30 seconds', audience: 'Small law firms', reason: 'The main service' },
  { kind: 'audience', name: 'Law firms', description: 'Small firms', audience: 'Faster signatures', reason: 'They sign daily' },
];

async function setup() {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: `${unique('owner')}@example.com` });
  const { organization } = await createOrganizationWithOwner({ name: 'Pilot Org', ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  return { organizationId: organization.id, projectId: project.id, actorId: owner.id };
}

async function analyzedPilot() {
  const scope = await setup();
  const pilot = await startGrowthPilot({ ...scope, siteUrl: 'easysign.co.il' });
  const token = await acquireGrowthPilotLease(pilot);
  if (!token) throw new Error('no lease');
  await saveGrowthPilotAnalysis({ pilot, token, analysis: ANALYSIS, pages: [{ url: 'https://easysign.co.il/', title: 'EasySign' }], drafts: DRAFTS, generatedBy: { provider: 'gemini', model: 'm' } });
  return { scope, pilot };
}

describe('Growth Pilot', () => {
  it('starts on a website, refuses what is not one, and starting over archives the previous pilot', async () => {
    const scope = await setup();
    await expect(startGrowthPilot({ ...scope, siteUrl: 'not a site' })).rejects.toBeInstanceOf(GrowthPilotSiteInvalidError);
    const first = await startGrowthPilot({ ...scope, siteUrl: 'easysign.co.il' });
    expect(first).toMatchObject({ site_url: 'https://easysign.co.il/', status: 'analyzing' });
    const second = await startGrowthPilot({ ...scope, siteUrl: 'https://www.other.co.il' });
    expect((await getCurrentGrowthPilot(scope.organizationId, scope.projectId))?.id).toBe(second.id);
    const activity = await listGrowthActivity(scope.organizationId, scope.projectId, second.id);
    expect(activity.map((row) => row.kind)).toEqual(['pilot_started']);
  });

  it('lets one caller read the site at a time, then saves the analysis with every target as a pending proposal', async () => {
    const scope = await setup();
    const pilot = await startGrowthPilot({ ...scope, siteUrl: 'easysign.co.il' });
    const token = await acquireGrowthPilotLease(pilot);
    expect(token).toBeTruthy();
    expect(await acquireGrowthPilotLease(pilot)).toBeNull();
    expect(await saveGrowthPilotAnalysis({ pilot, token: 'not-mine', analysis: ANALYSIS, pages: [], drafts: DRAFTS, generatedBy: { provider: 'gemini', model: 'm' } })).toBeNull();
    const saved = await saveGrowthPilotAnalysis({ pilot, token: token!, analysis: ANALYSIS, pages: [{ url: 'https://easysign.co.il/', title: 'EasySign' }], drafts: DRAFTS, generatedBy: { provider: 'gemini', model: 'm' } });
    expect(saved).toMatchObject({ status: 'active', analysis: ANALYSIS, lease_token: null });
    expect(await acquireGrowthPilotLease(pilot)).toBeNull();
    const targets = await listGrowthTargets(scope.organizationId, scope.projectId, pilot.id);
    expect(targets.map((target) => [target.name, target.status, target.origin])).toEqual([
      ['Digital signature', 'proposed', 'site'],
      ['Law firms', 'proposed', 'site'],
    ]);
    const proposals = await listGrowthProposals(scope.organizationId, scope.projectId, pilot.id);
    expect(proposals.every((proposal) => proposal.status === 'pending' && proposal.kind === 'target')).toBe(true);
    const activity = await listGrowthActivity(scope.organizationId, scope.projectId, pilot.id);
    expect(activity.find((row) => row.kind === 'targets_proposed')?.count).toBe(2);
    expect(activity.find((row) => row.kind === 'site_read')?.count).toBe(1);
  });

  it('records a failed read so the person can start again', async () => {
    const scope = await setup();
    const pilot = await startGrowthPilot({ ...scope, siteUrl: 'easysign.co.il' });
    const token = await acquireGrowthPilotLease(pilot);
    const failed = await failGrowthPilotAnalysis({ pilot, token: token!, code: 'site_unreachable' });
    expect(failed).toMatchObject({ status: 'failed', failure_code: 'site_unreachable' });
  });

  it('approves a target as proposed and rejects another; a decided proposal cannot be decided again', async () => {
    const { scope, pilot } = await analyzedPilot();
    const [first, second] = await listGrowthProposals(scope.organizationId, scope.projectId, pilot.id);
    await decideGrowthProposal({ ...scope, proposalId: first.id, decision: 'approve' });
    await decideGrowthProposal({ ...scope, proposalId: second.id, decision: 'reject' });
    await expect(decideGrowthProposal({ ...scope, proposalId: first.id, decision: 'reject' })).rejects.toBeInstanceOf(GrowthProposalNotPendingError);
    const targets = await listGrowthTargets(scope.organizationId, scope.projectId, pilot.id);
    expect(targets.map((target) => target.status)).toEqual(['active', 'rejected']);
  });

  it('holds a proposal while the AI rewrites it on request, then applies the rewrite when approved', async () => {
    const { scope, pilot } = await analyzedPilot();
    const [proposal] = await listGrowthProposals(scope.organizationId, scope.projectId, pilot.id);
    await expect(requestGrowthProposalChange({ ...scope, proposalId: proposal.id, text: '   ' })).rejects.toBeInstanceOf(GrowthChangeRequestEmptyError);
    const revising = await requestGrowthProposalChange({ ...scope, proposalId: proposal.id, text: ' Only  Tel Aviv firms ' });
    expect(revising.status).toBe('revising');
    expect(revising.change_requests).toEqual([expect.objectContaining({ text: 'Only Tel Aviv firms', outcome: 'pending' })]);
    await expect(decideGrowthProposal({ ...scope, proposalId: proposal.id, decision: 'approve' })).rejects.toBeInstanceOf(GrowthProposalNotPendingError);

    const revised = await completeGrowthProposalRevision({ ...scope, proposalId: proposal.id, draft: { ...DRAFTS[0], audience: 'Tel Aviv law firms' } });
    expect(revised).toMatchObject({ status: 'pending', draft: { audience: 'Tel Aviv law firms' } });
    expect(revised.change_requests[0].outcome).toBe('done');
    await decideGrowthProposal({ ...scope, proposalId: proposal.id, decision: 'approve' });
    const [target] = await listGrowthTargets(scope.organizationId, scope.projectId, pilot.id);
    expect(target).toMatchObject({ status: 'active', audience: 'Tel Aviv law firms' });
  });

  it('keeps the proposal as it was when the rewrite fails, and says so', async () => {
    const { scope, pilot } = await analyzedPilot();
    const [proposal] = await listGrowthProposals(scope.organizationId, scope.projectId, pilot.id);
    await requestGrowthProposalChange({ ...scope, proposalId: proposal.id, text: 'Shorter' });
    const back = await completeGrowthProposalRevision({ ...scope, proposalId: proposal.id, draft: null, failureCode: 'quota_exceeded' });
    expect(back).toMatchObject({ status: 'pending', draft: DRAFTS[0] });
    expect(back.change_requests[0]).toMatchObject({ outcome: 'failed', failure_code: 'quota_exceeded' });
  });

  it('adds a target the person asked for as a proposal, and pauses and resumes', async () => {
    const { scope, pilot } = await analyzedPilot();
    const proposal = await addRequestedGrowthTarget({ ...scope, pilotId: pilot.id, draft: { kind: 'audience', name: 'Accountants', description: 'd', audience: 'a', reason: 'r' } });
    expect(proposal.status).toBe('pending');
    const targets = await listGrowthTargets(scope.organizationId, scope.projectId, pilot.id);
    expect(targets.find((target) => target.name === 'Accountants')).toMatchObject({ origin: 'request', status: 'proposed' });
    expect((await setGrowthPilotPaused({ ...scope, pilotId: pilot.id, paused: true })).status).toBe('paused');
    expect((await setGrowthPilotPaused({ ...scope, pilotId: pilot.id, paused: false })).status).toBe('active');
    const kinds = (await listGrowthActivity(scope.organizationId, scope.projectId, pilot.id)).map((row) => row.kind);
    expect(kinds).toEqual(expect.arrayContaining(['target_requested', 'pilot_paused', 'pilot_resumed']));
  });
});
