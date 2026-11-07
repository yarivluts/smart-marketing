import 'reflect-metadata';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  acquireAdStudioRunLease,
  createAdStudioBrief,
  createOrganizationWithOwner,
  createProject,
  deleteExpiredPushSubscription,
  emitActivityEvent,
  ensureUserForFirebaseSession,
  finishGrowthTargetVideo,
  getAdStudioRun,
  getPushPreferences,
  isGrowthPilotBrief,
  linkGrowthTargetAds,
  listGrowthTargets,
  listProjectNotificationRecipients,
  listPushSubscriptionsForUser,
  MembershipModel,
  PushSubscriptionInvalidError,
  PushSubscriptionModel,
  PushSubscriptionNotFoundError,
  pushSubscriptionId,
  recordGrowthActivity,
  removePushSubscription,
  removePushSubscriptionByEndpoint,
  saveAdStudioRunProgress,
  saveGrowthPilotAnalysis,
  acquireGrowthPilotLease,
  savePushSubscription,
  setActivityEventListener,
  setPushPreferences,
  startAdStudioRun,
  startGrowthPilot,
  touchPushSubscription,
  type ActivityEvent,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

beforeAll(async () => {
  await connectToFirestoreEmulator('push-notification-tests');
});

let stopListening: (() => void) | null = null;
afterEach(() => {
  stopListening?.();
  stopListening = null;
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function endpoint(): string {
  return `https://fcm.googleapis.com/fcm/send/${unique('device')}`;
}

async function setup() {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: `${unique('owner')}@example.com` });
  const { organization } = await createOrganizationWithOwner({ name: 'Push Org', ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  return { organizationId: organization.id, projectId: project.id, ownerId: owner.id };
}

async function addMember(organizationId: string, fields: Partial<MembershipModel>): Promise<string> {
  const userId = unique('user');
  const row = new MembershipModel();
  row.user_id = userId;
  row.organization_id = organizationId;
  row.role = 'editor';
  Object.assign(row, fields);
  row.setPathParams({ organization_id: organizationId });
  await row.save();
  return userId;
}

describe('push subscriptions', () => {
  it('saves a browser once per endpoint and lists it for its owner', async () => {
    const userId = unique('user');
    const url = endpoint();
    const first = await savePushSubscription({ userId, endpoint: url, p256dh: 'p-key', auth: 'a-key', deviceLabel: 'Chrome on Android', userAgent: 'UA', locale: 'he', now: new Date('2026-11-01T10:00:00Z') });
    expect(first.id).toBe(pushSubscriptionId(url));
    await savePushSubscription({ userId, endpoint: url, p256dh: 'p-key-2', auth: 'a-key-2', now: new Date('2026-11-02T10:00:00Z') });

    const rows = await listPushSubscriptionsForUser(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ endpoint: url, p256dh: 'p-key-2', auth: 'a-key-2', created_at: '2026-11-01T10:00:00.000Z', last_used_at: '2026-11-02T10:00:00.000Z' });
  });

  it('moves a browser to whoever signs in on it next', async () => {
    const url = endpoint();
    const first = unique('user');
    const second = unique('user');
    await savePushSubscription({ userId: first, endpoint: url, p256dh: 'p', auth: 'a' });
    await savePushSubscription({ userId: second, endpoint: url, p256dh: 'p', auth: 'a' });
    expect(await listPushSubscriptionsForUser(first)).toHaveLength(0);
    expect(await listPushSubscriptionsForUser(second)).toHaveLength(1);
  });

  it('refuses an endpoint that is not https and empty keys', async () => {
    await expect(savePushSubscription({ userId: 'u', endpoint: 'http://push.example/x', p256dh: 'p', auth: 'a' })).rejects.toBeInstanceOf(PushSubscriptionInvalidError);
    await expect(savePushSubscription({ userId: 'u', endpoint: 'not a url', p256dh: 'p', auth: 'a' })).rejects.toBeInstanceOf(PushSubscriptionInvalidError);
    await expect(savePushSubscription({ userId: 'u', endpoint: endpoint(), p256dh: ' ', auth: 'a' })).rejects.toBeInstanceOf(PushSubscriptionInvalidError);
  });

  it('removes only the owner’s own device', async () => {
    const owner = unique('user');
    const row = await savePushSubscription({ userId: owner, endpoint: endpoint(), p256dh: 'p', auth: 'a' });
    await expect(removePushSubscription(unique('someone-else'), row.id)).rejects.toBeInstanceOf(PushSubscriptionNotFoundError);
    await removePushSubscription(owner, row.id);
    expect(await listPushSubscriptionsForUser(owner)).toHaveLength(0);
  });

  it('removes by endpoint, and drops an expired one', async () => {
    const owner = unique('user');
    const url = endpoint();
    await savePushSubscription({ userId: owner, endpoint: url, p256dh: 'p', auth: 'a' });
    expect(await removePushSubscriptionByEndpoint(unique('other'), url)).toBe(false);
    expect(await removePushSubscriptionByEndpoint(owner, url)).toBe(true);
    expect(await removePushSubscriptionByEndpoint(owner, url)).toBe(false);

    const gone = await savePushSubscription({ userId: owner, endpoint: endpoint(), p256dh: 'p', auth: 'a' });
    await touchPushSubscription(gone.id, new Date('2026-11-05T00:00:00Z'));
    expect((await PushSubscriptionModel.init(gone.id))?.last_used_at).toBe('2026-11-05T00:00:00.000Z');
    await deleteExpiredPushSubscription(gone.id);
    expect(await PushSubscriptionModel.init(gone.id)).toBeNull();
  });
});

describe('push preferences', () => {
  it('defaults to everything on and keeps untouched categories when changed', async () => {
    const userId = unique('user');
    expect(await getPushPreferences(userId)).toEqual({ enabled: true, categories: { approvals: true, ready: true, publishing: true, failures: true } });
    await setPushPreferences({ userId, categories: { ready: false } });
    await setPushPreferences({ userId, enabled: false });
    expect(await getPushPreferences(userId)).toEqual({ enabled: false, categories: { approvals: true, ready: false, publishing: true, failures: true } });
  });
});

describe('notification recipients', () => {
  it('are the active org-wide members plus this project’s members', async () => {
    const { organizationId, projectId, ownerId } = await setup();
    const orgEditor = await addMember(organizationId, { status: 'active' });
    const legacy = await addMember(organizationId, {});
    const projectMember = await addMember(organizationId, { status: 'active', project_id: projectId });
    const otherProject = await addMember(organizationId, { status: 'active', project_id: 'another-project' });
    const invited = await addMember(organizationId, { status: 'invited' });
    const suspended = await addMember(organizationId, { status: 'suspended' });

    const recipients = await listProjectNotificationRecipients(organizationId, projectId);
    expect(recipients).toEqual(expect.arrayContaining([ownerId, orgEditor, legacy, projectMember]));
    expect(recipients).not.toContain(otherProject);
    expect(recipients).not.toContain(invited);
    expect(recipients).not.toContain(suspended);
  });
});

describe('activity events', () => {
  function listen(): ActivityEvent[] {
    const events: ActivityEvent[] = [];
    stopListening = setActivityEventListener('test', (event) => {
      events.push(event);
    });
    return events;
  }

  it('announces every Growth Pilot feed line', async () => {
    const events = listen();
    const scope = await setup();
    await recordGrowthActivity({ organizationId: scope.organizationId, projectId: scope.projectId, pilotId: 'p1', kind: 'ads_ready', actor: 'pilot', subject: 'Signatures', count: 3 });
    expect(events).toEqual([
      { source: 'growth_pilot', kind: 'ads_ready', organizationId: scope.organizationId, projectId: scope.projectId, actor: 'pilot', subject: 'Signatures', count: 3 },
    ]);
  });

  it('announces a pilot video finishing, and knows the pilot’s briefs', async () => {
    const scope = await setup();
    const pilot = await startGrowthPilot({ organizationId: scope.organizationId, projectId: scope.projectId, actorId: scope.ownerId, siteUrl: 'easysign.co.il' });
    const token = await acquireGrowthPilotLease(pilot);
    if (!token) throw new Error('no lease');
    await saveGrowthPilotAnalysis({
      pilot,
      token,
      analysis: { businessName: 'EasySign', summary: 's', language: 'en', offerings: [], audiences: [] },
      pages: [{ url: 'https://easysign.co.il/', title: 'EasySign' }],
      drafts: [{ kind: 'service', name: 'Signatures', description: 'd', audience: 'a', reason: 'r' }],
      generatedBy: { provider: 'gemini', model: 'm' },
    });
    const [target] = await listGrowthTargets(scope.organizationId, scope.projectId, pilot.id);
    const brief = await createAdStudioBrief({
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      input: { name: 'Sign', objective: 'Trials', productDescription: 'E-sign', landingPageUrl: null, format: 'vertical', language: 'en', targetSeconds: 15 },
      createdByUserId: scope.ownerId,
    });
    expect(await isGrowthPilotBrief(scope.organizationId, scope.projectId, brief.id)).toBe(false);
    await linkGrowthTargetAds({ organizationId: scope.organizationId, projectId: scope.projectId, targetId: target.id, briefId: brief.id, runId: 'r' });
    expect(await isGrowthPilotBrief(scope.organizationId, scope.projectId, brief.id)).toBe(true);

    const events = listen();
    await finishGrowthTargetVideo({ organizationId: scope.organizationId, projectId: scope.projectId, targetId: target.id });
    await finishGrowthTargetVideo({ organizationId: scope.organizationId, projectId: scope.projectId, targetId: target.id, failureCode: 'clips_not_ready' });
    expect(events.map((event) => [event.kind, event.subject, event.briefId])).toEqual([
      ['video_ready', 'Signatures', brief.id],
      ['video_failed', 'Signatures', brief.id],
    ]);
  });

  it('announces an autopilot run once when it stops to wait, finishes or fails', async () => {
    const scope = await setup();
    const brief = await createAdStudioBrief({
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      input: { name: 'Sign', objective: 'Trials', productDescription: 'E-sign', landingPageUrl: null, format: 'vertical', language: 'en', targetSeconds: 15 },
      createdByUserId: scope.ownerId,
    });
    const run = await startAdStudioRun({ organizationId: scope.organizationId, projectId: scope.projectId, briefId: brief.id, options: {}, actorId: scope.ownerId });
    const events = listen();

    // A step that keeps it running is not news.
    let token = await acquireAdStudioRunLease(run, { ttlMs: 60_000 });
    let working = await getAdStudioRun(scope.organizationId, scope.projectId, brief.id, run.id);
    await saveAdStudioRunProgress(working, token!);
    expect(events).toHaveLength(0);

    token = await acquireAdStudioRunLease(run, { ttlMs: 60_000 });
    working = await getAdStudioRun(scope.organizationId, scope.projectId, brief.id, run.id);
    working.status = 'done';
    await saveAdStudioRunProgress(working, token!);
    expect(events).toEqual([{ source: 'ad_studio', kind: 'run_done', organizationId: scope.organizationId, projectId: scope.projectId, actor: scope.ownerId, briefId: brief.id }]);
  });

  it('never fails or stalls the caller when a listener throws or hangs', async () => {
    stopListening = setActivityEventListener('test', () => {
      throw new Error('push service down');
    });
    const scope = await setup();
    await expect(recordGrowthActivity({ organizationId: scope.organizationId, projectId: scope.projectId, pilotId: 'p1', kind: 'ads_failed', actor: 'pilot' })).resolves.toBeTruthy();

    stopListening();
    stopListening = setActivityEventListener('test', () => new Promise<void>(() => undefined));
    const started = Date.now();
    await emitActivityEvent({ source: 'growth_pilot', kind: 'ads_ready', organizationId: 'o', projectId: 'p', actor: 'pilot' }, 50);
    expect(Date.now() - started).toBeLessThan(1_000);
  });
});
