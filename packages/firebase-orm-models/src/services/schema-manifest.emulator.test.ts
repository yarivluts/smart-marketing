import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  applySchemaManifest,
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  getActiveSchemaDefinition,
  listSchemaDefinitionsForProject,
  planSchemaManifest,
  registerSchemaDefinition,
  type SchemaFieldInput,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

/** KAN-202 I2: register and evolve a project's schemas from one manifest, with a dry-run diff. */

beforeAll(async () => {
  await connectToFirestoreEmulator('schema-manifest-tests');
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

async function setupProjectWithSignup(orgName: string) {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: `${unique('owner')}@example.com` });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  await registerSchemaDefinition({ organizationId: organization.id, projectId: project.id, kind: 'event', name: 'signup', fields: [field('plan')], createdByUserId: owner.id });
  return { owner, organizationId: organization.id, projectId: project.id };
}

function field(name: string, overrides: Partial<SchemaFieldInput> = {}): SchemaFieldInput {
  return { name, type: 'string', isRequired: false, isPii: false, isIdentityKey: false, ...overrides };
}

describe('planSchemaManifest', () => {
  it('reports register, evolve and unchanged per schema, and writes nothing', async () => {
    const { organizationId, projectId } = await setupProjectWithSignup('Manifest Plan Org');
    const plan = await planSchemaManifest({
      organizationId,
      projectId,
      schemas: [
        { kind: 'event', name: 'signup', fields: [field('plan'), field('source')] },
        { kind: 'event', name: 'document_signed', fields: [field('document_id', { isRequired: true })] },
        { kind: 'entity', name: 'customer', fields: [field('email', { isPii: true })] },
      ],
    });

    expect(plan.applicable).toBe(true);
    expect(plan.entries.map((entry) => [entry.name, entry.action, entry.currentVersion, entry.nextVersion, entry.addedFields])).toEqual([
      ['signup', 'evolve', 1, 2, ['source']],
      ['document_signed', 'register', null, 1, ['document_id']],
      ['customer', 'register', null, 1, ['email']],
    ]);
    // A dry run is only a dry run: the registry is exactly as before.
    expect((await listSchemaDefinitionsForProject(organizationId, projectId)).map((def) => `${def.name}:v${def.version}`)).toEqual(['signup:v1']);
  });

  it('calls an identical declaration unchanged, and a flag change an evolve that names the field', async () => {
    const { organizationId, projectId } = await setupProjectWithSignup('Manifest Unchanged Org');
    const same = await planSchemaManifest({ organizationId, projectId, schemas: [{ kind: 'event', name: 'signup', fields: [field('plan')] }] });
    expect(same.entries[0]).toMatchObject({ action: 'unchanged', nextVersion: null, addedFields: [], changedFields: [] });

    const piiNow = await planSchemaManifest({ organizationId, projectId, schemas: [{ kind: 'event', name: 'signup', fields: [field('plan', { isPii: true })] }] });
    expect(piiNow.entries[0]).toMatchObject({ action: 'evolve', changedFields: ['plan'], addedFields: [] });
  });

  it('blocks a breaking change with the same reasons evolve_schema gives, and marks the plan not applicable', async () => {
    const { organizationId, projectId } = await setupProjectWithSignup('Manifest Blocked Org');
    const plan = await planSchemaManifest({ organizationId, projectId, schemas: [{ kind: 'event', name: 'signup', fields: [field('tier', { isRequired: true })] }] });
    expect(plan.applicable).toBe(false);
    expect(plan.entries[0].action).toBe('blocked');
    expect(plan.entries[0].problems).toEqual(['Field "plan" was removed.', 'New field "tier" cannot be required in a non-breaking evolution.']);
  });

  it('marks an invalid declaration and a schema named twice as invalid', async () => {
    const { organizationId, projectId } = await setupProjectWithSignup('Manifest Invalid Org');
    const plan = await planSchemaManifest({
      organizationId,
      projectId,
      schemas: [
        { kind: 'widget', name: 'x', fields: [] },
        { kind: 'event', name: 'lead', fields: [field('channel')] },
        { kind: 'event', name: 'lead', fields: [field('channel')] },
      ],
    });
    expect(plan.applicable).toBe(false);
    expect(plan.entries.map((entry) => entry.action)).toEqual(['invalid', 'register', 'invalid']);
    expect(plan.entries[0].problems).toEqual(['Unknown schema kind "widget".']);
    expect(plan.entries[2].problems[0]).toContain('more than once');
  });
});

describe('applySchemaManifest', () => {
  it('registers and evolves every entry, after which the same manifest plans as all unchanged', async () => {
    const { owner, organizationId, projectId } = await setupProjectWithSignup('Manifest Apply Org');
    const schemas = [
      { kind: 'event', name: 'signup', fields: [field('plan'), field('source')] },
      { kind: 'event', name: 'document_signed', fields: [field('document_id', { isRequired: true })] },
    ];
    const result = await applySchemaManifest({ organizationId, projectId, schemas, createdByUserId: owner.id });
    expect(result.applied).toBe(true);
    expect((await getActiveSchemaDefinition(organizationId, projectId, 'event', 'signup'))?.version).toBe(2);
    expect((await getActiveSchemaDefinition(organizationId, projectId, 'event', 'document_signed'))?.version).toBe(1);

    const again = await planSchemaManifest({ organizationId, projectId, schemas });
    expect(again.entries.map((entry) => entry.action)).toEqual(['unchanged', 'unchanged']);
  });

  it('writes nothing at all when any entry is blocked, even the valid ones', async () => {
    const { owner, organizationId, projectId } = await setupProjectWithSignup('Manifest All Or Nothing Org');
    const result = await applySchemaManifest({
      organizationId,
      projectId,
      schemas: [
        { kind: 'event', name: 'document_signed', fields: [field('document_id')] },
        { kind: 'event', name: 'signup', fields: [field('tier')] },
      ],
      createdByUserId: owner.id,
    });
    expect(result.applied).toBe(false);
    expect(result.plan.entries.map((entry) => entry.action)).toEqual(['register', 'blocked']);
    expect(await getActiveSchemaDefinition(organizationId, projectId, 'event', 'document_signed')).toBeNull();
  });
});
