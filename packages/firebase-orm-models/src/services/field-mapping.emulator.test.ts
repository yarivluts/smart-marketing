import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createFieldMapping,
  createHookEndpoint,
  createOrganizationWithOwner,
  createProject,
  disableFieldMapping,
  ensureUserForFirebaseSession,
  EnvironmentNotFoundError,
  FieldMappingNotFoundError,
  InvalidFieldMappingError,
  InvalidSamplePayloadError,
  listFieldMappingsForProject,
  listHookDeliveriesForProject,
  ProjectNotFoundError,
  receiveHookPayload,
  registerSchemaDefinition,
  suggestFieldMappingRules,
  TargetSchemaNotRegisteredError,
  testRunFieldMapping,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

/** Emulator-backed tests for KAN-54's mapping engine: saved field-mappings CRUD + test-run on sample. */

beforeAll(async () => {
  await connectToFirestoreEmulator('field-mapping-service-tests');
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function uniqueEmail(prefix: string): string {
  return `${unique(prefix)}@example.com`;
}

async function setupProject(orgName: string) {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('owner') });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project, environments } = await createProject({ organizationId: organization.id, name: 'Website' });
  const prodEnvironment = environments.find((e) => e.name === 'prod')!;
  return { owner, organization, project, prodEnvironment };
}

async function registerOrderCompletedSchema(organizationId: string, projectId: string, createdByUserId: string) {
  return registerSchemaDefinition({
    organizationId,
    projectId,
    kind: 'event',
    name: 'order_completed',
    fields: [
      { name: 'order_id', type: 'string', isRequired: true, isPii: false, isIdentityKey: true },
      { name: 'total_price', type: 'number', isRequired: true, isPii: false, isIdentityKey: false },
      { name: 'email', type: 'string', isRequired: false, isPii: true, isIdentityKey: false },
    ],
    createdByUserId,
  });
}

const VALID_EVENT_RULES = [
  { targetField: 'event_id', transform: 'template', template: 'shopify-order-{{id}}' },
  { targetField: 'event', transform: 'static', staticValue: 'order_completed' },
  { targetField: 'ts', transform: 'rename', sourcePath: 'created_at' },
  { targetField: 'properties.order_id', transform: 'cast', sourcePath: 'id', castType: 'string' },
  { targetField: 'properties.total_price', transform: 'cast', sourcePath: 'total_price', castType: 'number' },
  { targetField: 'properties.email', transform: 'rename', sourcePath: 'customer.email' },
];

const SAMPLE_SHOPIFY_PAYLOAD = JSON.stringify({
  id: 820982911946154500,
  created_at: '2024-03-15T09:32:00-05:00',
  total_price: '398.00',
  customer: { email: 'jon@example.com' },
});

describe('createFieldMapping', () => {
  it('saves a mapping once its target schema is registered', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('Mapping Create Org');
    await registerOrderCompletedSchema(organization.id, project.id, owner.id);

    const mapping = await createFieldMapping({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      name: 'Shopify orders -> order_completed',
      kind: 'event',
      schemaName: 'order_completed',
      rules: VALID_EVENT_RULES,
      createdByUserId: owner.id,
    });

    expect(mapping.name).toBe('Shopify orders -> order_completed');
    expect(mapping.kind).toBe('event');
    expect(mapping.rules).toHaveLength(VALID_EVENT_RULES.length);
    expect(mapping.disabled_at).toBeUndefined();
  });

  it('rejects a mapping whose target schema has no active version', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('Mapping No Schema Org');

    await expect(
      createFieldMapping({
        organizationId: organization.id,
        projectId: project.id,
        environmentId: prodEnvironment.id,
        name: 'x',
        kind: 'event',
        schemaName: 'order_completed',
        rules: VALID_EVENT_RULES,
        createdByUserId: owner.id,
      }),
    ).rejects.toBeInstanceOf(TargetSchemaNotRegisteredError);
  });

  it('rejects an incomplete rule set (missing a required envelope field)', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('Mapping Incomplete Org');
    await registerOrderCompletedSchema(organization.id, project.id, owner.id);

    await expect(
      createFieldMapping({
        organizationId: organization.id,
        projectId: project.id,
        environmentId: prodEnvironment.id,
        name: 'x',
        kind: 'event',
        schemaName: 'order_completed',
        rules: VALID_EVENT_RULES.filter((rule) => rule.targetField !== 'ts'),
        createdByUserId: owner.id,
      }),
    ).rejects.toBeInstanceOf(InvalidFieldMappingError);
  });

  it('rejects an unknown project', async () => {
    const { owner, organization, prodEnvironment } = await setupProject('Mapping No Project Org');

    await expect(
      createFieldMapping({
        organizationId: organization.id,
        projectId: 'does-not-exist',
        environmentId: prodEnvironment.id,
        name: 'x',
        kind: 'event',
        schemaName: 'order_completed',
        rules: VALID_EVENT_RULES,
        createdByUserId: owner.id,
      }),
    ).rejects.toBeInstanceOf(ProjectNotFoundError);
  });

  it('rejects an environment that does not belong to the project', async () => {
    const first = await setupProject('Mapping Env Owner Org');
    const second = await setupProject('Mapping Env Borrower Org');
    await registerOrderCompletedSchema(second.organization.id, second.project.id, second.owner.id);

    await expect(
      createFieldMapping({
        organizationId: second.organization.id,
        projectId: second.project.id,
        environmentId: first.prodEnvironment.id,
        name: 'x',
        kind: 'event',
        schemaName: 'order_completed',
        rules: VALID_EVENT_RULES,
        createdByUserId: second.owner.id,
      }),
    ).rejects.toBeInstanceOf(EnvironmentNotFoundError);
  });
});

describe('listFieldMappingsForProject / disableFieldMapping', () => {
  it('lists every mapping (active or disabled) and disables idempotently', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('Mapping List Org');
    await registerOrderCompletedSchema(organization.id, project.id, owner.id);

    const a = await createFieldMapping({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      name: 'A',
      kind: 'event',
      schemaName: 'order_completed',
      rules: VALID_EVENT_RULES,
      createdByUserId: owner.id,
    });
    const b = await createFieldMapping({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      name: 'B',
      kind: 'event',
      schemaName: 'order_completed',
      rules: VALID_EVENT_RULES,
      createdByUserId: owner.id,
    });

    const disabled = await disableFieldMapping({
      organizationId: organization.id,
      projectId: project.id,
      fieldMappingId: b.id,
      disabledByUserId: owner.id,
    });
    expect(disabled.disabled_at).toBeTruthy();

    // Re-disabling is safe, not an error.
    const disabledAgain = await disableFieldMapping({
      organizationId: organization.id,
      projectId: project.id,
      fieldMappingId: b.id,
      disabledByUserId: owner.id,
    });
    expect(disabledAgain.disabled_at).toBeTruthy();

    const listed = await listFieldMappingsForProject(organization.id, project.id);
    expect(listed.map((m) => m.name).sort()).toEqual(['A', 'B']);
    expect(listed.find((m) => m.id === a.id)?.disabled_at).toBeUndefined();
    expect(listed.find((m) => m.id === b.id)?.disabled_at).toBeTruthy();
  });

  it('rejects disabling a mapping that does not exist in this project', async () => {
    const { owner, organization, project } = await setupProject('Mapping Disable Missing Org');

    await expect(
      disableFieldMapping({
        organizationId: organization.id,
        projectId: project.id,
        fieldMappingId: 'does-not-exist',
        disabledByUserId: owner.id,
      }),
    ).rejects.toBeInstanceOf(FieldMappingNotFoundError);
  });
});

describe('testRunFieldMapping', () => {
  it('maps a sample Shopify payload to a schema-valid record, against a saved mapping', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('Mapping Test Run Org');
    await registerOrderCompletedSchema(organization.id, project.id, owner.id);
    const mapping = await createFieldMapping({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      name: 'Shopify orders -> order_completed',
      kind: 'event',
      schemaName: 'order_completed',
      rules: VALID_EVENT_RULES,
      createdByUserId: owner.id,
    });

    const result = await testRunFieldMapping({
      organizationId: organization.id,
      projectId: project.id,
      fieldMappingId: mapping.id,
      samplePayload: SAMPLE_SHOPIFY_PAYLOAD,
    });

    expect(result.errors).toEqual([]);
    expect(result.envelopeErrors).toEqual([]);
    expect(result.schemaRegistered).toBe(true);
    expect(result.schemaValidationErrors).toEqual([]);
    expect(result.record).toEqual({
      event_id: 'shopify-order-820982911946154500',
      event: 'order_completed',
      ts: '2024-03-15T09:32:00-05:00',
      properties: { order_id: '820982911946154500', total_price: 398, email: 'jon@example.com' },
    });
  });

  it('test-runs an unsaved draft mapping (kind + rules given directly)', async () => {
    const { owner, organization, project } = await setupProject('Mapping Draft Run Org');
    await registerOrderCompletedSchema(organization.id, project.id, owner.id);

    const result = await testRunFieldMapping({
      organizationId: organization.id,
      projectId: project.id,
      kind: 'event',
      schemaName: 'order_completed',
      rules: VALID_EVENT_RULES,
      samplePayload: SAMPLE_SHOPIFY_PAYLOAD,
    });

    expect(result.errors).toEqual([]);
    expect(result.schemaValidationErrors).toEqual([]);
  });

  it('surfaces mapping-level errors without a schema check when a source path is missing from the sample', async () => {
    const { owner, organization, project } = await setupProject('Mapping Missing Source Org');
    await registerOrderCompletedSchema(organization.id, project.id, owner.id);

    const result = await testRunFieldMapping({
      organizationId: organization.id,
      projectId: project.id,
      kind: 'event',
      schemaName: 'order_completed',
      rules: VALID_EVENT_RULES,
      samplePayload: JSON.stringify({ id: 1, created_at: '2024-01-01T00:00:00Z' }),
    });

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.schemaRegistered).toBe(false);
    expect(result.schemaValidationErrors).toEqual([]);
  });

  it('surfaces schema validation errors when the mapped record has a field the schema rejects', async () => {
    const { owner, organization, project } = await setupProject('Mapping Schema Mismatch Org');
    await registerOrderCompletedSchema(organization.id, project.id, owner.id);

    const result = await testRunFieldMapping({
      organizationId: organization.id,
      projectId: project.id,
      kind: 'event',
      schemaName: 'order_completed',
      rules: [
        ...VALID_EVENT_RULES,
        { targetField: 'properties.unregistered', transform: 'static', staticValue: 'x' },
      ],
      samplePayload: SAMPLE_SHOPIFY_PAYLOAD,
    });

    expect(result.errors).toEqual([]);
    expect(result.schemaRegistered).toBe(true);
    expect(result.schemaValidationErrors).toEqual(['unregistered_field:unregistered']);
  });

  it('reports schemaRegistered=false when the target schema name has no active version', async () => {
    const { organization, project } = await setupProject('Mapping Unregistered Schema Org');

    const result = await testRunFieldMapping({
      organizationId: organization.id,
      projectId: project.id,
      kind: 'event',
      schemaName: 'does_not_exist',
      rules: VALID_EVENT_RULES,
      samplePayload: SAMPLE_SHOPIFY_PAYLOAD,
    });

    expect(result.errors).toEqual([]);
    expect(result.schemaRegistered).toBe(false);
  });

  it('prefills the sample from a queued hook delivery without changing its status', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('Mapping From Delivery Org');
    await registerOrderCompletedSchema(organization.id, project.id, owner.id);
    const endpoint = await createHookEndpoint({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      name: 'Shopify',
      signatureMode: 'none',
      createdByUserId: owner.id,
    });
    const received = await receiveHookPayload({ hookId: endpoint.hook_id, rawBody: SAMPLE_SHOPIFY_PAYLOAD, headers: {} });
    if (!received.ok) throw new Error('expected the delivery to be accepted');

    const result = await testRunFieldMapping({
      organizationId: organization.id,
      projectId: project.id,
      kind: 'event',
      schemaName: 'order_completed',
      rules: VALID_EVENT_RULES,
      hookDeliveryId: received.value.delivery.id,
    });

    expect(result.errors).toEqual([]);
    expect(result.record.event_id).toBe('shopify-order-820982911946154500');

    const deliveries = await listHookDeliveriesForProject(organization.id, project.id);
    expect(deliveries.find((delivery) => delivery.id === received.value.delivery.id)?.status).toBe('pending');
  });

  it('rejects a sample payload that is not valid JSON', async () => {
    const { organization, project } = await setupProject('Mapping Invalid JSON Org');

    await expect(
      testRunFieldMapping({
        organizationId: organization.id,
        projectId: project.id,
        kind: 'event',
        schemaName: 'order_completed',
        rules: VALID_EVENT_RULES,
        samplePayload: '{not json',
      }),
    ).rejects.toBeInstanceOf(InvalidSamplePayloadError);
  });

  it('rejects an invalid draft rule set before ever looking at the sample', async () => {
    const { organization, project } = await setupProject('Mapping Invalid Draft Org');

    await expect(
      testRunFieldMapping({
        organizationId: organization.id,
        projectId: project.id,
        kind: 'event',
        schemaName: 'order_completed',
        rules: [{ targetField: 'event_id', transform: 'rename' }],
        samplePayload: SAMPLE_SHOPIFY_PAYLOAD,
      }),
    ).rejects.toBeInstanceOf(InvalidFieldMappingError);
  });
});

describe('suggestFieldMappingRules', () => {
  it('proposes rules against the registered schema fields from a sample payload', async () => {
    const { owner, organization, project } = await setupProject('Mapping Suggest Org');
    await registerOrderCompletedSchema(organization.id, project.id, owner.id);

    const { suggestions } = await suggestFieldMappingRules({
      organizationId: organization.id,
      projectId: project.id,
      kind: 'event',
      schemaName: 'order_completed',
      samplePayload: SAMPLE_SHOPIFY_PAYLOAD,
    });

    const byTarget = new Map(suggestions.map((s) => [s.targetField, s]));
    expect(byTarget.get('properties.order_id')).toMatchObject({ transform: 'cast', sourcePath: 'id', castType: 'string' });
    expect(byTarget.get('properties.total_price')).toMatchObject({ transform: 'cast', sourcePath: 'total_price', castType: 'number' });
    expect(byTarget.get('properties.email')).toMatchObject({ transform: 'rename', sourcePath: 'customer.email' });
    expect(byTarget.get('ts')).toMatchObject({ transform: 'cast', sourcePath: 'created_at', castType: 'timestamp' });

    // Every suggestion should apply cleanly against the very sample it was proposed from.
    for (const suggestion of suggestions) {
      expect(suggestion.confidence).toBeGreaterThan(0);
    }
  });

  it('rejects a target schema with no active version', async () => {
    const { organization, project } = await setupProject('Mapping Suggest No Schema Org');

    await expect(
      suggestFieldMappingRules({
        organizationId: organization.id,
        projectId: project.id,
        kind: 'event',
        schemaName: 'does_not_exist',
        samplePayload: SAMPLE_SHOPIFY_PAYLOAD,
      }),
    ).rejects.toBeInstanceOf(TargetSchemaNotRegisteredError);
  });

  it('rejects a sample payload that is not valid JSON', async () => {
    const { owner, organization, project } = await setupProject('Mapping Suggest Invalid JSON Org');
    await registerOrderCompletedSchema(organization.id, project.id, owner.id);

    await expect(
      suggestFieldMappingRules({
        organizationId: organization.id,
        projectId: project.id,
        kind: 'event',
        schemaName: 'order_completed',
        samplePayload: '{not json',
      }),
    ).rejects.toBeInstanceOf(InvalidSamplePayloadError);
  });

  it('rejects an unknown project', async () => {
    const { organization } = await setupProject('Mapping Suggest No Project Org');

    await expect(
      suggestFieldMappingRules({
        organizationId: organization.id,
        projectId: 'does-not-exist',
        kind: 'event',
        schemaName: 'order_completed',
        samplePayload: SAMPLE_SHOPIFY_PAYLOAD,
      }),
    ).rejects.toBeInstanceOf(ProjectNotFoundError);
  });
});
