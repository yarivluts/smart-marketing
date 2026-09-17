import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  BreakingSchemaChangeError,
  createOrganizationWithOwner,
  createProject,
  DuplicateSchemaDefinitionError,
  ensureUserForFirebaseSession,
  evolveSchemaDefinition,
  getActiveSchemaDefinition,
  InvalidSchemaDefinitionError,
  listSchemaDefinitionsForProject,
  listSchemaDefinitionVersions,
  ProjectNotFoundError,
  describeSchemaDefinitionWarnings,
  previewSchemaDefinition,
  registerSchemaDefinition,
  SchemaDefNotFoundError,
  type SchemaFieldInput,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

/** Emulator-backed tests for KAN-31's Schema Registry service layer. */

beforeAll(async () => {
  await connectToFirestoreEmulator('schema-registry-tests');
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

const orderFieldsV1: SchemaFieldInput[] = [
  { name: 'order_id', type: 'string', isRequired: true, isPii: false, isIdentityKey: false },
  { name: 'user_id', type: 'string', isRequired: true, isPii: false, isIdentityKey: true },
  { name: 'net', type: 'number', isRequired: true, isPii: false, isIdentityKey: false },
];

describe('registerSchemaDefinition', () => {
  it('registers v1 of a new event schema', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Schema Register Org');
    const schemaDef = await registerSchemaDefinition({
      organizationId: organization.id,
      projectId: project.id,
      kind: 'event',
      name: 'order_completed',
      fields: orderFieldsV1,
      createdByUserId: owner.id,
    });

    expect(schemaDef.version).toBe(1);
    expect(schemaDef.status).toBe('active');
    expect(schemaDef.field_defs).toHaveLength(3);
    expect(schemaDef.field_defs.find((f) => f.name === 'user_id')?.is_identity_key).toBe(true);
  });

  it('rejects registering the same kind+name twice', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Schema Duplicate Org');
    await registerSchemaDefinition({
      organizationId: organization.id,
      projectId: project.id,
      kind: 'event',
      name: 'order_completed',
      fields: orderFieldsV1,
      createdByUserId: owner.id,
    });

    await expect(
      registerSchemaDefinition({
        organizationId: organization.id,
        projectId: project.id,
        kind: 'event',
        name: 'order_completed',
        fields: orderFieldsV1,
        createdByUserId: owner.id,
      }),
    ).rejects.toThrow(DuplicateSchemaDefinitionError);
  });

  it('rejects an unknown project id', async () => {
    const { owner, organization } = await setupOrgWithProject('Schema No Project Org');
    await expect(
      registerSchemaDefinition({
        organizationId: organization.id,
        projectId: 'does-not-exist',
        kind: 'event',
        name: 'order_completed',
        fields: orderFieldsV1,
        createdByUserId: owner.id,
      }),
    ).rejects.toThrow(ProjectNotFoundError);
  });

  it('rejects an empty field list, a duplicate field name, and an unknown field type', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Schema Invalid Fields Org');

    await expect(
      registerSchemaDefinition({
        organizationId: organization.id,
        projectId: project.id,
        kind: 'event',
        name: 'empty_fields',
        fields: [],
        createdByUserId: owner.id,
      }),
    ).rejects.toThrow(InvalidSchemaDefinitionError);

    await expect(
      registerSchemaDefinition({
        organizationId: organization.id,
        projectId: project.id,
        kind: 'event',
        name: 'dup_fields',
        fields: [
          { name: 'a', type: 'string', isRequired: true, isPii: false, isIdentityKey: false },
          { name: 'a', type: 'number', isRequired: false, isPii: false, isIdentityKey: false },
        ],
        createdByUserId: owner.id,
      }),
    ).rejects.toThrow(InvalidSchemaDefinitionError);

    await expect(
      registerSchemaDefinition({
        organizationId: organization.id,
        projectId: project.id,
        kind: 'event',
        name: 'bad_type',
        fields: [{ name: 'a', type: 'not_a_type', isRequired: true, isPii: false, isIdentityKey: false }],
        createdByUserId: owner.id,
      }),
    ).rejects.toThrow(InvalidSchemaDefinitionError);
  });

  it('rejects a measure/entity field name colliding with a mart view\'s own intrinsic column, but allows the same name on an event schema (which never gets a mart view)', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Schema Mart Reserved Field Org');

    // `client_id` is one of the mart's intrinsic columns
    // (`martIntrinsicColumnNames`, warehouse/schema-mart.ts) — declaring it on
    // a measure schema would make the generated mart view's own SELECT list
    // carry two `client_id` columns.
    await expect(
      registerSchemaDefinition({
        organizationId: organization.id,
        projectId: project.id,
        kind: 'measure',
        name: 'ad_performance_daily',
        fields: [
          { name: 'client_id', type: 'string', isRequired: true, isPii: false, isIdentityKey: false },
          { name: 'spend', type: 'number', isRequired: true, isPii: false, isIdentityKey: false },
        ],
        createdByUserId: owner.id,
      }),
    ).rejects.toThrow(InvalidSchemaDefinitionError);

    await expect(
      registerSchemaDefinition({
        organizationId: organization.id,
        projectId: project.id,
        kind: 'entity',
        name: 'customer',
        fields: [{ name: 'landed_at', type: 'string', isRequired: false, isPii: false, isIdentityKey: false }],
        createdByUserId: owner.id,
      }),
    ).rejects.toThrow(InvalidSchemaDefinitionError);

    // An `event` schema's fields never reach `buildMartViewSql` (events land
    // in the dbt-built `events` core table, not a mart view) — the same
    // field name that's rejected above is fine here.
    const eventSchema = await registerSchemaDefinition({
      organizationId: organization.id,
      projectId: project.id,
      kind: 'event',
      name: 'client_activity',
      fields: [{ name: 'client_id', type: 'string', isRequired: true, isPii: false, isIdentityKey: false }],
      createdByUserId: owner.id,
    });
    expect(eventSchema.field_defs.map((f) => f.name)).toEqual(['client_id']);
  });

  it('reserves the measure envelope\'s own value/ts on a measure schema only — an entity mart carries neither, so an entity may declare fields by those names', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Measure Envelope Reserved Field Org');

    for (const name of ['value', 'ts']) {
      await expect(
        registerSchemaDefinition({
          organizationId: organization.id,
          projectId: project.id,
          kind: 'measure',
          name: 'ad_spend_daily',
          fields: [{ name, type: 'number', isRequired: true, isPii: false, isIdentityKey: false }],
          createdByUserId: owner.id,
        }),
      ).rejects.toThrow(InvalidSchemaDefinitionError);
    }

    const entitySchema = await registerSchemaDefinition({
      organizationId: organization.id,
      projectId: project.id,
      kind: 'entity',
      name: 'contract',
      fields: [{ name: 'value', type: 'number', isRequired: true, isPii: false, isIdentityKey: false }],
      createdByUserId: owner.id,
    });
    expect(entitySchema.field_defs.map((f) => f.name)).toEqual(['value']);
  });
});

describe('evolveSchemaDefinition', () => {
  it('evolves v1 to v2 with an additive, optional field — both versions stay independently queryable', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Schema Evolve Org');
    await registerSchemaDefinition({
      organizationId: organization.id,
      projectId: project.id,
      kind: 'event',
      name: 'order_completed',
      fields: orderFieldsV1,
      createdByUserId: owner.id,
    });

    const v2Fields: SchemaFieldInput[] = [
      ...orderFieldsV1,
      { name: 'currency', type: 'string', isRequired: false, isPii: false, isIdentityKey: false },
    ];
    const v2 = await evolveSchemaDefinition({
      organizationId: organization.id,
      projectId: project.id,
      kind: 'event',
      name: 'order_completed',
      fields: v2Fields,
      createdByUserId: owner.id,
    });

    expect(v2.version).toBe(2);
    expect(v2.status).toBe('active');
    expect(v2.field_defs).toHaveLength(4);

    const versions = await listSchemaDefinitionVersions(organization.id, project.id, 'event', 'order_completed');
    expect(versions).toHaveLength(2);
    expect(versions[0].version).toBe(1);
    expect(versions[0].status).toBe('superseded');
    expect(versions[1].version).toBe(2);
    expect(versions[1].status).toBe('active');

    const active = await getActiveSchemaDefinition(organization.id, project.id, 'event', 'order_completed');
    expect(active?.version).toBe(2);
  });

  it('rejects evolving a schema that was never registered', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Schema Evolve Missing Org');
    await expect(
      evolveSchemaDefinition({
        organizationId: organization.id,
        projectId: project.id,
        kind: 'event',
        name: 'never_registered',
        fields: orderFieldsV1,
        createdByUserId: owner.id,
      }),
    ).rejects.toThrow(SchemaDefNotFoundError);
  });

  it('rejects an empty/whitespace name the same way registerSchemaDefinition does', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Schema Evolve Empty Name Org');
    await expect(
      evolveSchemaDefinition({
        organizationId: organization.id,
        projectId: project.id,
        kind: 'event',
        name: '   ',
        fields: orderFieldsV1,
        createdByUserId: owner.id,
      }),
    ).rejects.toThrow(InvalidSchemaDefinitionError);
  });

  it('rejects removing a field, changing a field type, tightening optional->required, and dropping an identity key', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Schema Breaking Org');
    await registerSchemaDefinition({
      organizationId: organization.id,
      projectId: project.id,
      kind: 'event',
      name: 'order_completed',
      fields: orderFieldsV1,
      createdByUserId: owner.id,
    });

    const removedField = orderFieldsV1.filter((f) => f.name !== 'net');
    await expect(
      evolveSchemaDefinition({
        organizationId: organization.id,
        projectId: project.id,
        kind: 'event',
        name: 'order_completed',
        fields: removedField,
        createdByUserId: owner.id,
      }),
    ).rejects.toThrow(BreakingSchemaChangeError);

    const changedType = orderFieldsV1.map((f) => (f.name === 'net' ? { ...f, type: 'string' } : f));
    await expect(
      evolveSchemaDefinition({
        organizationId: organization.id,
        projectId: project.id,
        kind: 'event',
        name: 'order_completed',
        fields: changedType,
        createdByUserId: owner.id,
      }),
    ).rejects.toThrow(BreakingSchemaChangeError);

    const newRequiredField: SchemaFieldInput[] = [
      ...orderFieldsV1,
      { name: 'shipping_country', type: 'string', isRequired: true, isPii: false, isIdentityKey: false },
    ];
    await expect(
      evolveSchemaDefinition({
        organizationId: organization.id,
        projectId: project.id,
        kind: 'event',
        name: 'order_completed',
        fields: newRequiredField,
        createdByUserId: owner.id,
      }),
    ).rejects.toThrow(BreakingSchemaChangeError);

    const droppedIdentityKey = orderFieldsV1.map((f) => (f.name === 'user_id' ? { ...f, isIdentityKey: false } : f));
    await expect(
      evolveSchemaDefinition({
        organizationId: organization.id,
        projectId: project.id,
        kind: 'event',
        name: 'order_completed',
        fields: droppedIdentityKey,
        createdByUserId: owner.id,
      }),
    ).rejects.toThrow(BreakingSchemaChangeError);

    // None of the rejected evolutions created a new version.
    const versions = await listSchemaDefinitionVersions(organization.id, project.id, 'event', 'order_completed');
    expect(versions).toHaveLength(1);
    expect(versions[0].status).toBe('active');
  });

  it('allows loosening an existing required field to optional', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Schema Loosen Org');
    await registerSchemaDefinition({
      organizationId: organization.id,
      projectId: project.id,
      kind: 'event',
      name: 'order_completed',
      fields: orderFieldsV1,
      createdByUserId: owner.id,
    });

    const loosened = orderFieldsV1.map((f) => (f.name === 'net' ? { ...f, isRequired: false } : f));
    const v2 = await evolveSchemaDefinition({
      organizationId: organization.id,
      projectId: project.id,
      kind: 'event',
      name: 'order_completed',
      fields: loosened,
      createdByUserId: owner.id,
    });
    expect(v2.field_defs.find((f) => f.name === 'net')?.is_required).toBe(false);
  });
});

describe('listSchemaDefinitionsForProject', () => {
  it('lists every version of every schema family in a project, isolated from other projects', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Schema List Org');
    const { project: otherProject } = await createProject({ organizationId: organization.id, name: 'Other App' });

    await registerSchemaDefinition({
      organizationId: organization.id,
      projectId: project.id,
      kind: 'event',
      name: 'order_completed',
      fields: orderFieldsV1,
      createdByUserId: owner.id,
    });
    await registerSchemaDefinition({
      organizationId: organization.id,
      projectId: project.id,
      kind: 'entity',
      name: 'customer',
      fields: [{ name: 'id', type: 'string', isRequired: true, isPii: false, isIdentityKey: true }],
      createdByUserId: owner.id,
    });
    await registerSchemaDefinition({
      organizationId: organization.id,
      projectId: otherProject.id,
      kind: 'event',
      name: 'order_completed',
      fields: orderFieldsV1,
      createdByUserId: owner.id,
    });

    const defs = await listSchemaDefinitionsForProject(organization.id, project.id);
    expect(defs).toHaveLength(2);
    expect(defs.map((d) => `${d.kind}:${d.name}`).sort()).toEqual(['entity:customer', 'event:order_completed']);

    const otherDefs = await listSchemaDefinitionsForProject(organization.id, otherProject.id);
    expect(otherDefs).toHaveLength(1);
  });
});

describe('previewSchemaDefinition', () => {
  it('reports what would be created and writes nothing', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Schema Preview Org');
    const preview = await previewSchemaDefinition({
      organizationId: organization.id,
      projectId: project.id,
      kind: 'event',
      name: 'order_completed',
      fields: orderFieldsV1,
      createdByUserId: owner.id,
    });

    expect(preview.version).toBe(1);
    expect(preview.kind).toBe('event');
    expect(preview.name).toBe('order_completed');
    expect(preview.wouldConflict).toBe(false);
    expect(preview.fields.map((f) => f.name)).toEqual(['order_id', 'user_id', 'net']);
    expect(preview.fields.find((f) => f.name === 'user_id')?.is_identity_key).toBe(true);

    // The whole point: a preview must not spend the one chance the caller has.
    expect(await listSchemaDefinitionsForProject(organization.id, project.id)).toHaveLength(0);
  });

  it('previewing twice still creates nothing, so a batch can be re-run', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Schema Preview Twice Org');
    const request = {
      organizationId: organization.id,
      projectId: project.id,
      kind: 'event',
      name: 'order_completed',
      fields: orderFieldsV1,
      createdByUserId: owner.id,
    };
    await previewSchemaDefinition(request);
    const second = await previewSchemaDefinition(request);

    expect(second.wouldConflict).toBe(false);
    expect(await listSchemaDefinitionsForProject(organization.id, project.id)).toHaveLength(0);
  });

  it('reports a name already taken as wouldConflict rather than throwing', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Schema Preview Conflict Org');
    const request = {
      organizationId: organization.id,
      projectId: project.id,
      kind: 'event',
      name: 'order_completed',
      fields: orderFieldsV1,
      createdByUserId: owner.id,
    };
    await registerSchemaDefinition(request);

    // Thrown, this would stop a caller previewing 8 schemas at the first
    // collision and hide the other 7 answers.
    const preview = await previewSchemaDefinition(request);
    expect(preview.wouldConflict).toBe(true);
    expect(await listSchemaDefinitionsForProject(organization.id, project.id)).toHaveLength(1);
  });

  it('still throws on genuinely invalid input, because that error is the report', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Schema Preview Invalid Org');
    await expect(
      previewSchemaDefinition({
        organizationId: organization.id,
        projectId: project.id,
        kind: 'not_a_kind',
        name: 'order_completed',
        fields: orderFieldsV1,
        createdByUserId: owner.id,
      }),
    ).rejects.toThrow();
  });

});

describe('envelope fields declared required are warned about, not refused', () => {
  it('registers a required customer_id but warns that it will quarantine unidentified traffic', async () => {
    // Blocking this was tried and was wrong by its own justification: "optional
    // loses nothing" is false for a sender that always supplies the field and
    // wants the guarantee. So the consequence is made loud instead, at the last
    // moment it is useful, since registration cannot be undone.
    const { owner, organization, project } = await setupOrgWithProject('Schema Envelope Org');
    const schemaDef = await registerSchemaDefinition({
      organizationId: organization.id,
      projectId: project.id,
      kind: 'event',
      name: 'signup',
      fields: [
        { name: 'plan', type: 'string', isRequired: false, isPii: false, isIdentityKey: false },
        { name: 'customer_id', type: 'string', isRequired: true, isPii: false, isIdentityKey: true },
      ],
      createdByUserId: owner.id,
    });

    expect(schemaDef.field_defs.find((f) => f.name === 'customer_id')?.is_required).toBe(true);
    const warnings = describeSchemaDefinitionWarnings(schemaDef.kind, schemaDef.field_defs);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('customer_id');
    expect(warnings[0]).toContain('identify()');
    expect(warnings[0]).toContain('cannot be undone');
  });

  it('warns differently about a required anon_id, because it is absent for a different reason', async () => {
    // anon_id is attached to every event once an anon id exists, so requiring it
    // is a much smaller risk than customer_id and a real project does configure
    // it that way - see touchpoint-capture.emulator.test.ts. The warning says
    // which risk it is rather than treating the two as the same.
    const { owner, organization, project } = await setupOrgWithProject('Schema Envelope Anon Org');
    const schemaDef = await registerSchemaDefinition({
      organizationId: organization.id,
      projectId: project.id,
      kind: 'event',
      name: 'page_view',
      fields: [{ name: 'anon_id', type: 'string', isRequired: true, isPii: false, isIdentityKey: true }],
      createdByUserId: owner.id,
    });

    const warnings = describeSchemaDefinitionWarnings(schemaDef.kind, schemaDef.field_defs);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('anon_id');
    expect(warnings[0]).toContain('first event');
    expect(warnings[0]).not.toContain('identify()');
  });

  it('says nothing about an optional envelope field, which is the ordinary stitching opt-in', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Schema Envelope Optional Org');
    const schemaDef = await registerSchemaDefinition({
      organizationId: organization.id,
      projectId: project.id,
      kind: 'event',
      name: 'charge_succeeded',
      fields: [
        { name: 'charge_id', type: 'string', isRequired: true, isPii: false, isIdentityKey: true },
        { name: 'customer_id', type: 'string', isRequired: false, isPii: false, isIdentityKey: true },
      ],
      createdByUserId: owner.id,
    });

    expect(describeSchemaDefinitionWarnings(schemaDef.kind, schemaDef.field_defs)).toEqual([]);
  });

  it('says nothing about an entity schema, where these are ordinary columns', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Schema Envelope Entity Org');
    const schemaDef = await registerSchemaDefinition({
      organizationId: organization.id,
      projectId: project.id,
      kind: 'entity',
      name: 'subscription',
      fields: [{ name: 'customer_id', type: 'string', isRequired: true, isPii: false, isIdentityKey: true }],
      createdByUserId: owner.id,
    });

    expect(describeSchemaDefinitionWarnings(schemaDef.kind, schemaDef.field_defs)).toEqual([]);
  });

  it('surfaces the same warning from a dry run, before anything is written', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Schema Envelope Preview Org');
    const preview = await previewSchemaDefinition({
      organizationId: organization.id,
      projectId: project.id,
      kind: 'event',
      name: 'signup',
      fields: [{ name: 'customer_id', type: 'string', isRequired: true, isPii: false, isIdentityKey: true }],
      createdByUserId: owner.id,
    });

    expect(preview.warnings).toHaveLength(1);
    expect(preview.warnings[0]).toContain('customer_id');
    expect(await listSchemaDefinitionsForProject(organization.id, project.id)).toHaveLength(0);
  });
});
