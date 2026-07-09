import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  buildTouchpointEventPayload,
  buildTrackedEventPayload,
  parseAcquisitionParams,
} from '@growthos/shared';
import {
  createOrganizationWithOwner,
  createProject,
  ensureTouchpointSchemaRegistered,
  ensureUserForFirebaseSession,
  getActiveSchemaDefinition,
  ingestBatch,
  listRawRecordsForBatch,
  registerSchemaDefinition,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

/** Emulator-backed tests for KAN-57's touchpoint-capture schema seeding and its real end-to-end ingest path. */

beforeAll(async () => {
  await connectToFirestoreEmulator('touchpoint-capture-tests');
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

describe('ensureTouchpointSchemaRegistered', () => {
  it('registers v1 of the touchpoint schema when none exists yet', async () => {
    const { owner, organization, project } = await setupProject('Touchpoint Schema Org');

    const result = await ensureTouchpointSchemaRegistered({
      organizationId: organization.id,
      projectId: project.id,
      createdByUserId: owner.id,
    });

    expect(result.registered).toBe(true);
    expect(result.schemaDef.kind).toBe('event');
    expect(result.schemaDef.name).toBe('touchpoint');
    expect(result.schemaDef.version).toBe(1);
    expect(result.schemaDef.field_defs.find((field) => field.name === 'click_id')?.is_identity_key).toBe(true);
  });

  it('is a no-op when an active touchpoint schema already exists', async () => {
    const { owner, organization, project } = await setupProject('Touchpoint Schema Idempotent Org');

    const first = await ensureTouchpointSchemaRegistered({
      organizationId: organization.id,
      projectId: project.id,
      createdByUserId: owner.id,
    });
    const second = await ensureTouchpointSchemaRegistered({
      organizationId: organization.id,
      projectId: project.id,
      createdByUserId: owner.id,
    });

    expect(second.registered).toBe(false);
    expect(second.schemaDef.id).toBe(first.schemaDef.id);

    const active = await getActiveSchemaDefinition(organization.id, project.id, 'event', 'touchpoint');
    expect(active?.version).toBe(1);
  });
});

describe('touchpoint capture end-to-end (KAN-57 AC: "GCLID present on a test conversion end-to-end")', () => {
  it('lands a gclid captured at entry, then links a later signup to it via anon_id', async () => {
    const { owner, organization, project, prodEnvironment } = await setupProject('Touchpoint E2E Org');

    await ensureTouchpointSchemaRegistered({
      organizationId: organization.id,
      projectId: project.id,
      createdByUserId: owner.id,
    });
    // The signup event's own schema is the project's to define — KAN-57 only ships
    // the touchpoint side. Registering `anon_id` as an identity key here is exactly
    // the "the stitching engine works off registered identity keys, not hard-coded
    // ones" contract (plan `08 §1`) a real project would configure once via the
    // Schema Registry admin page.
    await registerSchemaDefinition({
      organizationId: organization.id,
      projectId: project.id,
      kind: 'event',
      name: 'signup',
      fields: [{ name: 'anon_id', type: 'string', isRequired: true, isPii: false, isIdentityKey: true }],
      createdByUserId: owner.id,
    });

    // Step 1: the tracker's page() call, at the visitor's first entry via a paid
    // Google Ads click, captures the gclid and mints a fresh anon id.
    const anonId = 'anon_e2e_test';
    const acquisition = parseAcquisitionParams({
      url: 'https://example.com/landing?gclid=gclid_test_123&utm_source=google&utm_medium=cpc&utm_campaign=spring_sale',
    });
    const touchpointPayload = buildTouchpointEventPayload({ anonId, ts: '2026-07-09T09:00:00.000Z', params: acquisition });

    const touchpointSummary = await ingestBatch({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      input: { kind: 'event', records: [touchpointPayload] },
    });
    expect(touchpointSummary.accepted).toBe(1);
    expect(touchpointSummary.quarantined).toBe(0);

    const touchpointRawRecords = await listRawRecordsForBatch(organization.id, project.id, touchpointSummary.batchId);
    expect(touchpointRawRecords).toHaveLength(1);
    // The GCLID is genuinely landed in the warehouse raw layer, not just accepted
    // in the 202 response — this is what the AC's "end-to-end" actually means.
    expect(touchpointRawRecords[0].payload.properties).toMatchObject({ click_id: 'gclid_test_123', channel: 'paid_search' });
    expect(touchpointRawRecords[0].client_id).toBe(anonId);

    // Step 2: later, the visitor converts. The tracker's track()/identify() call
    // attaches the same anon_id, so the conversion event carries the evidence
    // KAN-56's `bridge_identity` needs to resolve it back to this touchpoint.
    const signupPayload = buildTrackedEventPayload({
      eventId: 'evt_signup_1',
      eventName: 'signup',
      ts: '2026-07-09T09:05:00.000Z',
      anonId,
    });

    const signupSummary = await ingestBatch({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      input: { kind: 'event', records: [signupPayload] },
    });
    expect(signupSummary.accepted).toBe(1);
    expect(signupSummary.quarantined).toBe(0);

    const signupRawRecords = await listRawRecordsForBatch(organization.id, project.id, signupSummary.batchId);
    expect(signupRawRecords[0].payload.properties).toMatchObject({ anon_id: anonId });
  });

  it('quarantines the touchpoint event until the schema is registered, exactly like any other unregistered event', async () => {
    const { organization, project, prodEnvironment } = await setupProject('Touchpoint Unregistered Org');

    const payload = buildTouchpointEventPayload({
      anonId: 'anon_unregistered',
      ts: '2026-07-09T09:00:00.000Z',
      params: parseAcquisitionParams({ url: 'https://example.com/?gclid=g1' }),
    });

    const summary = await ingestBatch({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: prodEnvironment.id,
      input: { kind: 'event', records: [payload] },
    });

    expect(summary.accepted).toBe(0);
    expect(summary.quarantined).toBe(1);
  });
});
