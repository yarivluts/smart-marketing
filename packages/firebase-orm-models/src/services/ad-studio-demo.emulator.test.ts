import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  AdStudioDemoAccessModel,
  AdStudioDemoAccessInvalidError,
  AdStudioDemoSegmentsInvalidError,
  clearAdStudioDemoAccess,
  createAdStudioDemoRecording,
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  generateLocalKmsKeyRing,
  getAdStudioDemoAccess,
  getLatestReadyAdStudioDemoRecording,
  listAdStudioDemoRecordings,
  listAuditLogEntriesForOrg,
  LocalKmsProvider,
  markAdStudioDemoRecordingFailed,
  markAdStudioDemoRecordingReady,
  revealAdStudioDemoAccess,
  selectAdStudioDemoSegments,
  setAdStudioDemoAccess,
  toAdStudioDemoRecordingView,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

beforeAll(async () => {
  await connectToFirestoreEmulator('ad-studio-demo-tests');
});

const { keyRing, currentKeyId } = generateLocalKmsKeyRing();
const kms = new LocalKmsProvider(keyRing, currentKeyId);
const publicResolver = async () => ['93.184.216.34'];
const PASSWORD = 'Tr1al-pass-word!';

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

async function setup() {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: `${unique('owner')}@example.com` });
  const { organization } = await createOrganizationWithOwner({ name: 'Demo Org', ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'App' });
  return { owner, orgId: organization.id, projectId: project.id };
}

const input = { loginUrl: 'https://app.example.com/login', username: 'trial@example.com', password: PASSWORD, notes: 'Show the reports' };

describe('Ad Studio demo access', () => {
  it('stores the username and password encrypted, shows the username but never the password, and audits without either', async () => {
    const { owner, orgId, projectId } = await setup();
    expect(await getAdStudioDemoAccess(orgId, projectId, kms)).toBeNull();
    const view = await setAdStudioDemoAccess({ organizationId: orgId, projectId, input, actorId: owner.id, kms, resolver: publicResolver, now: new Date('2026-11-01T10:00:00.000Z') });
    expect(view).toEqual({ loginUrl: 'https://app.example.com/login', username: 'trial@example.com', hasPassword: true, notes: 'Show the reports', lastChangedOn: '2026-11-01T10:00:00.000Z' });
    expect(JSON.stringify(view)).not.toContain(PASSWORD);

    // At rest: nothing readable.
    const stored = await AdStudioDemoAccessModel.init('demo', { organization_id: orgId, project_id: projectId });
    const raw = JSON.stringify({ username: stored?.encrypted_username, password: stored?.encrypted_password, url: stored?.login_url, notes: stored?.notes });
    expect(stored?.encrypted_password?.ciphertext).toBeTruthy();
    expect(raw).not.toContain(PASSWORD);
    expect(raw).not.toContain('trial@example.com');

    // Only the recorder opens it.
    expect(await revealAdStudioDemoAccess(orgId, projectId, kms)).toEqual({ loginUrl: 'https://app.example.com/login', username: 'trial@example.com', password: PASSWORD, notes: 'Show the reports' });
    // Without the vault the username is not shown either.
    expect((await getAdStudioDemoAccess(orgId, projectId, null))?.username).toBeNull();

    const entries = (await listAuditLogEntriesForOrg(orgId)).filter((entry) => entry.action === 'ad_studio.demo_access_set');
    expect(entries).toHaveLength(1);
    expect(JSON.stringify(entries)).not.toContain(PASSWORD);
    expect(JSON.stringify(entries)).not.toContain('trial@example.com');
  });

  it('keeps the stored password when saved with an empty one, and cannot be opened under another project', async () => {
    const { owner, orgId, projectId } = await setup();
    await setAdStudioDemoAccess({ organizationId: orgId, projectId, input, actorId: owner.id, kms, resolver: publicResolver });
    await setAdStudioDemoAccess({ organizationId: orgId, projectId, input: { ...input, username: 'other@example.com', password: '' }, actorId: owner.id, kms, resolver: publicResolver });
    expect(await revealAdStudioDemoAccess(orgId, projectId, kms)).toMatchObject({ username: 'other@example.com', password: PASSWORD });

    // The same envelope copied under a second project cannot be decrypted there.
    const { project: second } = await createProject({ organizationId: orgId, name: 'Other' });
    const original = await AdStudioDemoAccessModel.init('demo', { organization_id: orgId, project_id: projectId });
    const copy = new AdStudioDemoAccessModel();
    Object.assign(copy, { organization_id: orgId, project_id: second.id, login_url: original!.login_url, encrypted_username: original!.encrypted_username, encrypted_password: original!.encrypted_password, notes: '', changed_by: owner.id, last_changed_on: new Date().toISOString() });
    copy.setPathParams({ organization_id: orgId, project_id: second.id });
    await copy.save('demo');
    await expect(revealAdStudioDemoAccess(orgId, second.id, kms)).rejects.toThrow();
  });

  it('refuses a private or non-https address and a missing password, by field', async () => {
    const { owner, orgId, projectId } = await setup();
    await expect(setAdStudioDemoAccess({ organizationId: orgId, projectId, input: { ...input, loginUrl: 'http://app.example.com' }, actorId: owner.id, kms, resolver: publicResolver })).rejects.toMatchObject({
      fields: ['login_url'],
    });
    await expect(setAdStudioDemoAccess({ organizationId: orgId, projectId, input, actorId: owner.id, kms, resolver: async () => ['10.0.0.5'] })).rejects.toBeInstanceOf(AdStudioDemoAccessInvalidError);
    await expect(setAdStudioDemoAccess({ organizationId: orgId, projectId, input: { ...input, password: '' }, actorId: owner.id, kms, resolver: publicResolver })).rejects.toMatchObject({ fields: ['password'] });
  });

  it('clears the access and audits it', async () => {
    const { owner, orgId, projectId } = await setup();
    await setAdStudioDemoAccess({ organizationId: orgId, projectId, input, actorId: owner.id, kms, resolver: publicResolver });
    await clearAdStudioDemoAccess({ organizationId: orgId, projectId, actorId: owner.id });
    expect(await getAdStudioDemoAccess(orgId, projectId, kms)).toBeNull();
    expect((await listAuditLogEntriesForOrg(orgId)).some((entry) => entry.action === 'ad_studio.demo_access_cleared')).toBe(true);
  });
});

describe('Ad Studio demo recordings', () => {
  it('records, finishes with moments, and keeps the selection', async () => {
    const { owner, orgId, projectId } = await setup();
    const first = await createAdStudioDemoRecording({ organizationId: orgId, projectId, site: 'app.example.com', requestedBy: owner.id, now: new Date('2026-11-01T10:00:00.000Z') });
    await markAdStudioDemoRecordingFailed(first, 'login_failed');
    expect(await getLatestReadyAdStudioDemoRecording(orgId, projectId)).toBeNull();

    const second = await createAdStudioDemoRecording({ organizationId: orgId, projectId, site: 'app.example.com', requestedBy: owner.id, now: new Date('2026-11-01T11:00:00.000Z') });
    const segments = [
      { id: 's1', startSeconds: 0, endSeconds: 4, title: 'Dashboard', description: 'The overview', selected: true },
      { id: 's2', startSeconds: 4, endSeconds: 9, title: 'Reports', description: 'A report', selected: false },
    ];
    await markAdStudioDemoRecordingReady(second, { gcsPath: 'orgs/o/projects/p/demo/x.mp4', durationSeconds: 9, segments });
    const latest = await getLatestReadyAdStudioDemoRecording(orgId, projectId);
    expect(latest?.id).toBe(second.id);
    expect(toAdStudioDemoRecordingView(latest!)).toMatchObject({ status: 'ready', durationSeconds: 9, segments, site: 'app.example.com' });

    const selected = await selectAdStudioDemoSegments({ organizationId: orgId, projectId, recordingId: second.id, segmentIds: ['s2'] });
    expect(selected.segments.map((segment) => segment.selected)).toEqual([false, true]);
    await expect(selectAdStudioDemoSegments({ organizationId: orgId, projectId, recordingId: second.id, segmentIds: ['nope'] })).rejects.toBeInstanceOf(AdStudioDemoSegmentsInvalidError);

    const listed = await listAdStudioDemoRecordings(orgId, projectId);
    expect(listed.map((row) => [row.id, row.status, row.failure_code ?? null])).toEqual([
      [second.id, 'ready', null],
      [first.id, 'failed', 'login_failed'],
    ]);
  });
});
