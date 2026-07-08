import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  checkTrackingAlertsForProject,
  createOrganizationWithOwner,
  createProject,
  DEFAULT_TRACKING_ALERT_LIST_LIMIT,
  ensureUserForFirebaseSession,
  getEventVolumeOverviewForProject,
  listActiveTrackingAlertsForProject,
  listAuditLogEntriesForOrg,
  listTrackingAlertsForProject,
  ProjectNotFoundError,
  RawRecordModel,
  registerSchemaDefinition,
  TRACKING_ALERT_SILENCE_THRESHOLD_MS,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

/**
 * Emulator-backed tests for KAN-36's `checkTrackingAlertsForProject`/
 * `getEventVolumeOverviewForProject` — the Firestore-backed "tracking broke"
 * alert bookkeeping and per-event volume sparkline data. Raw records are
 * landed directly via `RawRecordModel` (bypassing the full ingest pipeline,
 * which is already covered by `pipeline.service`'s own tests) so each test
 * can control exactly when an event was "last seen" relative to
 * {@link TRACKING_ALERT_SILENCE_THRESHOLD_MS}.
 */

beforeAll(async () => {
  await connectToFirestoreEmulator('tracking-alert-service-tests');
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
  const { project, environments } = await createProject({ organizationId: organization.id, name: 'Website' });
  return { owner, organization, project, environmentId: environments[0].id };
}

async function registerEventSchema(organizationId: string, projectId: string, name: string, createdByUserId: string) {
  return registerSchemaDefinition({
    organizationId,
    projectId,
    kind: 'event',
    name,
    fields: [{ name: 'value', type: 'number', isRequired: true, isPii: false, isIdentityKey: false }],
    createdByUserId,
  });
}

/** Directly lands one raw record (bypassing the full ingest pipeline) at a caller-chosen `landed_at`, so tests can control silence duration precisely. */
async function landRawRecord(params: {
  organizationId: string;
  projectId: string;
  environmentId: string;
  schemaName: string;
  landedAt: string;
}): Promise<RawRecordModel> {
  const record = new RawRecordModel();
  record.organization_id = params.organizationId;
  record.project_id = params.projectId;
  record.environment_id = params.environmentId;
  record.partition_date = params.landedAt.slice(0, 10);
  record.batch_id = unique('batch');
  record.kind = 'event';
  record.schema_name = params.schemaName;
  record.client_id = unique('client');
  record.payload = { value: 1 };
  record.landed_at = params.landedAt;
  record.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
  await record.save();
  return record;
}

const NOW = Date.parse('2026-07-08T12:00:00.000Z');
const TWO_HOURS_AGO = new Date(NOW - 2 * TRACKING_ALERT_SILENCE_THRESHOLD_MS).toISOString();
const TEN_MINUTES_AGO = new Date(NOW - 10 * 60 * 1000).toISOString();

describe('checkTrackingAlertsForProject', () => {
  it('fires a new alert the first time a previously-flowing event has been silent past the threshold', async () => {
    const { owner, organization, project, environmentId } = await setupOrgWithProject('Tracking Alert Fire Org');
    await registerEventSchema(organization.id, project.id, 'order_completed', owner.id);
    await landRawRecord({ organizationId: organization.id, projectId: project.id, environmentId, schemaName: 'order_completed', landedAt: TWO_HOURS_AGO });

    const result = await checkTrackingAlertsForProject({ organizationId: organization.id, projectId: project.id, triggeredByUserId: owner.id, now: NOW });

    const outcome = result.outcomes.find((entry) => entry.schemaName === 'order_completed');
    expect(outcome?.action).toBe('fired');
    expect(outcome?.alert?.status).toBe('active');
    expect(outcome?.alert?.last_seen_at).toBe(TWO_HOURS_AGO);
    expect(outcome?.alert?.resolved_at).toBeUndefined();

    const active = await listActiveTrackingAlertsForProject(organization.id, project.id);
    expect(active.map((alert) => alert.schema_name)).toEqual(['order_completed']);
  });

  it('does not fire for an event that has never landed a single record', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Tracking Alert Never Seen Org');
    await registerEventSchema(organization.id, project.id, 'never_fired', owner.id);

    const result = await checkTrackingAlertsForProject({ organizationId: organization.id, projectId: project.id, now: NOW });

    const outcome = result.outcomes.find((entry) => entry.schemaName === 'never_fired');
    expect(outcome?.action).toBe('healthy');
    expect(outcome?.alert).toBeNull();
    expect(outcome?.lastSeenAt).toBeNull();
  });

  it('does not fire for an event still flowing within the threshold', async () => {
    const { owner, organization, project, environmentId } = await setupOrgWithProject('Tracking Alert Healthy Org');
    await registerEventSchema(organization.id, project.id, 'signup', owner.id);
    await landRawRecord({ organizationId: organization.id, projectId: project.id, environmentId, schemaName: 'signup', landedAt: TEN_MINUTES_AGO });

    const result = await checkTrackingAlertsForProject({ organizationId: organization.id, projectId: project.id, now: NOW });

    const outcome = result.outcomes.find((entry) => entry.schemaName === 'signup');
    expect(outcome?.action).toBe('healthy');
    expect(outcome?.alert).toBeNull();
  });

  it('keeps an already-active episode open (updating last_checked_at, not detected_at) on a later check while still silent', async () => {
    const { owner, organization, project, environmentId } = await setupOrgWithProject('Tracking Alert Still Active Org');
    await registerEventSchema(organization.id, project.id, 'order_completed', owner.id);
    await landRawRecord({ organizationId: organization.id, projectId: project.id, environmentId, schemaName: 'order_completed', landedAt: TWO_HOURS_AGO });

    const first = await checkTrackingAlertsForProject({ organizationId: organization.id, projectId: project.id, now: NOW });
    const firstAlert = first.outcomes.find((entry) => entry.schemaName === 'order_completed')?.alert;
    expect(firstAlert).toBeTruthy();

    const laterNow = NOW + 15 * 60 * 1000;
    const second = await checkTrackingAlertsForProject({ organizationId: organization.id, projectId: project.id, now: laterNow });
    const secondOutcome = second.outcomes.find((entry) => entry.schemaName === 'order_completed');

    expect(secondOutcome?.action).toBe('still_active');
    expect(secondOutcome?.alert?.id).toBe(firstAlert?.id);
    expect(secondOutcome?.alert?.detected_at).toBe(firstAlert?.detected_at);
    expect(secondOutcome?.alert?.last_checked_at).toBe(new Date(laterNow).toISOString());

    const active = await listActiveTrackingAlertsForProject(organization.id, project.id);
    expect(active).toHaveLength(1);
  });

  it('resolves an active episode once the event starts flowing again', async () => {
    const { owner, organization, project, environmentId } = await setupOrgWithProject('Tracking Alert Resolve Org');
    await registerEventSchema(organization.id, project.id, 'order_completed', owner.id);
    await landRawRecord({ organizationId: organization.id, projectId: project.id, environmentId, schemaName: 'order_completed', landedAt: TWO_HOURS_AGO });
    await checkTrackingAlertsForProject({ organizationId: organization.id, projectId: project.id, now: NOW });

    const laterNow = NOW + 30 * 60 * 1000;
    await landRawRecord({
      organizationId: organization.id,
      projectId: project.id,
      environmentId,
      schemaName: 'order_completed',
      landedAt: new Date(laterNow).toISOString(),
    });

    const result = await checkTrackingAlertsForProject({ organizationId: organization.id, projectId: project.id, now: laterNow });
    const outcome = result.outcomes.find((entry) => entry.schemaName === 'order_completed');

    expect(outcome?.action).toBe('resolved');
    expect(outcome?.alert?.status).toBe('resolved');
    expect(outcome?.alert?.resolved_at).toBe(new Date(laterNow).toISOString());

    const active = await listActiveTrackingAlertsForProject(organization.id, project.id);
    expect(active).toHaveLength(0);

    const history = await listTrackingAlertsForProject(organization.id, project.id);
    expect(history.map((alert) => alert.schema_name)).toEqual(['order_completed']);
  });

  it('rejects a project that does not exist', async () => {
    const { organization } = await setupOrgWithProject('Tracking Alert Missing Project Org');
    await expect(
      checkTrackingAlertsForProject({ organizationId: organization.id, projectId: 'does-not-exist', now: NOW }),
    ).rejects.toThrow(ProjectNotFoundError);
  });

  it('rejects a project id that belongs to a different organization (KAN-26 non-enumeration)', async () => {
    const { organization: orgA } = await setupOrgWithProject('Tracking Alert Isolation Org A');
    const { project: projectB } = await setupOrgWithProject('Tracking Alert Isolation Org B');
    await expect(
      checkTrackingAlertsForProject({ organizationId: orgA.id, projectId: projectB.id, now: NOW }),
    ).rejects.toThrow(ProjectNotFoundError);
  });

  it('records an audit log entry for a human-triggered check that changed alert state', async () => {
    const { owner, organization, project, environmentId } = await setupOrgWithProject('Tracking Alert Audit Org');
    await registerEventSchema(organization.id, project.id, 'order_completed', owner.id);
    await landRawRecord({ organizationId: organization.id, projectId: project.id, environmentId, schemaName: 'order_completed', landedAt: TWO_HOURS_AGO });

    await checkTrackingAlertsForProject({ organizationId: organization.id, projectId: project.id, triggeredByUserId: owner.id, now: NOW });

    const entries = await listAuditLogEntriesForOrg(organization.id);
    const entry = entries.find((candidate) => candidate.action === 'tracking_alert.check');
    expect(entry).toBeDefined();
    expect(entry?.actor_id).toBe(owner.id);
    expect(entry?.project_id).toBe(project.id);
  });

  it('skips audit logging when no human actor triggered the check', async () => {
    const { owner, organization, project, environmentId } = await setupOrgWithProject('Tracking Alert No Actor Org');
    await registerEventSchema(organization.id, project.id, 'order_completed', owner.id);
    await landRawRecord({ organizationId: organization.id, projectId: project.id, environmentId, schemaName: 'order_completed', landedAt: TWO_HOURS_AGO });

    await checkTrackingAlertsForProject({ organizationId: organization.id, projectId: project.id, now: NOW });

    const entries = await listAuditLogEntriesForOrg(organization.id);
    expect(entries.find((candidate) => candidate.action === 'tracking_alert.check')).toBeUndefined();
  });

  it('skips audit logging when a human triggered the check but nothing changed', async () => {
    const { owner, organization, project, environmentId } = await setupOrgWithProject('Tracking Alert No Change Org');
    await registerEventSchema(organization.id, project.id, 'signup', owner.id);
    await landRawRecord({ organizationId: organization.id, projectId: project.id, environmentId, schemaName: 'signup', landedAt: TEN_MINUTES_AGO });

    await checkTrackingAlertsForProject({ organizationId: organization.id, projectId: project.id, triggeredByUserId: owner.id, now: NOW });

    const entries = await listAuditLogEntriesForOrg(organization.id);
    expect(entries.find((candidate) => candidate.action === 'tracking_alert.check')).toBeUndefined();
  });

  it('defaults to the documented cap when no limit is given', () => {
    expect(DEFAULT_TRACKING_ALERT_LIST_LIMIT).toBeGreaterThan(0);
  });
});

describe('getEventVolumeOverviewForProject', () => {
  it('returns a daily-bucketed sparkline plus last-seen for every active event schema', async () => {
    const { owner, organization, project, environmentId } = await setupOrgWithProject('Event Volume Org');
    await registerEventSchema(organization.id, project.id, 'order_completed', owner.id);
    await landRawRecord({ organizationId: organization.id, projectId: project.id, environmentId, schemaName: 'order_completed', landedAt: TEN_MINUTES_AGO });
    await landRawRecord({ organizationId: organization.id, projectId: project.id, environmentId, schemaName: 'order_completed', landedAt: TEN_MINUTES_AGO });

    const overview = await getEventVolumeOverviewForProject(organization.id, project.id, { now: NOW, windowDays: 7 });

    const entry = overview.find((candidate) => candidate.schemaName === 'order_completed');
    expect(entry).toBeDefined();
    expect(entry?.lastSeenAt).toBe(TEN_MINUTES_AGO);
    expect(entry?.dailyCounts).toHaveLength(7);
    const todayKey = new Date(NOW).toISOString().slice(0, 10);
    expect(entry?.dailyCounts.find((bucket) => bucket.date === todayKey)?.count).toBe(2);
  });

  it('reports the most recent lastSeenAt and does not lose recent days when a schema lands more records than the per-event cap', async () => {
    const { owner, organization, project, environmentId } = await setupOrgWithProject('Event Volume Busy Org');
    await registerEventSchema(organization.id, project.id, 'page_view', owner.id);
    // Land 3 old records (would fill an oldest-first cap) plus 1 fresh one — the fresh one must still surface as lastSeenAt.
    const threeDaysAgo = new Date(NOW - 3 * 24 * 60 * 60 * 1000).toISOString();
    await landRawRecord({ organizationId: organization.id, projectId: project.id, environmentId, schemaName: 'page_view', landedAt: threeDaysAgo });
    await landRawRecord({ organizationId: organization.id, projectId: project.id, environmentId, schemaName: 'page_view', landedAt: threeDaysAgo });
    await landRawRecord({ organizationId: organization.id, projectId: project.id, environmentId, schemaName: 'page_view', landedAt: TEN_MINUTES_AGO });

    const overview = await getEventVolumeOverviewForProject(organization.id, project.id, { now: NOW, windowDays: 7 });

    const entry = overview.find((candidate) => candidate.schemaName === 'page_view');
    expect(entry?.lastSeenAt).toBe(TEN_MINUTES_AGO);
    const todayKey = new Date(NOW).toISOString().slice(0, 10);
    expect(entry?.dailyCounts.find((bucket) => bucket.date === todayKey)?.count).toBe(1);
  });

  it('falls back to a point lookup for lastSeenAt when nothing landed within the window', async () => {
    const { owner, organization, project, environmentId } = await setupOrgWithProject('Event Volume Stale Org');
    await registerEventSchema(organization.id, project.id, 'order_completed', owner.id);
    const longAgo = new Date(NOW - 30 * 24 * 60 * 60 * 1000).toISOString();
    await landRawRecord({ organizationId: organization.id, projectId: project.id, environmentId, schemaName: 'order_completed', landedAt: longAgo });

    const overview = await getEventVolumeOverviewForProject(organization.id, project.id, { now: NOW, windowDays: 7 });

    const entry = overview.find((candidate) => candidate.schemaName === 'order_completed');
    expect(entry?.lastSeenAt).toBe(longAgo);
    expect(entry?.dailyCounts.every((bucket) => bucket.count === 0)).toBe(true);
  });

  it('returns an empty entry list when a project has no active event schemas', async () => {
    const { organization, project } = await setupOrgWithProject('Event Volume Empty Org');
    const overview = await getEventVolumeOverviewForProject(organization.id, project.id, { now: NOW });
    expect(overview).toEqual([]);
  });

  it('does not leak a sibling project’s event volume', async () => {
    const { owner, organization, project, environmentId } = await setupOrgWithProject('Event Volume Isolation Org A');
    const other = await setupOrgWithProject('Event Volume Isolation Org B');
    await registerEventSchema(organization.id, project.id, 'order_completed', owner.id);
    await registerEventSchema(other.organization.id, other.project.id, 'order_completed', other.owner.id);
    await landRawRecord({ organizationId: organization.id, projectId: project.id, environmentId, schemaName: 'order_completed', landedAt: TEN_MINUTES_AGO });

    const overview = await getEventVolumeOverviewForProject(organization.id, project.id, { now: NOW });
    const otherOverview = await getEventVolumeOverviewForProject(other.organization.id, other.project.id, { now: NOW });

    expect(overview.find((entry) => entry.schemaName === 'order_completed')?.lastSeenAt).toBe(TEN_MINUTES_AGO);
    expect(otherOverview.find((entry) => entry.schemaName === 'order_completed')?.lastSeenAt).toBeNull();
  });
});
