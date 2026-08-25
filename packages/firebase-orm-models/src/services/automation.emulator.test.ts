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
  proposeAdEditAction,
  proposeAutomationBudgetChangeAction,
  proposeCampaignActivationAction,
  proposeCampaignDraftCreateAction,
  proposeKeywordEditAction,
  proposeMetaAdSetEditAction,
  rejectAutomationAction,
  requestResourceAttachment,
  rollbackAutomationAction,
  setAutomationGuardrailPolicy,
  setResourceAttachmentWriteTier,
  verifyAutomationAction,
  type CampaignDraft,
  type CampaignDraftKeyword,
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

function metaCampaignDraft(overrides: Partial<CampaignDraft> = {}): CampaignDraft {
  return {
    platform: 'meta',
    campaignName: 'Winning Themes',
    objective: 'OUTCOME_TRAFFIC',
    dailyBudgetUsd: 25,
    adSets: [
      {
        name: 'Ad Set 1',
        targeting: { countries: ['US'], ageMin: 18, ageMax: 45 },
        ad: {
          name: 'Ad 1',
          creative: { primaryText: 'Big summer savings.', headline: 'Blue Widgets Sale', linkUrl: 'https://example.com/widgets' },
        },
      },
    ],
    ...overrides,
  } as CampaignDraft;
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

    const entries = await listAuditLogEntriesForOrg(organization.id);
    const seedEntries = entries.filter((entry) => entry.action === 'automation_target.seed' && entry.target_id === first.id);
    expect(seedEntries).toHaveLength(1);
    expect(seedEntries[0].actor_id).toBe(owner.id);
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

describe('setAutomationGuardrailPolicy input validation', () => {
  // A fully-valid baseline — every negative/invalid-input test below overrides exactly one field,
  // so a thrown error can only be attributed to the field under test rather than some other one
  // also being invalid.
  function validPolicyParams(organizationId: string, projectId: string, setByUserId: string) {
    return {
      organizationId,
      projectId,
      maxDailyBudgetChangePct: 25,
      spendCeilingUsd: 500,
      protectedTargetIds: [],
      allowedHours: null as { startHourUtc: number; endHourUtc: number } | null,
      maxActionsPerDay: 10,
      maxGuardedMetricRegressionPct: 20,
      setByUserId,
    };
  }

  it('rejects a negative maxDailyBudgetChangePct', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Guardrail Validation Neg Pct Org');
    await expect(
      setAutomationGuardrailPolicy({ ...validPolicyParams(organization.id, project.id, owner.id), maxDailyBudgetChangePct: -1 }),
    ).rejects.toThrow(InvalidAutomationActionError);
  });

  it('rejects a non-finite maxDailyBudgetChangePct', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Guardrail Validation NaN Pct Org');
    await expect(
      setAutomationGuardrailPolicy({
        ...validPolicyParams(organization.id, project.id, owner.id),
        maxDailyBudgetChangePct: Number.POSITIVE_INFINITY,
      }),
    ).rejects.toThrow(InvalidAutomationActionError);
  });

  it('rejects a negative spendCeilingUsd', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Guardrail Validation Neg Ceiling Org');
    await expect(
      setAutomationGuardrailPolicy({ ...validPolicyParams(organization.id, project.id, owner.id), spendCeilingUsd: -100 }),
    ).rejects.toThrow(InvalidAutomationActionError);
  });

  it('rejects a negative maxActionsPerDay', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Guardrail Validation Neg Actions Org');
    await expect(
      setAutomationGuardrailPolicy({ ...validPolicyParams(organization.id, project.id, owner.id), maxActionsPerDay: -1 }),
    ).rejects.toThrow(InvalidAutomationActionError);
  });

  it('rejects a negative maxGuardedMetricRegressionPct', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Guardrail Validation Neg Regression Org');
    await expect(
      setAutomationGuardrailPolicy({
        ...validPolicyParams(organization.id, project.id, owner.id),
        maxGuardedMetricRegressionPct: -5,
      }),
    ).rejects.toThrow(InvalidAutomationActionError);
  });

  it('rejects non-integer allowedHours bounds', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Guardrail Validation Fractional Hours Org');
    await expect(
      setAutomationGuardrailPolicy({
        ...validPolicyParams(organization.id, project.id, owner.id),
        allowedHours: { startHourUtc: 9.5, endHourUtc: 17 },
      }),
    ).rejects.toThrow(InvalidAutomationActionError);
  });

  it('rejects an out-of-range allowedHours start hour', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Guardrail Validation Negative Hour Org');
    await expect(
      setAutomationGuardrailPolicy({
        ...validPolicyParams(organization.id, project.id, owner.id),
        allowedHours: { startHourUtc: -1, endHourUtc: 17 },
      }),
    ).rejects.toThrow(InvalidAutomationActionError);
  });

  it('rejects an out-of-range allowedHours end hour', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Guardrail Validation Hour Overflow Org');
    await expect(
      setAutomationGuardrailPolicy({
        ...validPolicyParams(organization.id, project.id, owner.id),
        allowedHours: { startHourUtc: 9, endHourUtc: 24 },
      }),
    ).rejects.toThrow(InvalidAutomationActionError);
  });

  it('accepts equal start/end allowedHours as "the whole day" rather than rejecting it', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Guardrail Validation Equal Hours Org');
    const policy = await setAutomationGuardrailPolicy({
      ...validPolicyParams(organization.id, project.id, owner.id),
      allowedHours: { startHourUtc: 9, endHourUtc: 9 },
    });
    expect(policy.allowed_hours_start_hour_utc).toBe(9);
    expect(policy.allowed_hours_end_hour_utc).toBe(9);
  });

  it('persists every field of a fully-populated policy and records an audit log entry', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Guardrail Validation Persist Org');
    const policy = await setAutomationGuardrailPolicy(validPolicyParams(organization.id, project.id, owner.id));

    expect(policy.max_daily_budget_change_pct).toBe(25);
    expect(policy.spend_ceiling_usd).toBe(500);
    expect(policy.max_actions_per_day).toBe(10);
    expect(policy.max_guarded_metric_regression_pct).toBe(20);
    expect(policy.allowed_hours_start_hour_utc).toBeNull();
    expect(policy.allowed_hours_end_hour_utc).toBeNull();

    const entries = await listAuditLogEntriesForOrg(organization.id);
    expect(entries.find((entry) => entry.action === 'automation_guardrail_policy.set')).toBeDefined();
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

  it('no state-machine entry point can reach "executed" except executeAutomationAction on an approved action — the manual-approval invariant', async () => {
    // Real ad spend is only ever touched once a human has clicked Approve. This test sweeps every
    // transition function against a freshly-proposed (awaiting_approval) and a blocked action and
    // asserts none of them can advance straight to "executed", skipping approval. A future change
    // that loosens `requireStatus` in `executeAutomationAction` (e.g. to also accept
    // "awaiting_approval") would be caught here even though the two narrower tests above
    // ("refuses to execute...", "refuses to approve a blocked action") wouldn't necessarily catch
    // every such regression on their own.
    const { owner, organization, project } = await setupOrgWithProject('Invariant Sweep Org');
    const target = await seedTarget(organization.id, project.id, owner.id, 100);
    const awaitingApproval = await proposeAutomationBudgetChangeAction({
      organizationId: organization.id,
      projectId: project.id,
      targetId: target.id,
      afterDailyBudgetUsd: 110,
      requestedByUserId: owner.id,
    });
    expect(awaitingApproval.status).toBe('awaiting_approval');

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
      afterDailyBudgetUsd: 105,
      requestedByUserId: owner.id,
    });
    expect(blocked.status).toBe('blocked');

    for (const action of [awaitingApproval, blocked]) {
      await expect(
        executeAutomationAction({ organizationId: organization.id, projectId: project.id, actionId: action.id, executedByUserId: owner.id }),
      ).rejects.toThrow(AutomationActionInvalidStateError);
      await expect(
        rollbackAutomationAction({ organizationId: organization.id, projectId: project.id, actionId: action.id, reason: 'manual', actorId: owner.id }),
      ).rejects.toThrow(AutomationActionInvalidStateError);
      await expect(
        verifyAutomationAction({ organizationId: organization.id, projectId: project.id, actionId: action.id }),
      ).rejects.toThrow(AutomationActionInvalidStateError);
    }

    // Confirm the one legitimate path still works: approve, then execute reaches "executed".
    const approved = await approveAutomationAction({ organizationId: organization.id, projectId: project.id, actionId: awaitingApproval.id, approverId: owner.id });
    expect(approved.status).toBe('approved');
    const executed = await executeAutomationAction({ organizationId: organization.id, projectId: project.id, actionId: approved.id, executedByUserId: owner.id });
    expect(executed.status).toBe('executed');
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

describe('proposeKeywordEditAction (KAN-72 follow-up)', () => {
  /** Seeds a target and executes a `campaign_draft_create` against it, so `ad_group_resource_names` is populated (via the simulated executor, same posture every other keyword-edit test in this block relies on). */
  async function seedTargetWithCreatedCampaign(organizationId: string, projectId: string, ownerId: string) {
    const target = await seedTarget(organizationId, projectId, ownerId, 0);
    const created = await proposeCampaignDraftCreateAction({
      organizationId,
      projectId,
      targetId: target.id,
      draft: campaignDraft(),
      requestedByUserId: ownerId,
    });
    await approveAutomationAction({ organizationId, projectId, actionId: created.id, approverId: ownerId });
    await executeAutomationAction({ organizationId, projectId, actionId: created.id, executedByUserId: ownerId });
    const [reloaded] = await listAutomationTargetStatesForProject(organizationId, projectId);
    return reloaded;
  }

  it('proposes a clean keyword edit as awaiting_approval with the dry-run diff', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Propose Keyword Edit Clean Org');
    const target = await seedTargetWithCreatedCampaign(organization.id, project.id, owner.id);
    const adGroupResourceName = target.ad_group_resource_names?.[0] as string;

    const action = await proposeKeywordEditAction({
      organizationId: organization.id,
      projectId: project.id,
      targetId: target.id,
      adGroupResourceName,
      addKeywords: [{ text: 'blue widgets', matchType: 'PHRASE' }],
      addNegativeKeywords: [{ text: 'free', matchType: 'BROAD' }],
      requestedByUserId: owner.id,
    });

    expect(action.status).toBe('awaiting_approval');
    expect(action.action_type).toBe('keyword_edit');
    expect(action.before).toEqual({ adGroupResourceName });
    expect(action.after).toEqual({
      adGroupResourceName,
      addKeywords: [{ text: 'blue widgets', matchType: 'PHRASE' }],
      addNegativeKeywords: [{ text: 'free', matchType: 'BROAD' }],
    });
    expect(action.guardrail_violations).toEqual([]);
  });

  it('rejects an invalid edit (bad match type) before touching guardrails', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Propose Keyword Edit Invalid Org');
    const target = await seedTargetWithCreatedCampaign(organization.id, project.id, owner.id);
    const adGroupResourceName = target.ad_group_resource_names?.[0] as string;

    await expect(
      proposeKeywordEditAction({
        organizationId: organization.id,
        projectId: project.id,
        targetId: target.id,
        adGroupResourceName,
        addKeywords: [{ text: 'blue widgets', matchType: 'FUZZY' } as unknown as CampaignDraftKeyword],
        addNegativeKeywords: [],
        requestedByUserId: owner.id,
      }),
    ).rejects.toThrow(InvalidAutomationActionError);
  });

  it('rejects a no-op edit with neither keywords nor negative keywords', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Propose Keyword Edit Empty Org');
    const target = await seedTargetWithCreatedCampaign(organization.id, project.id, owner.id);
    const adGroupResourceName = target.ad_group_resource_names?.[0] as string;

    await expect(
      proposeKeywordEditAction({
        organizationId: organization.id,
        projectId: project.id,
        targetId: target.id,
        adGroupResourceName,
        addKeywords: [],
        addNegativeKeywords: [],
        requestedByUserId: owner.id,
      }),
    ).rejects.toThrow(InvalidAutomationActionError);
  });

  it('refuses an ad group resource name that is not one of this target\'s own ad groups', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Propose Keyword Edit Wrong AdGroup Org');
    const target = await seedTargetWithCreatedCampaign(organization.id, project.id, owner.id);

    await expect(
      proposeKeywordEditAction({
        organizationId: organization.id,
        projectId: project.id,
        targetId: target.id,
        adGroupResourceName: 'customers/999/adGroups/not-this-targets',
        addKeywords: [{ text: 'blue widgets', matchType: 'PHRASE' }],
        addNegativeKeywords: [],
        requestedByUserId: owner.id,
      }),
    ).rejects.toThrow(InvalidAutomationActionError);
  });

  it('refuses a target with no campaign (and so no ad groups) created yet', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Propose Keyword Edit No Campaign Org');
    const target = await seedTarget(organization.id, project.id, owner.id);

    await expect(
      proposeKeywordEditAction({
        organizationId: organization.id,
        projectId: project.id,
        targetId: target.id,
        adGroupResourceName: 'customers/999/adGroups/1',
        addKeywords: [{ text: 'blue widgets', matchType: 'PHRASE' }],
        addNegativeKeywords: [],
        requestedByUserId: owner.id,
      }),
    ).rejects.toThrow(InvalidAutomationActionError);
  });

  it('blocks a keyword edit targeting a protected campaign', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Propose Keyword Edit Protected Org');
    const target = await seedTargetWithCreatedCampaign(organization.id, project.id, owner.id);
    const adGroupResourceName = target.ad_group_resource_names?.[0] as string;
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

    const action = await proposeKeywordEditAction({
      organizationId: organization.id,
      projectId: project.id,
      targetId: target.id,
      adGroupResourceName,
      addKeywords: [{ text: 'blue widgets', matchType: 'PHRASE' }],
      addNegativeKeywords: [],
      requestedByUserId: owner.id,
    });

    expect(action.status).toBe('blocked');
    expect(action.guardrail_violations).toEqual([expect.objectContaining({ type: 'protected_target' })]);
  });

  it('requires the "manage" write tier specifically — "optimize" is not enough', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Propose Keyword Edit Optimize Org');
    const { target, attachment } = await seedTargetWithConnection(organization.id, project.id, owner.id, 'manage', 0);
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
    const [reloaded] = await listAutomationTargetStatesForProject(organization.id, project.id);

    const action = await proposeKeywordEditAction({
      organizationId: organization.id,
      projectId: project.id,
      targetId: target.id,
      adGroupResourceName: reloaded.ad_group_resource_names?.[0] as string,
      addKeywords: [{ text: 'blue widgets', matchType: 'PHRASE' }],
      addNegativeKeywords: [],
      requestedByUserId: owner.id,
    });

    expect(action.status).toBe('blocked');
    expect(action.guardrail_violations).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'insufficient_write_tier' })]));
  });

  it('executes a keyword edit end to end, widening the diff with the real added resource names, then rolls it back', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Keyword Edit Lifecycle Org');
    const target = await seedTargetWithCreatedCampaign(organization.id, project.id, owner.id);
    const adGroupResourceName = target.ad_group_resource_names?.[0] as string;

    const proposed = await proposeKeywordEditAction({
      organizationId: organization.id,
      projectId: project.id,
      targetId: target.id,
      adGroupResourceName,
      addKeywords: [{ text: 'blue widgets', matchType: 'PHRASE' }],
      addNegativeKeywords: [{ text: 'free', matchType: 'BROAD' }],
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
    const after = executed.after as { addedKeywordResourceNames?: string[]; addedNegativeKeywordResourceNames?: string[] };
    expect(after.addedKeywordResourceNames).toHaveLength(1);
    expect(after.addedNegativeKeywordResourceNames).toHaveLength(1);

    const rolledBack = await rollbackAutomationAction({
      organizationId: organization.id,
      projectId: project.id,
      actionId: proposed.id,
      reason: 'manual',
      actorId: owner.id,
    });
    expect(rolledBack.status).toBe('rolled_back');
  });
});

const EDITED_RESPONSIVE_SEARCH_AD = {
  headlines: ['New Headline One', 'New Headline Two', 'New Headline Three'],
  descriptions: ['New description one.', 'New description two.'],
  finalUrl: 'https://example.com/new-widgets',
};

describe('proposeAdEditAction (KAN-72 follow-up)', () => {
  /** Seeds a target and executes a `campaign_draft_create` against it, so `ad_resource_names` is populated (via the simulated executor). */
  async function seedTargetWithCreatedCampaign(organizationId: string, projectId: string, ownerId: string) {
    const target = await seedTarget(organizationId, projectId, ownerId, 0);
    const created = await proposeCampaignDraftCreateAction({
      organizationId,
      projectId,
      targetId: target.id,
      draft: campaignDraft(),
      requestedByUserId: ownerId,
    });
    await approveAutomationAction({ organizationId, projectId, actionId: created.id, approverId: ownerId });
    await executeAutomationAction({ organizationId, projectId, actionId: created.id, executedByUserId: ownerId });
    const [reloaded] = await listAutomationTargetStatesForProject(organizationId, projectId);
    return reloaded;
  }

  it('proposes a clean ad edit as awaiting_approval with the dry-run diff', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Propose Ad Edit Clean Org');
    const target = await seedTargetWithCreatedCampaign(organization.id, project.id, owner.id);
    const previousAdResourceName = target.ad_resource_names?.[0] as string;

    const action = await proposeAdEditAction({
      organizationId: organization.id,
      projectId: project.id,
      targetId: target.id,
      previousAdResourceName,
      responsiveSearchAd: EDITED_RESPONSIVE_SEARCH_AD,
      requestedByUserId: owner.id,
    });

    expect(action.status).toBe('awaiting_approval');
    expect(action.action_type).toBe('ad_edit');
    expect(action.before).toEqual({ previousAdResourceName });
    expect(action.after).toEqual({ previousAdResourceName, responsiveSearchAd: EDITED_RESPONSIVE_SEARCH_AD });
    expect(action.guardrail_violations).toEqual([]);
  });

  it('rejects an invalid edit (too few headlines) before touching guardrails', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Propose Ad Edit Invalid Org');
    const target = await seedTargetWithCreatedCampaign(organization.id, project.id, owner.id);
    const previousAdResourceName = target.ad_resource_names?.[0] as string;

    await expect(
      proposeAdEditAction({
        organizationId: organization.id,
        projectId: project.id,
        targetId: target.id,
        previousAdResourceName,
        responsiveSearchAd: { ...EDITED_RESPONSIVE_SEARCH_AD, headlines: ['Only One'] },
        requestedByUserId: owner.id,
      }),
    ).rejects.toThrow(InvalidAutomationActionError);
  });

  it('refuses an ad resource name that is not one of this target\'s own ads', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Propose Ad Edit Wrong Ad Org');
    const target = await seedTargetWithCreatedCampaign(organization.id, project.id, owner.id);

    await expect(
      proposeAdEditAction({
        organizationId: organization.id,
        projectId: project.id,
        targetId: target.id,
        previousAdResourceName: 'customers/999/adGroupAds/not-this-targets',
        responsiveSearchAd: EDITED_RESPONSIVE_SEARCH_AD,
        requestedByUserId: owner.id,
      }),
    ).rejects.toThrow(InvalidAutomationActionError);
  });

  it('refuses a target with no campaign (and so no ads) created yet', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Propose Ad Edit No Campaign Org');
    const target = await seedTarget(organization.id, project.id, owner.id);

    await expect(
      proposeAdEditAction({
        organizationId: organization.id,
        projectId: project.id,
        targetId: target.id,
        previousAdResourceName: 'customers/999/adGroupAds/1',
        responsiveSearchAd: EDITED_RESPONSIVE_SEARCH_AD,
        requestedByUserId: owner.id,
      }),
    ).rejects.toThrow(InvalidAutomationActionError);
  });

  it('blocks an ad edit targeting a protected campaign', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Propose Ad Edit Protected Org');
    const target = await seedTargetWithCreatedCampaign(organization.id, project.id, owner.id);
    const previousAdResourceName = target.ad_resource_names?.[0] as string;
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

    const action = await proposeAdEditAction({
      organizationId: organization.id,
      projectId: project.id,
      targetId: target.id,
      previousAdResourceName,
      responsiveSearchAd: EDITED_RESPONSIVE_SEARCH_AD,
      requestedByUserId: owner.id,
    });

    expect(action.status).toBe('blocked');
    expect(action.guardrail_violations).toEqual([expect.objectContaining({ type: 'protected_target' })]);
  });

  it('requires the "manage" write tier specifically — "optimize" is not enough', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Propose Ad Edit Optimize Org');
    const { target, attachment } = await seedTargetWithConnection(organization.id, project.id, owner.id, 'manage', 0);
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
    const [reloaded] = await listAutomationTargetStatesForProject(organization.id, project.id);

    const action = await proposeAdEditAction({
      organizationId: organization.id,
      projectId: project.id,
      targetId: target.id,
      previousAdResourceName: reloaded.ad_resource_names?.[0] as string,
      responsiveSearchAd: EDITED_RESPONSIVE_SEARCH_AD,
      requestedByUserId: owner.id,
    });

    expect(action.status).toBe('blocked');
    expect(action.guardrail_violations).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'insufficient_write_tier' })]));
  });

  it('executes an ad edit end to end, widening the diff with the real new ad resource name, then rolls it back', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Ad Edit Lifecycle Org');
    const target = await seedTargetWithCreatedCampaign(organization.id, project.id, owner.id);
    const previousAdResourceName = target.ad_resource_names?.[0] as string;

    const proposed = await proposeAdEditAction({
      organizationId: organization.id,
      projectId: project.id,
      targetId: target.id,
      previousAdResourceName,
      responsiveSearchAd: EDITED_RESPONSIVE_SEARCH_AD,
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
    const after = executed.after as { newAdResourceName?: string };
    expect(after.newAdResourceName).toEqual(expect.any(String));
    expect(after.newAdResourceName).not.toBe(previousAdResourceName);

    const [reloadedAfterExecute] = await listAutomationTargetStatesForProject(organization.id, project.id);
    expect(reloadedAfterExecute.ad_resource_names?.[0]).toBe(after.newAdResourceName);

    const rolledBack = await rollbackAutomationAction({
      organizationId: organization.id,
      projectId: project.id,
      actionId: proposed.id,
      reason: 'manual',
      actorId: owner.id,
    });
    expect(rolledBack.status).toBe('rolled_back');

    const [reloadedAfterRollback] = await listAutomationTargetStatesForProject(organization.id, project.id);
    expect(reloadedAfterRollback.ad_resource_names?.[0]).toBe(previousAdResourceName);
  });
});

describe('proposeMetaAdSetEditAction (KAN-73 follow-up)', () => {
  /** Seeds a target and executes a `campaign_draft_create` (Meta platform) against it, so `meta_ad_set_resource_names` is populated (via the simulated executor, same posture every other ad-set-edit test in this block relies on). */
  async function seedTargetWithCreatedCampaign(organizationId: string, projectId: string, ownerId: string) {
    const target = await seedTarget(organizationId, projectId, ownerId, 0);
    const created = await proposeCampaignDraftCreateAction({
      organizationId,
      projectId,
      targetId: target.id,
      draft: metaCampaignDraft(),
      requestedByUserId: ownerId,
    });
    await approveAutomationAction({ organizationId, projectId, actionId: created.id, approverId: ownerId });
    await executeAutomationAction({ organizationId, projectId, actionId: created.id, executedByUserId: ownerId });
    const [reloaded] = await listAutomationTargetStatesForProject(organizationId, projectId);
    return reloaded;
  }

  it('proposes a clean ad set edit as awaiting_approval with the dry-run diff', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Propose Meta Ad Set Edit Clean Org');
    const target = await seedTargetWithCreatedCampaign(organization.id, project.id, owner.id);
    const adSetResourceName = target.meta_ad_set_resource_names?.[0] as string;

    const action = await proposeMetaAdSetEditAction({
      organizationId: organization.id,
      projectId: project.id,
      targetId: target.id,
      adSetResourceName,
      dailyBudgetUsd: 40,
      status: 'paused',
      requestedByUserId: owner.id,
    });

    expect(action.status).toBe('awaiting_approval');
    expect(action.action_type).toBe('meta_ad_set_edit');
    expect(action.before).toEqual({ adSetResourceName });
    expect(action.after).toEqual({ adSetResourceName, dailyBudgetUsd: 40, adSetStatus: 'paused' });
    expect(action.guardrail_violations).toEqual([]);
  });

  it('rejects a no-op edit with neither dailyBudgetUsd nor status set', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Propose Meta Ad Set Edit Empty Org');
    const target = await seedTargetWithCreatedCampaign(organization.id, project.id, owner.id);
    const adSetResourceName = target.meta_ad_set_resource_names?.[0] as string;

    await expect(
      proposeMetaAdSetEditAction({
        organizationId: organization.id,
        projectId: project.id,
        targetId: target.id,
        adSetResourceName,
        requestedByUserId: owner.id,
      }),
    ).rejects.toThrow(InvalidAutomationActionError);
  });

  it('rejects a non-positive dailyBudgetUsd before touching guardrails', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Propose Meta Ad Set Edit Invalid Budget Org');
    const target = await seedTargetWithCreatedCampaign(organization.id, project.id, owner.id);
    const adSetResourceName = target.meta_ad_set_resource_names?.[0] as string;

    await expect(
      proposeMetaAdSetEditAction({
        organizationId: organization.id,
        projectId: project.id,
        targetId: target.id,
        adSetResourceName,
        dailyBudgetUsd: 0,
        requestedByUserId: owner.id,
      }),
    ).rejects.toThrow(InvalidAutomationActionError);
  });

  it('refuses an ad set resource name that is not one of this target\'s own ad sets', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Propose Meta Ad Set Edit Wrong AdSet Org');
    const target = await seedTargetWithCreatedCampaign(organization.id, project.id, owner.id);

    await expect(
      proposeMetaAdSetEditAction({
        organizationId: organization.id,
        projectId: project.id,
        targetId: target.id,
        adSetResourceName: 'act_999/adsets/not-this-targets',
        dailyBudgetUsd: 40,
        requestedByUserId: owner.id,
      }),
    ).rejects.toThrow(InvalidAutomationActionError);
  });

  it('refuses a target with no campaign (and so no ad sets) created yet', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Propose Meta Ad Set Edit No Campaign Org');
    const target = await seedTarget(organization.id, project.id, owner.id);

    await expect(
      proposeMetaAdSetEditAction({
        organizationId: organization.id,
        projectId: project.id,
        targetId: target.id,
        adSetResourceName: 'act_999/adsets/1',
        dailyBudgetUsd: 40,
        requestedByUserId: owner.id,
      }),
    ).rejects.toThrow(InvalidAutomationActionError);
  });

  it('blocks an ad set edit targeting a protected campaign', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Propose Meta Ad Set Edit Protected Org');
    const target = await seedTargetWithCreatedCampaign(organization.id, project.id, owner.id);
    const adSetResourceName = target.meta_ad_set_resource_names?.[0] as string;
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

    const action = await proposeMetaAdSetEditAction({
      organizationId: organization.id,
      projectId: project.id,
      targetId: target.id,
      adSetResourceName,
      dailyBudgetUsd: 40,
      requestedByUserId: owner.id,
    });

    expect(action.status).toBe('blocked');
    expect(action.guardrail_violations).toEqual([expect.objectContaining({ type: 'protected_target' })]);
  });

  it('requires the "manage" write tier specifically — "optimize" is not enough', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Propose Meta Ad Set Edit Optimize Org');
    const { target, attachment } = await seedTargetWithConnection(organization.id, project.id, owner.id, 'manage', 0);
    const created = await proposeCampaignDraftCreateAction({
      organizationId: organization.id,
      projectId: project.id,
      targetId: target.id,
      draft: metaCampaignDraft(),
      requestedByUserId: owner.id,
    });
    await approveAutomationAction({ organizationId: organization.id, projectId: project.id, actionId: created.id, approverId: owner.id });
    await executeAutomationAction({ organizationId: organization.id, projectId: project.id, actionId: created.id, executedByUserId: owner.id });
    await setResourceAttachmentWriteTier({ organizationId: organization.id, attachmentId: attachment.id, tier: 'optimize', actorId: owner.id });
    const [reloaded] = await listAutomationTargetStatesForProject(organization.id, project.id);

    const action = await proposeMetaAdSetEditAction({
      organizationId: organization.id,
      projectId: project.id,
      targetId: target.id,
      adSetResourceName: reloaded.meta_ad_set_resource_names?.[0] as string,
      dailyBudgetUsd: 40,
      requestedByUserId: owner.id,
    });

    expect(action.status).toBe('blocked');
    expect(action.guardrail_violations).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'insufficient_write_tier' })]));
  });

  it('executes an ad set edit end to end, widening the diff with the real pre-edit values, then rolls it back', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Meta Ad Set Edit Lifecycle Org');
    const target = await seedTargetWithCreatedCampaign(organization.id, project.id, owner.id);
    const adSetResourceName = target.meta_ad_set_resource_names?.[0] as string;

    const proposed = await proposeMetaAdSetEditAction({
      organizationId: organization.id,
      projectId: project.id,
      targetId: target.id,
      adSetResourceName,
      dailyBudgetUsd: 40,
      status: 'paused',
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
    // The simulated executor reports the target's own campaign-level fields as the "previous"
    // values (see `SimulatedAdAccountExecutor.executeMetaAdSetEdit`'s own doc comment).
    expect(executed.before).toEqual({ adSetResourceName, dailyBudgetUsd: 25, adSetStatus: 'paused' });

    const rolledBack = await rollbackAutomationAction({
      organizationId: organization.id,
      projectId: project.id,
      actionId: proposed.id,
      reason: 'manual',
      actorId: owner.id,
    });
    expect(rolledBack.status).toBe('rolled_back');
  });
});
