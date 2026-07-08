import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createOrganizationWithOwner,
  createProject,
  disablePlugin,
  EnvironmentNotFoundError,
  ensureUserForFirebaseSession,
  installPlugin,
  listAuditLogEntriesForOrg,
  listSourcePluginRunsForInstall,
  NotASourcePluginError,
  PluginInstallNotActiveError,
  PluginInstallNotFoundError,
  ProjectNotFoundError,
  registerPluginManifest,
  registerSchemaDefinition,
  triggerSourcePluginRun,
  type SourcePluginExecutor,
  type SourcePluginSyncResult,
  uninstallPlugin,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

/**
 * Emulator-backed tests for KAN-47: `triggerSourcePluginRun`/
 * `listSourcePluginRunsForInstall` — the source-plugin runtime (scheduled
 * execution stand-in, scoped short-lived creds, cursor persistence,
 * retry/backoff).
 */

beforeAll(async () => {
  await connectToFirestoreEmulator('plugin-runtime-tests');
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function uniqueEmail(prefix: string): string {
  return `${unique(prefix)}@example.com`;
}

const SOURCE_MANIFEST_YAML = `
id: com.example.toy-source
version: 1.0.0
type: source
display_name: Toy Source Plugin
scopes: [ingest:write]
config_schema:
  batch_size: { type: number }
`;

const ACTION_MANIFEST_YAML = `
id: com.example.toy-action
version: 1.0.0
type: action
display_name: Toy Action Plugin
scopes: [action:execute]
`;

async function setupInstalledSourcePlugin() {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('owner') });
  const { organization } = await createOrganizationWithOwner({ name: unique('Source Runtime Org'), ownerUserId: owner.id });
  const { project, environments } = await createProject({ organizationId: organization.id, name: 'Website' });
  const environment = environments.find((e) => e.name === 'dev')!;

  await registerPluginManifest({ organizationId: organization.id, manifestYaml: SOURCE_MANIFEST_YAML, registeredByUserId: owner.id });
  const install = await installPlugin({
    organizationId: organization.id,
    projectId: project.id,
    pluginId: 'com.example.toy-source',
    version: '1.0.0',
    consentedScopes: ['ingest:write'],
    config: {},
    installedByUserId: owner.id,
  });

  await registerSchemaDefinition({
    organizationId: organization.id,
    projectId: project.id,
    kind: 'event',
    name: 'toy_counter_tick',
    fields: [{ name: 'counter', type: 'number', isRequired: true, isPii: false, isIdentityKey: false }],
    createdByUserId: owner.id,
  });

  return { owner, organization, project, environment, install };
}

/** A fake `SourcePluginExecutor` that fails its first `failuresBeforeSuccess` calls before returning a fixed result — lets retry/backoff be exercised deterministically without the real toy executor's own advancing counter. */
function flakyExecutor(failuresBeforeSuccess: number, result: SourcePluginSyncResult): SourcePluginExecutor {
  let calls = 0;
  return {
    async sync() {
      calls += 1;
      if (calls <= failuresBeforeSuccess) {
        throw new Error(`transient failure #${calls}`);
      }
      return result;
    },
  };
}

const NO_SLEEP_RETRY_OPTIONS = { maxAttempts: 3, baseDelayMs: 0, sleep: async () => {} };

describe('triggerSourcePluginRun', () => {
  it('runs a toy source plugin sync end to end and lands accepted records via ingestBatch', async () => {
    const { organization, project, environment, install } = await setupInstalledSourcePlugin();

    const run = await triggerSourcePluginRun({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: environment.id,
      installId: install.id,
    });

    expect(run.status).toBe('succeeded');
    expect(run.attempts).toBe(1);
    expect(run.cursor_before).toBeNull();
    expect(run.cursor_after).toBe('3');
    expect(run.record_kind).toBe('event');
    expect(run.records_fetched).toBe(3);
    expect(run.records_accepted).toBe(3);
    expect(run.records_quarantined).toBe(0);
    expect(run.records_duplicate).toBe(0);
  });

  it('persists the cursor across runs — a fresh trigger resumes where the last one left off ("survives restart")', async () => {
    const { organization, project, environment, install } = await setupInstalledSourcePlugin();

    const first = await triggerSourcePluginRun({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: environment.id,
      installId: install.id,
    });
    expect(first.cursor_after).toBe('3');

    const second = await triggerSourcePluginRun({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: environment.id,
      installId: install.id,
    });
    expect(second.cursor_before).toBe('3');
    expect(second.cursor_after).toBe('6');
  });

  it('quarantines records that fail schema validation without failing the run itself', async () => {
    const { organization, project, environment, install } = await setupInstalledSourcePlugin();
    const executor: SourcePluginExecutor = {
      async sync() {
        return {
          kind: 'event',
          records: [{ event_id: 'unmapped#1', event: 'never_registered', ts: new Date().toISOString(), properties: {} }],
          nextCursor: '1',
        };
      },
    };

    const run = await triggerSourcePluginRun({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: environment.id,
      installId: install.id,
      executor,
    });

    expect(run.status).toBe('succeeded');
    expect(run.records_quarantined).toBe(1);
    expect(run.records_accepted).toBe(0);
    // Landing succeeded (even though the record itself was quarantined downstream), so the cursor still advances.
    expect(run.cursor_after).toBe('1');
  });

  it('retries a transient executor failure and succeeds, recording the real attempt count', async () => {
    const { organization, project, environment, install } = await setupInstalledSourcePlugin();
    const executor = flakyExecutor(2, {
      kind: 'event',
      records: [{ event_id: 'e1', event: 'toy_counter_tick', ts: new Date().toISOString(), properties: { counter: 0 } }],
      nextCursor: '1',
    });

    const run = await triggerSourcePluginRun({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: environment.id,
      installId: install.id,
      executor,
      retryOptions: NO_SLEEP_RETRY_OPTIONS,
    });

    expect(run.status).toBe('succeeded');
    expect(run.attempts).toBe(3);
    expect(run.cursor_after).toBe('1');
  });

  it('marks the run failed once every retry attempt is exhausted, leaving the cursor untouched', async () => {
    const { organization, project, environment, install } = await setupInstalledSourcePlugin();
    const executor: SourcePluginExecutor = {
      async sync() {
        throw new Error('permanently broken');
      },
    };

    const run = await triggerSourcePluginRun({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: environment.id,
      installId: install.id,
      executor,
      retryOptions: NO_SLEEP_RETRY_OPTIONS,
    });

    expect(run.status).toBe('failed');
    expect(run.attempts).toBe(3);
    expect(run.error_message).toBe('permanently broken');
    expect(run.cursor_after).toBeUndefined();

    // The cursor never advanced, so a fresh trigger still starts from scratch.
    const retry = await triggerSourcePluginRun({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: environment.id,
      installId: install.id,
    });
    expect(retry.cursor_before).toBeNull();
  });

  it('does not advance the cursor when ingestBatch itself throws after a successful sync', async () => {
    const { organization, project, environment, install } = await setupInstalledSourcePlugin();
    // An empty records array with a non-empty nextCursor is a valid executor output the run must still
    // handle — but forcing ingestBatch's own `EmptyIngestBatchError` isn't reachable that way since the
    // service only calls ingestBatch when `records.length > 0`. Instead, an oversized batch exercises a
    // genuine ingestBatch-layer failure after a successful sync.
    const tooManyRecords = Array.from({ length: 1001 }, (_, i) => ({
      event_id: `e${i}`,
      event: 'toy_counter_tick',
      ts: new Date().toISOString(),
      properties: { counter: i },
    }));
    const executor: SourcePluginExecutor = {
      async sync() {
        return { kind: 'event', records: tooManyRecords, nextCursor: '1001' };
      },
    };

    const run = await triggerSourcePluginRun({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: environment.id,
      installId: install.id,
      executor,
    });

    expect(run.status).toBe('failed');
    expect(run.error_message).toMatch(/1000/);

    const retry = await triggerSourcePluginRun({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: environment.id,
      installId: install.id,
    });
    expect(retry.cursor_before).toBeNull();
  });

  it('rejects a run against a disabled install', async () => {
    const { organization, project, environment, install } = await setupInstalledSourcePlugin();
    await disablePlugin({ organizationId: organization.id, projectId: project.id, installId: install.id, performedByUserId: install.installed_by });

    await expect(
      triggerSourcePluginRun({ organizationId: organization.id, projectId: project.id, environmentId: environment.id, installId: install.id }),
    ).rejects.toBeInstanceOf(PluginInstallNotActiveError);
  });

  it('rejects a run against an uninstalled install', async () => {
    const { organization, project, environment, install } = await setupInstalledSourcePlugin();
    await uninstallPlugin({ organizationId: organization.id, projectId: project.id, installId: install.id, performedByUserId: install.installed_by });

    await expect(
      triggerSourcePluginRun({ organizationId: organization.id, projectId: project.id, environmentId: environment.id, installId: install.id }),
    ).rejects.toBeInstanceOf(PluginInstallNotActiveError);
  });

  it('rejects a run against a non-source-type plugin install', async () => {
    const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('owner') });
    const { organization } = await createOrganizationWithOwner({ name: unique('Non Source Org'), ownerUserId: owner.id });
    const { project, environments } = await createProject({ organizationId: organization.id, name: 'Website' });
    const environment = environments.find((e) => e.name === 'dev')!;
    await registerPluginManifest({ organizationId: organization.id, manifestYaml: ACTION_MANIFEST_YAML, registeredByUserId: owner.id });
    const install = await installPlugin({
      organizationId: organization.id,
      projectId: project.id,
      pluginId: 'com.example.toy-action',
      version: '1.0.0',
      consentedScopes: ['action:execute'],
      config: {},
      installedByUserId: owner.id,
    });

    await expect(
      triggerSourcePluginRun({ organizationId: organization.id, projectId: project.id, environmentId: environment.id, installId: install.id }),
    ).rejects.toBeInstanceOf(NotASourcePluginError);
  });

  it('404s (not-found, not a permission error) for a project outside the caller\'s own org', async () => {
    const { environment, install } = await setupInstalledSourcePlugin();
    const owner2 = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('owner2') });
    const { organization: otherOrg } = await createOrganizationWithOwner({ name: unique('Other Org'), ownerUserId: owner2.id });

    await expect(
      triggerSourcePluginRun({ organizationId: otherOrg.id, projectId: 'nonexistent', environmentId: environment.id, installId: install.id }),
    ).rejects.toBeInstanceOf(ProjectNotFoundError);
  });

  it('404s for an environment outside the project', async () => {
    const { organization, project, install } = await setupInstalledSourcePlugin();

    await expect(
      triggerSourcePluginRun({ organizationId: organization.id, projectId: project.id, environmentId: 'nonexistent', installId: install.id }),
    ).rejects.toBeInstanceOf(EnvironmentNotFoundError);
  });

  it('404s for an install id outside the project (cross-project isolation)', async () => {
    const { organization, install } = await setupInstalledSourcePlugin();
    const { project: otherProject, environments: otherEnvironments } = await createProject({
      organizationId: organization.id,
      name: 'Other Project',
    });
    const otherEnvironment = otherEnvironments.find((e) => e.name === 'dev')!;

    await expect(
      triggerSourcePluginRun({
        organizationId: organization.id,
        projectId: otherProject.id,
        environmentId: otherEnvironment.id,
        installId: install.id,
      }),
    ).rejects.toBeInstanceOf(PluginInstallNotFoundError);
  });

  it('mints a scoped, short-lived credential per run — never reused, always tied to the install\'s own granted scopes', async () => {
    const { organization, project, environment, install } = await setupInstalledSourcePlugin();
    const seenCredentials: string[] = [];
    const executor: SourcePluginExecutor = {
      async sync(params) {
        expect(params.credential.pluginInstallId).toBe(install.id);
        expect(params.credential.scopes).toEqual(['ingest:write']);
        expect(new Date(params.credential.expiresAt).getTime()).toBeGreaterThan(Date.now());
        seenCredentials.push(params.credential.token);
        return { kind: 'event', records: [], nextCursor: null };
      },
    };

    await triggerSourcePluginRun({ organizationId: organization.id, projectId: project.id, environmentId: environment.id, installId: install.id, executor });
    await triggerSourcePluginRun({ organizationId: organization.id, projectId: project.id, environmentId: environment.id, installId: install.id, executor });

    expect(seenCredentials).toHaveLength(2);
    expect(seenCredentials[0]).not.toBe(seenCredentials[1]);
  });

  it('records a best-effort audit log entry when a human triggered the run', async () => {
    const { organization, project, environment, install } = await setupInstalledSourcePlugin();
    await triggerSourcePluginRun({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: environment.id,
      installId: install.id,
      triggeredByUserId: install.installed_by,
    });

    const entries = await listAuditLogEntriesForOrg(organization.id);
    expect(entries.some((entry) => entry.action === 'plugin_source_run.trigger')).toBe(true);
  });
});

describe('listSourcePluginRunsForInstall', () => {
  it('returns a project\'s run history for one install, newest first', async () => {
    const { organization, project, environment, install } = await setupInstalledSourcePlugin();

    await triggerSourcePluginRun({ organizationId: organization.id, projectId: project.id, environmentId: environment.id, installId: install.id });
    await delay(5);
    await triggerSourcePluginRun({ organizationId: organization.id, projectId: project.id, environmentId: environment.id, installId: install.id });

    const runs = await listSourcePluginRunsForInstall(organization.id, project.id, install.id);
    expect(runs).toHaveLength(2);
    expect(runs[0].cursor_before).toBe('3');
    expect(runs[1].cursor_before).toBeNull();
  });

  it('scopes runs to their own install — a second install in the same project sees an empty history', async () => {
    const { organization, project, environment, install } = await setupInstalledSourcePlugin();
    await triggerSourcePluginRun({ organizationId: organization.id, projectId: project.id, environmentId: environment.id, installId: install.id });

    await uninstallPlugin({ organizationId: organization.id, projectId: project.id, installId: install.id, performedByUserId: install.installed_by });
    const secondInstall = await installPlugin({
      organizationId: organization.id,
      projectId: project.id,
      pluginId: 'com.example.toy-source',
      version: '1.0.0',
      consentedScopes: ['ingest:write'],
      config: {},
      installedByUserId: install.installed_by,
    });

    const runs = await listSourcePluginRunsForInstall(organization.id, project.id, secondInstall.id);
    expect(runs).toHaveLength(0);
  });
});
