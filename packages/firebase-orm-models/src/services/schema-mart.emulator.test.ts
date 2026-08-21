import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  evolveSchemaDefinition,
  martViewName,
  registerSchemaDefinition,
  syncAllSchemaMartViewsForProject,
  syncSchemaMartView,
  type SchemaFieldInput,
} from '../index';
import { WarehouseNotConfiguredError, WarehouseQueryFailedError, type WarehouseQueryExecutor } from '../warehouse/query-executor';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

/**
 * Coverage for `schema-mart.service.ts`: it's called best-effort, inline,
 * from every schema register/evolve (never surfacing a failure to that
 * caller) and explicitly from the admin "Sync warehouse views" sweep — but
 * had no dedicated test at all before this file. `syncSchemaMartView`
 * itself needs no Firestore (its `schemaDef` param is a plain object), but
 * `syncAllSchemaMartViewsForProject` reads real active schemas via
 * `listSchemaDefinitionsForProject`, so this whole file runs against the
 * emulator for consistency with its sibling service test files.
 */

beforeAll(async () => {
  await connectToFirestoreEmulator('schema-mart-tests');
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

function fakeExecutor(behavior: (sql: string) => void | Promise<void> = () => undefined): {
  executor: WarehouseQueryExecutor;
  calls: string[];
} {
  const calls: string[] = [];
  return {
    calls,
    executor: {
      execute: async (query) => {
        calls.push(query.sql);
        await behavior(query.sql);
        return [];
      },
    },
  };
}

describe('syncSchemaMartView', () => {
  it('skips a kind with no mart view (event)', async () => {
    const { calls, executor } = fakeExecutor();

    const outcome = await syncSchemaMartView({
      organizationId: 'org-1',
      projectId: 'proj-1',
      schemaDef: { kind: 'event', name: 'checkout_event', field_defs: [] },
      dataset: 'growthos_core',
      executor,
    });

    expect(outcome).toEqual({ status: 'skipped_kind' });
    expect(calls).toHaveLength(0);
  });

  it('skips when no dataset is configured, without calling the executor', async () => {
    const { calls, executor } = fakeExecutor();
    const originalDataset = process.env.GROWTHOS_BIGQUERY_CORE_DATASET;
    delete process.env.GROWTHOS_BIGQUERY_CORE_DATASET;

    try {
      const outcome = await syncSchemaMartView({
        organizationId: 'org-1',
        projectId: 'proj-1',
        schemaDef: { kind: 'entity', name: 'customer', field_defs: [] },
        executor,
      });

      expect(outcome).toEqual({ status: 'skipped_not_configured' });
      expect(calls).toHaveLength(0);
    } finally {
      if (originalDataset === undefined) {
        delete process.env.GROWTHOS_BIGQUERY_CORE_DATASET;
      } else {
        process.env.GROWTHOS_BIGQUERY_CORE_DATASET = originalDataset;
      }
    }
  });

  it('creates the mart view and reports its name on success', async () => {
    const { calls, executor } = fakeExecutor();

    const outcome = await syncSchemaMartView({
      organizationId: 'org-1',
      projectId: 'proj-1',
      schemaDef: { kind: 'entity', name: 'customer', field_defs: [{ name: 'plan_name', type: 'string', is_required: true, is_pii: false, is_identity_key: false }] },
      dataset: 'growthos_core',
      executor,
    });

    expect(outcome).toEqual({ status: 'synced', viewName: martViewName('org-1', 'proj-1', 'customer') });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain(`CREATE OR REPLACE VIEW \`growthos_core.${martViewName('org-1', 'proj-1', 'customer')}\``);
  });

  it('maps the executor rejecting with WarehouseNotConfiguredError to skipped_not_configured', async () => {
    const executor: WarehouseQueryExecutor = { execute: () => Promise.reject(new WarehouseNotConfiguredError()) };

    const outcome = await syncSchemaMartView({
      organizationId: 'org-1',
      projectId: 'proj-1',
      schemaDef: { kind: 'entity', name: 'customer', field_defs: [] },
      dataset: 'growthos_core',
      executor,
    });

    expect(outcome).toEqual({ status: 'skipped_not_configured' });
  });

  it('maps a warehouse-side rejection to the error state with its message', async () => {
    const executor: WarehouseQueryExecutor = { execute: () => Promise.reject(new WarehouseQueryFailedError('BigQuery rejected the view DDL: boom')) };

    const outcome = await syncSchemaMartView({
      organizationId: 'org-1',
      projectId: 'proj-1',
      schemaDef: { kind: 'entity', name: 'customer', field_defs: [] },
      dataset: 'growthos_core',
      executor,
    });

    expect(outcome).toEqual({ status: 'error', message: 'BigQuery rejected the view DDL: boom' });
  });

  it('rethrows an unrecognized error instead of degrading it into a normal-looking outcome', async () => {
    const executor: WarehouseQueryExecutor = { execute: () => Promise.reject(new TypeError('coding bug')) };

    await expect(
      syncSchemaMartView({
        organizationId: 'org-1',
        projectId: 'proj-1',
        schemaDef: { kind: 'entity', name: 'customer', field_defs: [] },
        dataset: 'growthos_core',
        executor,
      }),
    ).rejects.toThrow(TypeError);
  });
});

const entityFields: SchemaFieldInput[] = [{ name: 'plan_name', type: 'string', isRequired: true, isPii: false, isIdentityKey: false }];
const measureFields: SchemaFieldInput[] = [{ name: 'metric_label', type: 'string', isRequired: false, isPii: false, isIdentityKey: false }];

async function withDataset<T>(dataset: string | undefined, fn: () => Promise<T>): Promise<T> {
  const original = process.env.GROWTHOS_BIGQUERY_CORE_DATASET;
  if (dataset === undefined) {
    delete process.env.GROWTHOS_BIGQUERY_CORE_DATASET;
  } else {
    process.env.GROWTHOS_BIGQUERY_CORE_DATASET = dataset;
  }
  try {
    return await fn();
  } finally {
    if (original === undefined) {
      delete process.env.GROWTHOS_BIGQUERY_CORE_DATASET;
    } else {
      process.env.GROWTHOS_BIGQUERY_CORE_DATASET = original;
    }
  }
}

describe('syncAllSchemaMartViewsForProject', () => {
  it('syncs every active measure/entity schema, skipping event-kind schemas entirely', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Schema Mart Sweep Org');
    await registerSchemaDefinition({ organizationId: organization.id, projectId: project.id, kind: 'entity', name: 'customer', fields: entityFields, createdByUserId: owner.id });
    await registerSchemaDefinition({ organizationId: organization.id, projectId: project.id, kind: 'measure', name: 'signups', fields: measureFields, createdByUserId: owner.id });
    await registerSchemaDefinition({ organizationId: organization.id, projectId: project.id, kind: 'event', name: 'checkout_event', fields: measureFields, createdByUserId: owner.id });

    const { calls, executor } = fakeExecutor();
    const result = await withDataset('growthos_core', () => syncAllSchemaMartViewsForProject(organization.id, project.id, executor));

    expect(result.warehouseConfigured).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.synced.sort()).toEqual([martViewName(organization.id, project.id, 'customer'), martViewName(organization.id, project.id, 'signups')].sort());
    expect(calls).toHaveLength(2);
  });

  it('accumulates a per-schema error without aborting the rest of the sweep', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Schema Mart Error Org');
    await registerSchemaDefinition({ organizationId: organization.id, projectId: project.id, kind: 'entity', name: 'aaa_first', fields: entityFields, createdByUserId: owner.id });
    await registerSchemaDefinition({ organizationId: organization.id, projectId: project.id, kind: 'entity', name: 'zzz_second', fields: entityFields, createdByUserId: owner.id });

    const { calls, executor } = fakeExecutor((sql) => {
      if (sql.includes(martViewName(organization.id, project.id, 'aaa_first'))) {
        throw new WarehouseQueryFailedError('view DDL rejected for aaa_first');
      }
    });
    const result = await withDataset('growthos_core', () => syncAllSchemaMartViewsForProject(organization.id, project.id, executor));

    expect(result.warehouseConfigured).toBe(true);
    expect(result.errors).toEqual([{ schemaName: 'aaa_first', message: 'view DDL rejected for aaa_first' }]);
    expect(result.synced).toEqual([martViewName(organization.id, project.id, 'zzz_second')]);
    expect(calls).toHaveLength(2);
  });

  it('stops the sweep at the first not-configured outcome instead of continuing through the rest', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Schema Mart Not Configured Org');
    await registerSchemaDefinition({ organizationId: organization.id, projectId: project.id, kind: 'entity', name: 'aaa_first', fields: entityFields, createdByUserId: owner.id });
    await registerSchemaDefinition({ organizationId: organization.id, projectId: project.id, kind: 'entity', name: 'zzz_second', fields: entityFields, createdByUserId: owner.id });

    const executor: WarehouseQueryExecutor = { execute: () => Promise.reject(new WarehouseNotConfiguredError()) };
    const calls: string[] = [];
    const trackingExecutor: WarehouseQueryExecutor = { execute: (query) => { calls.push(query.sql); return executor.execute(query); } };

    const result = await withDataset('growthos_core', () => syncAllSchemaMartViewsForProject(organization.id, project.id, trackingExecutor));

    expect(result.warehouseConfigured).toBe(false);
    expect(result.synced).toEqual([]);
    expect(result.errors).toEqual([]);
    // Only the first (alphabetically earliest) schema's mart-sync should have run — proves the
    // loop breaks on the first not-configured outcome rather than continuing through the rest.
    expect(calls).toHaveLength(1);
  });

  it('only syncs the active version of an evolved schema family, not the superseded one', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Schema Mart Evolve Org');
    await registerSchemaDefinition({ organizationId: organization.id, projectId: project.id, kind: 'entity', name: 'customer', fields: entityFields, createdByUserId: owner.id });
    await evolveSchemaDefinition({
      organizationId: organization.id,
      projectId: project.id,
      kind: 'entity',
      name: 'customer',
      fields: [...entityFields, { name: 'segment', type: 'string', isRequired: false, isPii: false, isIdentityKey: false }],
      createdByUserId: owner.id,
    });

    const { calls, executor } = fakeExecutor();
    const result = await withDataset('growthos_core', () => syncAllSchemaMartViewsForProject(organization.id, project.id, executor));

    expect(result.synced).toEqual([martViewName(organization.id, project.id, 'customer')]);
    expect(calls).toHaveLength(1);
  });
});
