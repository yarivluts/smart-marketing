import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  approveAutomationAction,
  AutomationActionInvalidStateError,
  AutomationActionNotFoundError,
  AutomationKillSwitchEngagedError,
  AutomationTargetNotFoundError,
  createOrganizationWithOwner,
  createProject,
  createSharedCredential,
  decideResourceAttachment,
  disengageAutomationKillSwitch,
  engageAutomationKillSwitch,
  ensureAutomationTargetSeeded,
  ensureUserForFirebaseSession,
  executeAutomationAction,
  getAutomationKillSwitchStatus,
  InsufficientWriteTierError,
  InvalidAutomationActionError,
  listAuditLogEntriesForOrg,
  listAutomationActionsForProject,
  listAutomationTargetStatesForProject,
  proposeAutomationBudgetChangeAction,
  proposeCampaignActivationAction,
  proposeCampaignDraftCreateAction,
  rejectAutomationAction,
  requestResourceAttachment,
  rollbackAutomationAction,
  setAutomationGuardrailPolicy,
  setResourceAttachmentWriteTier,
  verifyAutomationAction,
  type CampaignDraft,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

beforeAll(async () => {
  await connectToFirestoreEmulator('automation-tests');
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function uniqueEmail(prefix: string): string {
  return `${unique(prefix)}@example.com`;
}

async function setupOrgWithProject(orgName: string) {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('owner') });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  return { owner, organization, project };
}

async function seedTarget(organizationId: string, projectId: string, seededByUserId: string, initialDailyBudgetUsd = 100) {
  return ensureAutomationTargetSeeded({
    organizationId,
    projectId,
    environmentId: 'live',
    targetId: unique('campaign'),
    targetType: 'campaign',
    label: 'Summer Sale',
    initialDailyBudgetUsd,
    seededByUserId,
  });
}

/** Seeds an approved credential connection at the given write tier and a target linked to it (KAN-74). */
async function seedTargetWithConnection(
  organizationId: string,
  projectId: string,
  ownerId: string,
  tier: 'read' | 'optimize' | 'manage',
  initialDailyBudgetUsd = 100,
) {
  const credential = await createSharedCredential({
    organizationId,
    name: 'Agency Google Ads MCC',
    provider: 'google_ads',
    availableScopes: ['act_1'],
    createdByUserId: ownerId,
  });
  const attachment = await requestResourceAttachment({
    organizationId,
    projectId,
    resourceKind: 'credential',
    resourceId: credential.id,
    requestedByUserId: ownerId,
    scopeSelection: ['act_1'],
  });
  await decideResourceAttachment({ organizationId, attachmentId: attachment.id, decidedByUserId: ownerId, approve: true });
  if (tier !== 'read') {
    await setResourceAttachmentWriteTier({ organizationId, attachmentId: attachment.id, tier, actorId: ownerId });
  }

  const target = await ensureAutomationTargetSeeded({
    organizationId,
    projectId,
    environmentId: 'live',
    targetId: unique('campaign'),
    targetType: 'campaign',
    label: 'Summer Sale',
    initialDailyBudgetUsd,
    seededByUserId: ownerId,
    resourceAttachmentId: attachment.id,
  });

  return { target, attachment };
}

function campaignDraft(overrides: Partial<CampaignDraft> = {}): CampaignDraft {
  return {
    campaignName: 'Winning Themes',
    advertisingChannelType: 'SEARCH',
    dailyBudgetUsd: 25,
    adGroups: [
      {
        name: 'Ad Group 1',
        keywords: [{ text: 'blue widgets', matchType: 'PHRASE' }],
        negativeKeywords: [{ text: 'free', matchType: 'BROAD' }],
        responsiveSearchAd: {
          headlines: ['Buy Blue Widgets', 'Best Widgets Online', 'Widgets For Less'],
          descriptions: ['Free shipping on all widgets.', 'Order today, ships tomorrow.'],
          finalUrl: 'https://example.com/widgets',
        },
      },
    ],
    ...overrides,
  };
}

describe('ensureAutomationTargetSeeded', () => {
  it('is idempotent — a second call for the same target id returns the existing state unchanged', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Target Seed Org');
    const targetId = unique('campaign');
    const first = await ensureAutomationTargetSeeded({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: 'live',
      targetId,
      targetType: 'campaign',
      label: 'Summer Sale',
      initialDailyBudgetUsd: 100,
      seededByUserId: owner.id,
    });
    const second = await ensureAutomationTargetSeeded({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: 'live',
      targetId,
      targetType: 'campaign',
      label: 'A different label',
      initialDailyBudgetUsd: 999,
      seededByUserId: owner.id,
    });

    expect(second.id).toBe(first.id);
    expect(second.daily_budget_usd).toBe(100);
    expect(second.label).toBe('Summer Sale');
  });

  it('lists every seeded target for a project', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Target List Org');
    await seedTarget(organization.id, project.id, owner.id);
    await seedTarget(organization.id, project.id, owner.id);

    const targets = await listAutomationTargetStatesForProject(organization.id, project.id);
    expect(targets).toHaveLength(2);
  });
});

describe('proposeAutomationBudgetChangeAction', () => {
  it('proposes a clean change as awaiting_approval with the dry-run diff', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Propose Clean Org');
    const target = await seedTarget(organization.id, project.id, owner.id, 100);

    const action = await proposeAutomationBudgetChangeAction({
      organizationId: organization.id,
      projectId: project.id,
      targetId: target.id,
      afterDailyBudgetUsd: 110,
      requestedByUserId: owner.id,
    });

    expect(action.status).toBe('awaiting_approval');
    expect(action.before).toEqual({ dailyBudgetUsd: 100 });
    expect(action.after).toEqual({ dailyBudgetUsd: 110 });
    expect(action.guardrail_violations).toEqual([]);
  });

  it('blocks a change that exceeds the max daily budget change percentage', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Propose Blocked Pct Org');
    const target = await seedTarget(organization.id, project.id, owner.id, 100);
    await setAutomationGuardrailPolicy({
      organizationId: organization.id,
      projectId: project.id,
      maxDailyBudgetChangePct: 20,
      spendCeilingUsd: null,
      protectedTargetIds: [],
      allowedHours: null,
      maxActionsPerDay: null,
      maxGuardedMetricRegressionPct: null,
      setByUserId: owner.id,
    });

    const action = await proposeAutomationBudgetChangeAction({
      organizationId: organization.id,
      projectId: project.id,
      targetId: target.id,
      afterDailyBudgetUsd: 200,
      requestedByUserId: owner.id,
    });

    expect(action.status).toBe('blocked');
    expect(action.guardrail_violations).toEqual([expect.objectContaining({ type: 'max_daily_change_pct' })]);
  });

  it('blocks a change targeting a protected campaign', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Propose Blocked Protected Org');
    const target = await seedTarget(organization.id, project.id, owner.id, 100);
    await setAutomationGuardrailPolicy({
      organizationId: organization.id,
      projectId: project.id,
      maxDailyBudgetChangePct: null,
      spendCeilingUsd: null,
      protectedTargetIds: [target.id],
      allowedHours: null,
      maxActionsPerDay: null,
      maxGuardedMetricRegressionPct: null,
      setByUserId: owner.id,
    });

    const action = await proposeAutomationBudgetChangeAction({
      organizationId: organization.id,
      projectId: project.id,
      targetId: target.id,
      afterDailyBudgetUsd: 105,
      requestedByUserId: owner.id,
    });

    expect(action.status).toBe('blocked');
    expect(action.guardrail_violations).toEqual([expect.objectContaining({ type: 'protected_target' })]);
  });

  it('rejects a target that has not been seeded', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Propose Missing Target Org');
    await expect(
      proposeAutomationBudgetChangeAction({
        organizationId: organization.id,
        projectId: project.id,
        targetId: 'does-not-exist',
        afterDailyBudgetUsd: 10,
        requestedByUserId: owner.id,
      }),
    ).rejects.toThrow(AutomationTargetNotFoundError);
  });

  it('records an audit log entry', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Propose Audit Org');
    const target = await seedTarget(organization.id, project.id, owner.id);
    await proposeAutomationBudgetChangeAction({
      organizationId: organization.id,
      projectId: project.id,
      targetId: target.id,
      afterDailyBudgetUsd: 110,
      requestedByUserId: owner.id,
    });

    const entries = await listAuditLogEntriesForOrg(organization.id);
    expect(entries.find((entry) => entry.action === 'automation_action.propose')).toBeDefined();
  });
});

describe('approveAutomationAction / rejectAutomationAction', () => {
  it('approves an awaiting_approval action', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Approve Org');
    const target = await seedTarget(organization.id, project.id, owner.id);
    const proposed = await proposeAutomationBudgetChangeAction({
      organizationId: organization.id,
      projectId: project.id,
      targetId: target.id,
      afterDailyBudgetUsd: 110,
      requestedByUserId: owner.id,
    });

    const approved = await approveAutomationAction({ organizationId: organization.id, projectId: project.id, actionId: proposed.id, approverId: owner.id });
    expect(approved.status).toBe('approved');
    expect(approved.approved_by_user_id).toBe(owner.id);
  });

  it('refuses to approve a blocked action', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Approve Blocked Org');
    const target = await seedTarget(organization.id, project.id, owner.id);
    await setAutomationGuardrailPolicy({
      organizationId: organization.id,
      projectId: project.id,
      maxDailyBudgetChangePct: null,
      spendCeilingUsd: null,
      protectedTargetIds: [target.id],
      allowedHours: null,
      maxActionsPerDay: null,
      maxGuardedMetricRegressionPct: null,
      setByUserId: owner.id,
    });
    const blocked = await proposeAutomationBudgetChangeAction({
      organizationId: organization.id,
      projectId: project.id,
      targetId: target.id,
      afterDailyBudgetUsd: 110,
      requestedByUserId: owner.id,
    });

    await expect(
      approveAutomationAction({ organizationId: organization.id, projectId: project.id, actionId: blocked.id, approverId: owner.id }),
    ).rejects.toThrow(AutomationActionInvalidStateError);
  });

  it('rejects a blocked or awaiting_approval action', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Reject Org');
    const target = await seedTarget(organization.id, project.id, owner.id);
    const proposed = await proposeAutomationBudgetChangeAction({
      organizationId: organization.id,
      projectId: project.id,
      targetId: target.id,
      afterDailyBudgetUsd: 110,
      requestedByUserId: owner.id,
    });

    const rejected = await rejectAutomationAction({ organizationId: organization.id, projectId: project.id, actionId: proposed.id, rejectedByUserId: owner.id });
    expect(rejected.status).toBe('rejected');
  });

  it('rejects an unknown action id (KAN-26 non-enumeration posture)', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Missing Action Org');
    await expect(
      approveAutomationAction({ organizationId: organization.id, projectId: project.id, actionId: 'does-not-exist', approverId: owner.id }),
    ).rejects.toThrow(AutomationActionNotFoundError);
  });

  it('does not leak a sibling project’s action within the same org', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Action Isolation Org');
    const { project: otherProject } = await createProject({ organizationId: organization.id, name: 'Mobile App' });
    const target = await seedTarget(organization.id, project.id, owner.id);
    const proposed = await proposeAutomationBudgetChangeAction({
      organizationId: organization.id,
      projectId: project.id,
      targetId: target.id,
      afterDailyBudgetUsd: 110,
      requestedByUserId: owner.id,
    });

    await expect(
      approveAutomationAction({ organizationId: organization.id, projectId: otherProject.id, actionId: proposed.id, approverId: owner.id }),
    ).rejects.toThrow(AutomationActionNotFoundError);
  });
});

describe('executeAutomationAction / rollbackAutomationAction / verifyAutomationAction', () => {
  it('executes an approved action and actually mutates the simulated target state', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Execute Org');
    const target = await seedTarget(organization.id, project.id, owner.id, 100);
    const proposed = await proposeAutomationBudgetChangeAction({
      organizationId: organization.id,
      projectId: project.id,
      targetId: target.id,
      afterDailyBudgetUsd: 120,
      requestedByUserId: owner.id,
    });
    await approveAutomationAction({ organizationId: organization.id, projectId: project.id, actionId: proposed.id, approverId: owner.id });

    const executed = await executeAutomationAction({
      organizationId: organization.id,
      projectId: project.id,
      actionId: proposed.id,
      executedByUserId: owner.id,
    });

    expect(executed.status).toBe('executed');
    expect(executed.execute_attempts).toBe(1);
    const [reloadedTarget] = await listAutomationTargetStatesForProject(organization.id, project.id);
    expect(reloadedTarget.daily_budget_usd).toBe(120);
  });

  it('refuses to execute an action that is not approved', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Execute Not Approved Org');
    const target = await seedTarget(organization.id, project.id, owner.id);
    const proposed = await proposeAutomationBudgetChangeAction({
      organizationId: organization.id,
      projectId: project.id,
      targetId: target.id,
      afterDailyBudgetUsd: 110,
      requestedByUserId: owner.id,
    });

    await expect(
      executeAutomationAction({ organizationId: organization.id, projectId: project.id, actionId: proposed.id, executedByUserId: owner.id }),
    ).rejects.toThrow(AutomationActionInvalidStateError);
  });

  it('rolls back an executed action, restoring the target’s prior budget', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Manual Rollback Org');
    const target = await seedTarget(organization.id, project.id, owner.id, 100);
    const proposed = await proposeAutomationBudgetChangeAction({
      organizationId: organization.id,
      projectId: project.id,
      targetId: target.id,
      afterDailyBudgetUsd: 120,
      requestedByUserId: owner.id,
    });
    await approveAutomationAction({ organizationId: organization.id, projectId: project.id, actionId: proposed.id, approverId: owner.id });
    await executeAutomationAction({ organizationId: organization.id, projectId: project.id, actionId: proposed.id, executedByUserId: owner.id });

    const rolledBack = await rollbackAutomationAction({
      organizationId: organization.id,
      projectId: project.id,
      actionId: proposed.id,
      reason: 'manual',
      actorId: owner.id,
    });

    expect(rolledBack.status).toBe('rolled_back');
    expect(rolledBack.rollback_reason).toBe('manual');
    const [reloadedTarget] = await listAutomationTargetStatesForProject(organization.id, project.id);
    expect(reloadedTarget.daily_budget_usd).toBe(100);
  });

  it('verifies a clean action with no regression', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Verify Clean Org');
    const target = await seedTarget(organization.id, project.id, owner.id, 100);
    const proposed = await proposeAutomationBudgetChangeAction({
      organizationId: organization.id,
      projectId: project.id,
      targetId: target.id,
      afterDailyBudgetUsd: 120,
      requestedByUserId: owner.id,
    });
    await approveAutomationAction({ organizationId: organization.id, projectId: project.id, actionId: proposed.id, approverId: owner.id });
    await executeAutomationAction({ organizationId: organization.id, projectId: project.id, actionId: proposed.id, executedByUserId: owner.id });

    const verified = await verifyAutomationAction({
      organizationId: organization.id,
      projectId: project.id,
      actionId: proposed.id,
      verifiedByUserId: owner.id,
      guardedMetricBefore: 100,
      guardedMetricAfter: 105,
    });

    expect(verified.status).toBe('verified');
    const [reloadedTarget] = await listAutomationTargetStatesForProject(organization.id, project.id);
    expect(reloadedTarget.daily_budget_usd).toBe(120);
  });

  it('rejects a non-finite guarded metric value instead of silently skipping the regression check', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Verify NaN Guard Org');
    const target = await seedTarget(organization.id, project.id, owner.id, 100);
    const proposed = await proposeAutomationBudgetChangeAction({
      organizationId: organization.id,
      projectId: project.id,
      targetId: target.id,
      afterDailyBudgetUsd: 120,
      requestedByUserId: owner.id,
    });
    await approveAutomationAction({ organizationId: organization.id, projectId: project.id, actionId: proposed.id, approverId: owner.id });
    await executeAutomationAction({ organizationId: organization.id, projectId: project.id, actionId: proposed.id, executedByUserId: owner.id });

    await expect(
      verifyAutomationAction({
        organizationId: organization.id,
        projectId: project.id,
        actionId: proposed.id,
        verifiedByUserId: owner.id,
        guardedMetricBefore: Number.NaN,
        guardedMetricAfter: 105,
      }),
    ).rejects.toThrow(InvalidAutomationActionError);
  });

  it('auto-rolls back when the guarded metric regresses past the policy threshold — restoring the target’s prior budget', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Verify Auto Rollback Org');
    await setAutomationGuardrailPolicy({
      organizationId: organization.id,
      projectId: project.id,
      maxDailyBudgetChangePct: null,
      spendCeilingUsd: null,
      protectedTargetIds: [],
      allowedHours: null,
      maxActionsPerDay: null,
      maxGuardedMetricRegressionPct: 10,
      setByUserId: owner.id,
    });
    const target = await seedTarget(organization.id, project.id, owner.id, 100);
    const proposed = await proposeAutomationBudgetChangeAction({
      organizationId: organization.id,
      projectId: project.id,
      targetId: target.id,
      afterDailyBudgetUsd: 120,
      requestedByUserId: owner.id,
    });
    await approveAutomationAction({ organizationId: organization.id, projectId: project.id, actionId: proposed.id, approverId: owner.id });
    await executeAutomationAction({ organizationId: organization.id, projectId: project.id, actionId: proposed.id, executedByUserId: owner.id });

    // Guarded metric (e.g. conversions) dropped from 100 to 70 — a 30% regression, past the 10% threshold.
    const verified = await verifyAutomationAction({
      organizationId: organization.id,
      projectId: project.id,
      actionId: proposed.id,
      verifiedByUserId: owner.id,
      guardedMetricBefore: 100,
      guardedMetricAfter: 70,
    });

    expect(verified.status).toBe('rolled_back');
    expect(verified.rollback_reason).toBe('guardrail_regression');
    const [reloadedTarget] = await listAutomationTargetStatesForProject(organization.id, project.id);
    expect(reloadedTarget.daily_budget_usd).toBe(100);

    const entries = await listAuditLogEntriesForOrg(organization.id);
    expect(entries.find((entry) => entry.action === 'automation_action.rollback')).toBeDefined();
  });
});

describe('automation kill switch', () => {
  it('defaults to disengaged', async () => {
    const { organization } = await setupOrgWithProject('Kill Switch Default Org');
    expect(await getAutomationKillSwitchStatus(organization.id)).toEqual({ engaged: false });
  });

  it('blocks approval and execution once engaged, and adds an automation_paused violation at propose time', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Kill Switch Engaged Org');
    const target = await seedTarget(organization.id, project.id, owner.id);
    const proposed = await proposeAutomationBudgetChangeAction({
      organizationId: organization.id,
      projectId: project.id,
      targetId: target.id,
      afterDailyBudgetUsd: 110,
      requestedByUserId: owner.id,
    });
    await approveAutomationAction({ organizationId: organization.id, projectId: project.id, actionId: proposed.id, approverId: owner.id });

    await engageAutomationKillSwitch({ organizationId: organization.id, reason: 'Incident #1', actorId: owner.id });

    await expect(
      executeAutomationAction({ organizationId: organization.id, projectId: project.id, actionId: proposed.id, executedByUserId: owner.id }),
    ).rejects.toThrow(AutomationKillSwitchEngagedError);

    const blockedProposal = await proposeAutomationBudgetChangeAction({
      organizationId: organization.id,
      projectId: project.id,
      targetId: target.id,
      afterDailyBudgetUsd: 120,
      requestedByUserId: owner.id,
    });
    expect(blockedProposal.status).toBe('blocked');
    expect(blockedProposal.guardrail_violations).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'automation_paused' })]));
  });

  it('allows automation again once disengaged', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Kill Switch Disengaged Org');
    const target = await seedTarget(organization.id, project.id, owner.id);
    await engageAutomationKillSwitch({ organizationId: organization.id, reason: 'Incident #2', actorId: owner.id });
    await disengageAutomationKillSwitch({ organizationId: organization.id, actorId: owner.id });

    expect(await getAutomationKillSwitchStatus(organization.id)).toEqual({ engaged: false });

    const proposed = await proposeAutomationBudgetChangeAction({
      organizationId: organization.id,
      projectId: project.id,
      targetId: target.id,
      afterDailyBudgetUsd: 110,
      requestedByUserId: owner.id,
    });
    expect(proposed.status).toBe('awaiting_approval');
  });
});

describe('listAutomationActionsForProject', () => {
  it('lists a project’s actions newest-proposal-first', async () => {
    const { owner, organization, project } = await setupOrgWithProject('List Actions Org');
    const target = await seedTarget(organization.id, project.id, owner.id);
    const first = await proposeAutomationBudgetChangeAction({
      organizationId: organization.id,
      projectId: project.id,
      targetId: target.id,
      afterDailyBudgetUsd: 105,
      requestedByUserId: owner.id,
    });
    const second = await proposeAutomationBudgetChangeAction({
      organizationId: organization.id,
      projectId: project.id,
      targetId: target.id,
      afterDailyBudgetUsd: 108,
      requestedByUserId: owner.id,
    });

    const actions = await listAutomationActionsForProject(organization.id, project.id);
    expect(actions.map((action) => action.id)).toEqual([second.id, first.id]);
  });
});

describe('write-tier gating (KAN-74)', () => {
  it('blocks a proposal with an insufficient_write_tier violation when the linked connection is at the default "read" tier', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Tier Read Org');
    const { target } = await seedTargetWithConnection(organization.id, project.id, owner.id, 'read');

    const action = await proposeAutomationBudgetChangeAction({
      organizationId: organization.id,
      projectId: project.id,
      targetId: target.id,
      afterDailyBudgetUsd: 110,
      requestedByUserId: owner.id,
    });

    expect(action.status).toBe('blocked');
    expect(action.guardrail_violations).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'insufficient_write_tier' })]));
  });

  it('allows a proposal to proceed once the connection is at the "optimize" tier', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Tier Optimize Org');
    const { target } = await seedTargetWithConnection(organization.id, project.id, owner.id, 'optimize');

    const action = await proposeAutomationBudgetChangeAction({
      organizationId: organization.id,
      projectId: project.id,
      targetId: target.id,
      afterDailyBudgetUsd: 110,
      requestedByUserId: owner.id,
    });

    expect(action.status).toBe('awaiting_approval');
    expect(action.guardrail_violations).toEqual([]);
  });

  it('does not gate a target with no linked connection at all (pre-KAN-74 ungated demo posture)', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Tier Ungated Org');
    const target = await seedTarget(organization.id, project.id, owner.id);

    const action = await proposeAutomationBudgetChangeAction({
      organizationId: organization.id,
      projectId: project.id,
      targetId: target.id,
      afterDailyBudgetUsd: 110,
      requestedByUserId: owner.id,
    });

    expect(action.status).toBe('awaiting_approval');
  });

  it('a tier downgrade after approval immediately blocks execution — revocation takes effect right away', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Tier Downgrade Execute Org');
    const { target, attachment } = await seedTargetWithConnection(organization.id, project.id, owner.id, 'manage');

    const proposed = await proposeAutomationBudgetChangeAction({
      organizationId: organization.id,
      projectId: project.id,
      targetId: target.id,
      afterDailyBudgetUsd: 120,
      requestedByUserId: owner.id,
    });
    expect(proposed.status).toBe('awaiting_approval');
    const approved = await approveAutomationAction({ organizationId: organization.id, projectId: project.id, actionId: proposed.id, approverId: owner.id });
    expect(approved.status).toBe('approved');

    // Downgrade the connection back to "read" after approval, before execution.
    await setResourceAttachmentWriteTier({ organizationId: organization.id, attachmentId: attachment.id, tier: 'read', actorId: owner.id });

    await expect(
      executeAutomationAction({ organizationId: organization.id, projectId: project.id, actionId: proposed.id, executedByUserId: owner.id }),
    ).rejects.toThrow(InsufficientWriteTierError);
  });

  it('a tier downgrade after propose immediately blocks approval', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Tier Downgrade Approve Org');
    const { target, attachment } = await seedTargetWithConnection(organization.id, project.id, owner.id, 'optimize');

    const proposed = await proposeAutomationBudgetChangeAction({
      organizationId: organization.id,
      projectId: project.id,
      targetId: target.id,
      afterDailyBudgetUsd: 110,
      requestedByUserId: owner.id,
    });
    expect(proposed.status).toBe('awaiting_approval');

    await setResourceAttachmentWriteTier({ organizationId: organization.id, attachmentId: attachment.id, tier: 'read', actorId: owner.id });

    await expect(
      approveAutomationAction({ organizationId: organization.id, projectId: project.id, actionId: proposed.id, approverId: owner.id }),
    ).rejects.toThrow(InsufficientWriteTierError);
  });
});

describe('proposeCampaignDraftCreateAction / proposeCampaignActivationAction (KAN-72)', () => {
  it('proposes a clean campaign draft as awaiting_approval with the dry-run diff', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Propose Draft Clean Org');
    const target = await seedTarget(organization.id, project.id, owner.id);
    const draft = campaignDraft();

    const action = await proposeCampaignDraftCreateAction({
      organizationId: organization.id,
      projectId: project.id,
      targetId: target.id,
      draft,
      requestedByUserId: owner.id,
    });

    expect(action.status).toBe('awaiting_approval');
    expect(action.action_type).toBe('campaign_draft_create');
    expect(action.before).toEqual({});
    expect(action.after).toEqual({ campaignDraft: draft });
    expect(action.guardrail_violations).toEqual([]);
  });

  it('rejects an invalid draft (too few RSA headlines) before touching guardrails', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Propose Draft Invalid Org');
    const target = await seedTarget(organization.id, project.id, owner.id);
    const draft = campaignDraft();
    draft.adGroups[0].responsiveSearchAd.headlines = ['Only One'];

    await expect(
      proposeCampaignDraftCreateAction({ organizationId: organization.id, projectId: project.id, targetId: target.id, draft, requestedByUserId: owner.id }),
    ).rejects.toThrow(InvalidAutomationActionError);
  });

  it('blocks a draft that exceeds the absolute spend ceiling', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Propose Draft Ceiling Org');
    const target = await seedTarget(organization.id, project.id, owner.id);
    await setAutomationGuardrailPolicy({
      organizationId: organization.id,
      projectId: project.id,
      maxDailyBudgetChangePct: null,
      spendCeilingUsd: 10,
      protectedTargetIds: [],
      allowedHours: null,
      maxActionsPerDay: null,
      maxGuardedMetricRegressionPct: null,
      setByUserId: owner.id,
    });

    const action = await proposeCampaignDraftCreateAction({
      organizationId: organization.id,
      projectId: project.id,
      targetId: target.id,
      draft: campaignDraft({ dailyBudgetUsd: 25 }),
      requestedByUserId: owner.id,
    });

    expect(action.status).toBe('blocked');
    expect(action.guardrail_violations).toEqual([expect.objectContaining({ type: 'spend_ceiling' })]);
  });

  it('requires the "manage" write tier specifically — "optimize" is not enough', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Propose Draft Optimize Org');
    const { target } = await seedTargetWithConnection(organization.id, project.id, owner.id, 'optimize');

    const action = await proposeCampaignDraftCreateAction({
      organizationId: organization.id,
      projectId: project.id,
      targetId: target.id,
      draft: campaignDraft(),
      requestedByUserId: owner.id,
    });

    expect(action.status).toBe('blocked');
    expect(action.guardrail_violations).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'insufficient_write_tier' })]));
  });

  it('allows a draft to proceed at the "manage" write tier', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Propose Draft Manage Org');
    const { target } = await seedTargetWithConnection(organization.id, project.id, owner.id, 'manage');

    const action = await proposeCampaignDraftCreateAction({
      organizationId: organization.id,
      projectId: project.id,
      targetId: target.id,
      draft: campaignDraft(),
      requestedByUserId: owner.id,
    });

    expect(action.status).toBe('awaiting_approval');
  });

  it('refuses to propose a second draft against a target that already has a campaign', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Propose Draft Twice Org');
    const target = await seedTarget(organization.id, project.id, owner.id);
    const first = await proposeCampaignDraftCreateAction({
      organizationId: organization.id,
      projectId: project.id,
      targetId: target.id,
      draft: campaignDraft(),
      requestedByUserId: owner.id,
    });
    await approveAutomationAction({ organizationId: organization.id, projectId: project.id, actionId: first.id, approverId: owner.id });
    await executeAutomationAction({ organizationId: organization.id, projectId: project.id, actionId: first.id, executedByUserId: owner.id });

    await expect(
      proposeCampaignDraftCreateAction({
        organizationId: organization.id,
        projectId: project.id,
        targetId: target.id,
        draft: campaignDraft(),
        requestedByUserId: owner.id,
      }),
    ).rejects.toThrow(InvalidAutomationActionError);
  });

  it('executes a campaign draft creation end to end, then rolls it back — the full lifecycle plus rollback restoring "no campaign"', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Draft Lifecycle Org');
    const target = await seedTarget(organization.id, project.id, owner.id, 0);
    const draft = campaignDraft({ dailyBudgetUsd: 40 });

    const proposed = await proposeCampaignDraftCreateAction({
      organizationId: organization.id,
      projectId: project.id,
      targetId: target.id,
      draft,
      requestedByUserId: owner.id,
    });
    await approveAutomationAction({ organizationId: organization.id, projectId: project.id, actionId: proposed.id, approverId: owner.id });
    const executed = await executeAutomationAction({
      organizationId: organization.id,
      projectId: project.id,
      actionId: proposed.id,
      executedByUserId: owner.id,
    });
    expect(executed.status).toBe('executed');

    const [afterExecute] = await listAutomationTargetStatesForProject(organization.id, project.id);
    expect(afterExecute.campaign_status).toBe('paused');
    expect(afterExecute.campaign_resource_name).toBeTruthy();
    expect(afterExecute.daily_budget_usd).toBe(40);

    const rolledBack = await rollbackAutomationAction({
      organizationId: organization.id,
      projectId: project.id,
      actionId: proposed.id,
      reason: 'manual',
      actorId: owner.id,
    });
    expect(rolledBack.status).toBe('rolled_back');

    const [afterRollback] = await listAutomationTargetStatesForProject(organization.id, project.id);
    expect(afterRollback.campaign_status).toBe('removed');
  });

  it('activates an already-created paused campaign, then rolls the activation back to paused', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Activation Lifecycle Org');
    const target = await seedTarget(organization.id, project.id, owner.id, 0);
    const created = await proposeCampaignDraftCreateAction({
      organizationId: organization.id,
      projectId: project.id,
      targetId: target.id,
      draft: campaignDraft(),
      requestedByUserId: owner.id,
    });
    await approveAutomationAction({ organizationId: organization.id, projectId: project.id, actionId: created.id, approverId: owner.id });
    await executeAutomationAction({ organizationId: organization.id, projectId: project.id, actionId: created.id, executedByUserId: owner.id });

    const activation = await proposeCampaignActivationAction({
      organizationId: organization.id,
      projectId: project.id,
      targetId: target.id,
      requestedByUserId: owner.id,
    });
    expect(activation.status).toBe('awaiting_approval');
    expect(activation.action_type).toBe('campaign_activation');
    expect(activation.before).toEqual({ status: 'paused' });
    expect(activation.after).toEqual({ status: 'enabled' });

    await approveAutomationAction({ organizationId: organization.id, projectId: project.id, actionId: activation.id, approverId: owner.id });
    await executeAutomationAction({ organizationId: organization.id, projectId: project.id, actionId: activation.id, executedByUserId: owner.id });

    const [afterActivate] = await listAutomationTargetStatesForProject(organization.id, project.id);
    expect(afterActivate.campaign_status).toBe('enabled');

    await rollbackAutomationAction({ organizationId: organization.id, projectId: project.id, actionId: activation.id, reason: 'manual', actorId: owner.id });

    const [afterRollback] = await listAutomationTargetStatesForProject(organization.id, project.id);
    expect(afterRollback.campaign_status).toBe('paused');
  });

  it('refuses to propose an activation for a target with no campaign created yet', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Activation No Campaign Org');
    const target = await seedTarget(organization.id, project.id, owner.id);

    await expect(
      proposeCampaignActivationAction({ organizationId: organization.id, projectId: project.id, targetId: target.id, requestedByUserId: owner.id }),
    ).rejects.toThrow(InvalidAutomationActionError);
  });

  it('requires the "manage" write tier for activation too — "optimize" is not enough', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Activation Optimize Org');
    const { target, attachment } = await seedTargetWithConnection(organization.id, project.id, owner.id, 'manage');
    const created = await proposeCampaignDraftCreateAction({
      organizationId: organization.id,
      projectId: project.id,
      targetId: target.id,
      draft: campaignDraft(),
      requestedByUserId: owner.id,
    });
    await approveAutomationAction({ organizationId: organization.id, projectId: project.id, actionId: created.id, approverId: owner.id });
    await executeAutomationAction({ organizationId: organization.id, projectId: project.id, actionId: created.id, executedByUserId: owner.id });

    await setResourceAttachmentWriteTier({ organizationId: organization.id, attachmentId: attachment.id, tier: 'optimize', actorId: owner.id });

    const activation = await proposeCampaignActivationAction({
      organizationId: organization.id,
      projectId: project.id,
      targetId: target.id,
      requestedByUserId: owner.id,
    });
    expect(activation.status).toBe('blocked');
    expect(activation.guardrail_violations).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'insufficient_write_tier' })]));
  });
});
