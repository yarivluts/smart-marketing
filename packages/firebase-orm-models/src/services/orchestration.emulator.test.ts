import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createOrganizationWithOwner,
  createProject,
  DEFAULT_ORCHESTRATION_RUN_LIST_LIMIT,
  ensureUserForFirebaseSession,
  listAuditLogEntriesForOrg,
  listOrchestrationRunsForProject,
  OrchestrationExecutionError,
  ProjectNotFoundError,
  triggerOrchestrationRun,
  type OrchestrationExecutionResult,
  type OrchestrationExecutor,
  type OrchestrationExecutorRunParams,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

/**
 * Emulator-backed tests for KAN-38's `triggerOrchestrationRun`/
 * `listOrchestrationRunsForProject` — the Firestore-backed run-record
 * bookkeeping around an injected {@link OrchestrationExecutor}. The *real*
 * executor (an actual dbt subprocess against the buildable-today DuckDB
 * stand-in) has its own dedicated, non-emulator test —
 * `orchestration/local-dbt-executor.test.ts` — kept out of this file so
 * only one test in the whole package spawns that subprocess (see that
 * file's own doc comment for why: DuckDB only tolerates one writer at a
 * time, and this package's own test task is ordered after
 * `@growthos/dbt-transform#test` in `turbo.json` for the same reason).
 */

beforeAll(async () => {
  await connectToFirestoreEmulator('orchestration-service-tests');
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

/** A controllable fake {@link OrchestrationExecutor} — either resolves with a fixed freshness snapshot or rejects with a fixed error, never touching a real dbt subprocess. */
function fakeExecutor(outcome: OrchestrationExecutionResult | Error): OrchestrationExecutor {
  return {
    run(_params: OrchestrationExecutorRunParams): Promise<OrchestrationExecutionResult> {
      if (outcome instanceof Error) {
        return Promise.reject(outcome);
      }
      return Promise.resolve(outcome);
    },
  };
}

const SAMPLE_FRESHNESS: OrchestrationExecutionResult = {
  freshness: [
    { table: 'entities', rowCount: 2, latestRecordAt: '2026-01-20T14:12:00Z' },
    { table: 'events', rowCount: 3, latestRecordAt: '2026-01-07T12:00:03Z' },
    { table: 'measures', rowCount: 0, latestRecordAt: null },
  ],
};

describe('triggerOrchestrationRun', () => {
  it('records a succeeded run with freshness written back from the executor', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Orchestration Success Org');

    const run = await triggerOrchestrationRun({
      organizationId: organization.id,
      projectId: project.id,
      triggeredByUserId: owner.id,
      executor: fakeExecutor(SAMPLE_FRESHNESS),
    });

    expect(run.status).toBe('succeeded');
    expect(run.trigger).toBe('manual');
    expect(run.triggered_by_user_id).toBe(owner.id);
    expect(run.started_at).toBeTruthy();
    expect(run.finished_at).toBeTruthy();
    expect(run.error_message).toBeUndefined();
    expect(run.freshness).toEqual([
      { table: 'entities', row_count: 2, latest_record_at: '2026-01-20T14:12:00Z' },
      { table: 'events', row_count: 3, latest_record_at: '2026-01-07T12:00:03Z' },
      { table: 'measures', row_count: 0, latest_record_at: null },
    ]);
  });

  it('records a failed run with the executor’s error message when the executor rejects', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Orchestration Failure Org');

    const run = await triggerOrchestrationRun({
      organizationId: organization.id,
      projectId: project.id,
      triggeredByUserId: owner.id,
      executor: fakeExecutor(new OrchestrationExecutionError('dbt build exited with code 1')),
    });

    expect(run.status).toBe('failed');
    expect(run.error_message).toBe('dbt build exited with code 1');
    expect(run.freshness).toBeUndefined();
    expect(run.finished_at).toBeTruthy();
  });

  it('rejects a project that does not exist', async () => {
    const { owner, organization } = await setupOrgWithProject('Orchestration Missing Project Org');
    await expect(
      triggerOrchestrationRun({
        organizationId: organization.id,
        projectId: 'does-not-exist',
        triggeredByUserId: owner.id,
        executor: fakeExecutor(SAMPLE_FRESHNESS),
      }),
    ).rejects.toThrow(ProjectNotFoundError);
  });

  it('rejects a project id that belongs to a different organization (KAN-26 non-enumeration)', async () => {
    const { organization: orgA } = await setupOrgWithProject('Orchestration Isolation Org A');
    const { owner: ownerB, project: projectB } = await setupOrgWithProject('Orchestration Isolation Org B');

    await expect(
      triggerOrchestrationRun({
        organizationId: orgA.id,
        projectId: projectB.id,
        triggeredByUserId: ownerB.id,
        executor: fakeExecutor(SAMPLE_FRESHNESS),
      }),
    ).rejects.toThrow(ProjectNotFoundError);
  });

  it('records an audit log entry for a human-triggered run', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Orchestration Audit Org');

    const run = await triggerOrchestrationRun({
      organizationId: organization.id,
      projectId: project.id,
      triggeredByUserId: owner.id,
      executor: fakeExecutor(SAMPLE_FRESHNESS),
    });

    const entries = await listAuditLogEntriesForOrg(organization.id);
    const entry = entries.find((candidate) => candidate.action === 'orchestration_run.trigger');
    expect(entry).toBeDefined();
    expect(entry?.target_id).toBe(run.id);
    expect(entry?.actor_id).toBe(owner.id);
    expect(entry?.project_id).toBe(project.id);
  });

  it('skips audit logging when no human actor triggered the run', async () => {
    const { organization, project } = await setupOrgWithProject('Orchestration No Actor Org');

    await triggerOrchestrationRun({
      organizationId: organization.id,
      projectId: project.id,
      executor: fakeExecutor(SAMPLE_FRESHNESS),
    });

    const entries = await listAuditLogEntriesForOrg(organization.id);
    expect(entries.find((candidate) => candidate.action === 'orchestration_run.trigger')).toBeUndefined();
  });
});

describe('listOrchestrationRunsForProject', () => {
  it('returns a project’s runs newest first', async () => {
    const { organization, project } = await setupOrgWithProject('Orchestration Order Org');

    const first = await triggerOrchestrationRun({
      organizationId: organization.id,
      projectId: project.id,
      executor: fakeExecutor(SAMPLE_FRESHNESS),
    });
    await delay(5);
    const second = await triggerOrchestrationRun({
      organizationId: organization.id,
      projectId: project.id,
      executor: fakeExecutor(new OrchestrationExecutionError('boom')),
    });

    const runs = await listOrchestrationRunsForProject(organization.id, project.id);
    expect(runs.map((run) => run.id)).toEqual([second.id, first.id]);
  });

  it('defaults to the documented cap when no limit is given', () => {
    expect(DEFAULT_ORCHESTRATION_RUN_LIST_LIMIT).toBeGreaterThan(0);
  });

  it('caps the result at the requested limit', async () => {
    const { organization, project } = await setupOrgWithProject('Orchestration Limit Org');
    for (let i = 0; i < 3; i++) {
      await triggerOrchestrationRun({
        organizationId: organization.id,
        projectId: project.id,
        executor: fakeExecutor(SAMPLE_FRESHNESS),
      });
    }

    const runs = await listOrchestrationRunsForProject(organization.id, project.id, 2);
    expect(runs).toHaveLength(2);
  });

  it('does not leak a sibling project’s runs', async () => {
    const { organization, project } = await setupOrgWithProject('Orchestration Isolation List Org A');
    const other = await setupOrgWithProject('Orchestration Isolation List Org B');

    await triggerOrchestrationRun({
      organizationId: organization.id,
      projectId: project.id,
      executor: fakeExecutor(SAMPLE_FRESHNESS),
    });
    await triggerOrchestrationRun({
      organizationId: other.organization.id,
      projectId: other.project.id,
      executor: fakeExecutor(SAMPLE_FRESHNESS),
    });

    const runs = await listOrchestrationRunsForProject(organization.id, project.id);
    expect(runs).toHaveLength(1);
    expect(runs[0].project_id).toBe(project.id);
  });
});
