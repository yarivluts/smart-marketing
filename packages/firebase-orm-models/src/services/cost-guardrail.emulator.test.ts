import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  checkProjectQueryQuota,
  createOrganizationWithOwner,
  createProject,
  DEFAULT_DAILY_QUERY_LIMIT,
  DEFAULT_QUERY_COST_LOG_LIST_LIMIT,
  ensureUserForFirebaseSession,
  getProjectCostQuota,
  InvalidCostQuotaError,
  listAuditLogEntriesForOrg,
  listQueryCostLogEntriesForProject,
  ProjectNotFoundError,
  recordQueryCostLogEntry,
  setProjectCostQuota,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

/**
 * Emulator-backed tests for KAN-39's cost-guardrail bookkeeping —
 * `getProjectCostQuota`/`setProjectCostQuota` (quota+labels config) and
 * `recordQueryCostLogEntry`/`listQueryCostLogEntriesForProject`/
 * `checkProjectQueryQuota` (the cost log + enforcement). `queryMetrics`'s own
 * wiring of these into the actual quota-then-execute-then-log flow is covered
 * in `metrics-query.emulator.test.ts`, alongside the rest of that function's
 * behavior.
 */

beforeAll(async () => {
  await connectToFirestoreEmulator('cost-guardrail-tests');
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function uniqueEmail(prefix: string): string {
  return `${unique(prefix)}@example.com`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function setupOrgWithProject(orgName: string) {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('owner') });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  return { owner, organization, project };
}

describe('getProjectCostQuota / setProjectCostQuota', () => {
  it('defaults to DEFAULT_DAILY_QUERY_LIMIT with no labels when never explicitly set', async () => {
    const { organization, project } = await setupOrgWithProject('Quota Default Org');
    const quota = await getProjectCostQuota(organization.id, project.id);
    expect(quota).toEqual({ dailyQueryLimit: DEFAULT_DAILY_QUERY_LIMIT, labels: {}, setAt: null });
  });

  it('records an explicit config and reads it back as the effective quota', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Quota Set Org');
    await setProjectCostQuota({
      organizationId: organization.id,
      projectId: project.id,
      dailyQueryLimit: 10,
      labels: { team: 'growth' },
      setByUserId: owner.id,
    });

    const quota = await getProjectCostQuota(organization.id, project.id);
    expect(quota.dailyQueryLimit).toBe(10);
    expect(quota.labels).toEqual({ team: 'growth' });
    expect(quota.setAt).toBeTruthy();
    expect(quota.setByUserId).toBe(owner.id);
  });

  it('reads back the newest config when set more than once', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Quota Update Org');
    await setProjectCostQuota({ organizationId: organization.id, projectId: project.id, dailyQueryLimit: 10, labels: {}, setByUserId: owner.id });
    await delay(5);
    await setProjectCostQuota({ organizationId: organization.id, projectId: project.id, dailyQueryLimit: 25, labels: { team: 'ops' }, setByUserId: owner.id });

    const quota = await getProjectCostQuota(organization.id, project.id);
    expect(quota.dailyQueryLimit).toBe(25);
    expect(quota.labels).toEqual({ team: 'ops' });
  });

  it('rejects a non-positive-integer daily limit', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Quota Invalid Org');
    await expect(
      setProjectCostQuota({ organizationId: organization.id, projectId: project.id, dailyQueryLimit: 0, labels: {}, setByUserId: owner.id }),
    ).rejects.toThrow(InvalidCostQuotaError);
    await expect(
      setProjectCostQuota({ organizationId: organization.id, projectId: project.id, dailyQueryLimit: 1.5, labels: {}, setByUserId: owner.id }),
    ).rejects.toThrow(InvalidCostQuotaError);
  });

  it('rejects a project that does not exist', async () => {
    const { owner, organization } = await setupOrgWithProject('Quota Missing Project Org');
    await expect(getProjectCostQuota(organization.id, 'does-not-exist')).rejects.toThrow(ProjectNotFoundError);
    await expect(
      setProjectCostQuota({ organizationId: organization.id, projectId: 'does-not-exist', dailyQueryLimit: 10, labels: {}, setByUserId: owner.id }),
    ).rejects.toThrow(ProjectNotFoundError);
  });

  it('rejects a project id that belongs to a different organization (KAN-26 non-enumeration)', async () => {
    const { organization: orgA } = await setupOrgWithProject('Quota Isolation Org A');
    const { project: projectB } = await setupOrgWithProject('Quota Isolation Org B');
    await expect(getProjectCostQuota(orgA.id, projectB.id)).rejects.toThrow(ProjectNotFoundError);
  });

  it('records an audit log entry when a quota is set', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Quota Audit Org');
    await setProjectCostQuota({ organizationId: organization.id, projectId: project.id, dailyQueryLimit: 42, labels: {}, setByUserId: owner.id });

    const entries = await listAuditLogEntriesForOrg(organization.id);
    const entry = entries.find((candidate) => candidate.action === 'cost_quota.set');
    expect(entry).toBeDefined();
    expect(entry?.actor_id).toBe(owner.id);
    expect(entry?.project_id).toBe(project.id);
  });
});

describe('recordQueryCostLogEntry / listQueryCostLogEntriesForProject', () => {
  it('lists entries newest-first', async () => {
    const { organization, project } = await setupOrgWithProject('Log Order Org');
    const first = await recordQueryCostLogEntry({
      organizationId: organization.id,
      projectId: project.id,
      outcome: 'executed',
      definitionRefs: { ad_spend: 'metric:ad_spend@v1' },
    });
    await delay(5);
    const second = await recordQueryCostLogEntry({
      organizationId: organization.id,
      projectId: project.id,
      outcome: 'warehouse_not_configured',
      definitionRefs: { signups: 'metric:signups@v1' },
    });

    const entries = await listQueryCostLogEntriesForProject(organization.id, project.id);
    expect(entries.map((entry) => entry.id)).toEqual([second.id, first.id]);
    expect(entries[0].estimated_cost_usd).toBeNull();
  });

  it('defaults to the documented cap when no limit is given', () => {
    expect(DEFAULT_QUERY_COST_LOG_LIST_LIMIT).toBeGreaterThan(0);
  });

  it('caps the result at the requested limit', async () => {
    const { organization, project } = await setupOrgWithProject('Log Limit Org');
    for (let i = 0; i < 3; i++) {
      await recordQueryCostLogEntry({ organizationId: organization.id, projectId: project.id, outcome: 'executed', definitionRefs: {} });
    }
    const entries = await listQueryCostLogEntriesForProject(organization.id, project.id, 2);
    expect(entries).toHaveLength(2);
  });

  it('does not leak a sibling project’s log entries', async () => {
    const { organization, project } = await setupOrgWithProject('Log Isolation Org A');
    const other = await setupOrgWithProject('Log Isolation Org B');
    await recordQueryCostLogEntry({ organizationId: organization.id, projectId: project.id, outcome: 'executed', definitionRefs: {} });
    await recordQueryCostLogEntry({ organizationId: other.organization.id, projectId: other.project.id, outcome: 'executed', definitionRefs: {} });

    const entries = await listQueryCostLogEntriesForProject(organization.id, project.id);
    expect(entries).toHaveLength(1);
    expect(entries[0].project_id).toBe(project.id);
  });
});

describe('checkProjectQueryQuota', () => {
  it('allows attempts under the (default) limit', async () => {
    const { organization, project } = await setupOrgWithProject('Quota Check Under Org');
    const status = await checkProjectQueryQuota(organization.id, project.id);
    expect(status).toEqual({ allowed: true, remaining: DEFAULT_DAILY_QUERY_LIMIT, limit: DEFAULT_DAILY_QUERY_LIMIT, attemptedToday: 0 });
  });

  it('blocks once today’s attempted count reaches the configured limit', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Quota Check Blocked Org');
    await setProjectCostQuota({ organizationId: organization.id, projectId: project.id, dailyQueryLimit: 2, labels: {}, setByUserId: owner.id });
    await recordQueryCostLogEntry({ organizationId: organization.id, projectId: project.id, outcome: 'executed', definitionRefs: {} });
    await recordQueryCostLogEntry({ organizationId: organization.id, projectId: project.id, outcome: 'warehouse_not_configured', definitionRefs: {} });

    const status = await checkProjectQueryQuota(organization.id, project.id);
    expect(status).toEqual({ allowed: false, remaining: 0, limit: 2, attemptedToday: 2 });
  });

  it('does not count a blocked attempt itself against the quota', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Quota Check Not Double Counted Org');
    await setProjectCostQuota({ organizationId: organization.id, projectId: project.id, dailyQueryLimit: 1, labels: {}, setByUserId: owner.id });
    await recordQueryCostLogEntry({ organizationId: organization.id, projectId: project.id, outcome: 'blocked_quota_exceeded', definitionRefs: {} });

    const status = await checkProjectQueryQuota(organization.id, project.id);
    expect(status).toEqual({ allowed: true, remaining: 1, limit: 1, attemptedToday: 0 });
  });

  it('does not count yesterday’s attempts against today’s quota', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Quota Check Reset Org');
    await setProjectCostQuota({ organizationId: organization.id, projectId: project.id, dailyQueryLimit: 1, labels: {}, setByUserId: owner.id });
    await recordQueryCostLogEntry({ organizationId: organization.id, projectId: project.id, outcome: 'executed', definitionRefs: {} });

    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const status = await checkProjectQueryQuota(organization.id, project.id, tomorrow);
    expect(status).toEqual({ allowed: true, remaining: 1, limit: 1, attemptedToday: 0 });
  });
});
