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
