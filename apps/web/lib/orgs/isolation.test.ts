import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { createOrganizationWithOwner, ensureUserForFirebaseSession } from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { POST as createProject } from '@/app/api/orgs/[orgId]/projects/route';
import { POST as sendInvite } from '@/app/api/orgs/[orgId]/invites/route';
import { DELETE as removeMember } from '@/app/api/orgs/[orgId]/members/[membershipId]/route';
import { POST as createCredential } from '@/app/api/orgs/[orgId]/resources/credentials/route';
import { POST as requestAttachment } from '@/app/api/orgs/[orgId]/projects/[projectId]/resource-attachments/route';
import { DELETE as detachAttachment, PATCH as decideAttachment } from '@/app/api/orgs/[orgId]/resource-attachments/[attachmentId]/route';
import { GET as listApiKeys, POST as mintApiKey } from '@/app/api/orgs/[orgId]/projects/[projectId]/keys/route';
import { DELETE as revokeApiKey } from '@/app/api/orgs/[orgId]/projects/[projectId]/keys/[apiKeyId]/route';
import { GET as listSchemaDefs, POST as registerSchemaDef } from '@/app/api/orgs/[orgId]/projects/[projectId]/schema-defs/route';
import { POST as evolveSchemaDef } from '@/app/api/orgs/[orgId]/projects/[projectId]/schema-defs/evolve/route';
import { GET as listMetricDefs, POST as registerMetricDef } from '@/app/api/orgs/[orgId]/projects/[projectId]/metric-defs/route';
import { POST as evolveMetricDef } from '@/app/api/orgs/[orgId]/projects/[projectId]/metric-defs/evolve/route';
import { GET as listAuditLog } from '@/app/api/orgs/[orgId]/audit-log/route';
import { GET as listBoards, POST as createBoard } from '@/app/api/orgs/[orgId]/projects/[projectId]/boards/route';
import { DELETE as deleteBoard, PATCH as patchBoard } from '@/app/api/orgs/[orgId]/projects/[projectId]/boards/[boardId]/route';
import { PUT as saveBoardTiles } from '@/app/api/orgs/[orgId]/projects/[projectId]/boards/[boardId]/tiles/route';

const { getServerSessionMock } = vi.hoisted(() => ({ getServerSessionMock: vi.fn() }));
vi.mock('@/lib/auth/get-server-session', () => ({ getServerSession: getServerSessionMock }));

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8090';
  process.env.FIREBASE_PROJECT_ID = 'demo-growthos-test';
  await ensureFirestoreOrm();
});

beforeEach(() => {
  getServerSessionMock.mockReset();
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function uniqueEmail(prefix: string): string {
  return `${unique(prefix)}@example.com`;
}

async function sessionFor(firebaseUid: string, email: string): Promise<DecodedIdToken> {
  await ensureUserForFirebaseSession({ firebaseUid, email });
  return { uid: firebaseUid, email } as DecodedIdToken;
}

/**
 * The core KAN-26 property: a caller must get byte-identical responses
 * whether they're hitting a real org they simply have no binding on, or a
 * completely fabricated org id. If the two ever diverge (in status or body),
 * the response itself becomes an oracle an attacker can use to enumerate
 * which org ids are real, which defeats the point of returning 404 at all.
 */
async function expectIndistinguishable(callReal: () => Promise<Response>, callFake: () => Promise<Response>) {
  const [realResponse, fakeResponse] = await Promise.all([callReal(), callFake()]);
  expect(realResponse.status).toBe(404);
  expect(fakeResponse.status).toBe(404);
  expect(await realResponse.json()).toEqual(await fakeResponse.json());
}

const FAKE_ORG_ID = 'does-not-exist-org';
const FAKE_MEMBERSHIP_ID = 'does-not-exist-membership';

describe('org-scoped route isolation across two real orgs (KAN-26 non-enumeration)', () => {
  it('POST /api/orgs/[orgId]/projects: org caller cannot see vs. fake org id', async () => {
    const callerSession = await sessionFor(unique('uid'), uniqueEmail('iso-proj-caller'));
    const caller = await ensureUserForFirebaseSession({
      firebaseUid: callerSession.uid,
      email: callerSession.email as string,
    });
    await createOrganizationWithOwner({ name: 'Isolation Org A (projects)', ownerUserId: caller.id });

    const otherOwner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: uniqueEmail('iso-proj-b-owner') });
    const { organization: orgB } = await createOrganizationWithOwner({ name: 'Isolation Org B (projects)', ownerUserId: otherOwner.id });

    getServerSessionMock.mockResolvedValue(callerSession);

    const requestFor = (orgId: string) =>
      new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Leaked Project' }),
      });

    await expectIndistinguishable(
      () => createProject(requestFor(orgB.id), { params: Promise.resolve({ orgId: orgB.id }) }),
      () => createProject(requestFor(FAKE_ORG_ID), { params: Promise.resolve({ orgId: FAKE_ORG_ID }) }),
    );
  });

  it('POST /api/orgs/[orgId]/invites: org caller cannot see vs. fake org id', async () => {
    const callerSession = await sessionFor(unique('uid'), uniqueEmail('iso-invite-caller'));
    const caller = await ensureUserForFirebaseSession({
      firebaseUid: callerSession.uid,
      email: callerSession.email as string,
    });
    await createOrganizationWithOwner({ name: 'Isolation Org A (invites)', ownerUserId: caller.id });

    const otherOwner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: uniqueEmail('iso-invite-b-owner') });
    const { organization: orgB } = await createOrganizationWithOwner({ name: 'Isolation Org B (invites)', ownerUserId: otherOwner.id });

    getServerSessionMock.mockResolvedValue(callerSession);

    const requestFor = (orgId: string) =>
      new NextRequest(`https://growthos.test/api/orgs/${orgId}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: uniqueEmail('leaked-invitee'), role: 'viewer' }),
      });

    await expectIndistinguishable(
      () => sendInvite(requestFor(orgB.id), { params: Promise.resolve({ orgId: orgB.id }) }),
      () => sendInvite(requestFor(FAKE_ORG_ID), { params: Promise.resolve({ orgId: FAKE_ORG_ID }) }),
    );
  });

  it('DELETE /api/orgs/[orgId]/members/[membershipId]: org caller cannot see vs. fake org id', async () => {
    const callerSession = await sessionFor(unique('uid'), uniqueEmail('iso-member-caller'));
    const caller = await ensureUserForFirebaseSession({
      firebaseUid: callerSession.uid,
      email: callerSession.email as string,
    });
    await createOrganizationWithOwner({ name: 'Isolation Org A (members)', ownerUserId: caller.id });

    const otherOwner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: uniqueEmail('iso-member-b-owner') });
    const { organization: orgB, membership: orgBOwnerMembership } = await createOrganizationWithOwner({
      name: 'Isolation Org B (members)',
      ownerUserId: otherOwner.id,
    });

    getServerSessionMock.mockResolvedValue(callerSession);

    await expectIndistinguishable(
      () =>
        removeMember(new Request('https://growthos.test'), {
          params: Promise.resolve({ orgId: orgB.id, membershipId: orgBOwnerMembership.id }),
        }),
      () =>
        removeMember(new Request('https://growthos.test'), {
          params: Promise.resolve({ orgId: FAKE_ORG_ID, membershipId: FAKE_MEMBERSHIP_ID }),
        }),
    );
  });

  it('POST /api/orgs/[orgId]/resources/credentials: org caller cannot see vs. fake org id (KAN-27)', async () => {
    const callerSession = await sessionFor(unique('uid'), uniqueEmail('iso-cred-caller'));
    const caller = await ensureUserForFirebaseSession({
      firebaseUid: callerSession.uid,
      email: callerSession.email as string,
    });
    await createOrganizationWithOwner({ name: 'Isolation Org A (credentials)', ownerUserId: caller.id });

    const otherOwner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: uniqueEmail('iso-cred-b-owner') });
    const { organization: orgB } = await createOrganizationWithOwner({ name: 'Isolation Org B (credentials)', ownerUserId: otherOwner.id });

    getServerSessionMock.mockResolvedValue(callerSession);

    const requestFor = (orgId: string) =>
      new NextRequest(`https://growthos.test/api/orgs/${orgId}/resources/credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Leaked Credential', provider: 'generic', availableScopes: [] }),
      });

    await expectIndistinguishable(
      () => createCredential(requestFor(orgB.id), { params: Promise.resolve({ orgId: orgB.id }) }),
      () => createCredential(requestFor(FAKE_ORG_ID), { params: Promise.resolve({ orgId: FAKE_ORG_ID }) }),
    );
  });

  it('POST /api/orgs/[orgId]/projects/[projectId]/resource-attachments: org caller cannot see vs. fake org id (KAN-27)', async () => {
    const callerSession = await sessionFor(unique('uid'), uniqueEmail('iso-attach-caller'));
    const caller = await ensureUserForFirebaseSession({
      firebaseUid: callerSession.uid,
      email: callerSession.email as string,
    });
    await createOrganizationWithOwner({ name: 'Isolation Org A (attachments)', ownerUserId: caller.id });

    const otherOwner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: uniqueEmail('iso-attach-b-owner') });
    const { organization: orgB } = await createOrganizationWithOwner({ name: 'Isolation Org B (attachments)', ownerUserId: otherOwner.id });

    getServerSessionMock.mockResolvedValue(callerSession);

    const requestFor = (orgId: string, projectId: string) =>
      new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/resource-attachments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resourceKind: 'person', resourceId: 'does-not-matter' }),
      });

    await expectIndistinguishable(
      () =>
        requestAttachment(requestFor(orgB.id, FAKE_ORG_ID), {
          params: Promise.resolve({ orgId: orgB.id, projectId: FAKE_ORG_ID }),
        }),
      () =>
        requestAttachment(requestFor(FAKE_ORG_ID, FAKE_ORG_ID), {
          params: Promise.resolve({ orgId: FAKE_ORG_ID, projectId: FAKE_ORG_ID }),
        }),
    );
  });

  it('PATCH/DELETE /api/orgs/[orgId]/resource-attachments/[attachmentId]: org caller cannot see vs. fake org id (KAN-27)', async () => {
    const callerSession = await sessionFor(unique('uid'), uniqueEmail('iso-decide-caller'));
    const caller = await ensureUserForFirebaseSession({
      firebaseUid: callerSession.uid,
      email: callerSession.email as string,
    });
    await createOrganizationWithOwner({ name: 'Isolation Org A (decide)', ownerUserId: caller.id });

    const otherOwner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: uniqueEmail('iso-decide-b-owner') });
    const { organization: orgB } = await createOrganizationWithOwner({ name: 'Isolation Org B (decide)', ownerUserId: otherOwner.id });

    getServerSessionMock.mockResolvedValue(callerSession);

    const patchFor = (orgId: string, attachmentId: string) =>
      new NextRequest(`https://growthos.test/api/orgs/${orgId}/resource-attachments/${attachmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approve: true }),
      });

    await expectIndistinguishable(
      () =>
        decideAttachment(patchFor(orgB.id, FAKE_MEMBERSHIP_ID), {
          params: Promise.resolve({ orgId: orgB.id, attachmentId: FAKE_MEMBERSHIP_ID }),
        }),
      () =>
        decideAttachment(patchFor(FAKE_ORG_ID, FAKE_MEMBERSHIP_ID), {
          params: Promise.resolve({ orgId: FAKE_ORG_ID, attachmentId: FAKE_MEMBERSHIP_ID }),
        }),
    );

    await expectIndistinguishable(
      () =>
        detachAttachment(new Request('https://growthos.test'), {
          params: Promise.resolve({ orgId: orgB.id, attachmentId: FAKE_MEMBERSHIP_ID }),
        }),
      () =>
        detachAttachment(new Request('https://growthos.test'), {
          params: Promise.resolve({ orgId: FAKE_ORG_ID, attachmentId: FAKE_MEMBERSHIP_ID }),
        }),
    );
  });

  it('GET/POST/DELETE /api/orgs/[orgId]/projects/[projectId]/keys(/[apiKeyId]): org caller cannot see vs. fake org id (KAN-30)', async () => {
    const callerSession = await sessionFor(unique('uid'), uniqueEmail('iso-keys-caller'));
    const caller = await ensureUserForFirebaseSession({
      firebaseUid: callerSession.uid,
      email: callerSession.email as string,
    });
    await createOrganizationWithOwner({ name: 'Isolation Org A (keys)', ownerUserId: caller.id });

    const otherOwner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: uniqueEmail('iso-keys-b-owner') });
    const { organization: orgB } = await createOrganizationWithOwner({ name: 'Isolation Org B (keys)', ownerUserId: otherOwner.id });

    getServerSessionMock.mockResolvedValue(callerSession);

    const getRequestFor = (orgId: string, projectId: string) =>
      new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/keys`);

    await expectIndistinguishable(
      () => listApiKeys(getRequestFor(orgB.id, FAKE_ORG_ID), { params: Promise.resolve({ orgId: orgB.id, projectId: FAKE_ORG_ID }) }),
      () =>
        listApiKeys(getRequestFor(FAKE_ORG_ID, FAKE_ORG_ID), {
          params: Promise.resolve({ orgId: FAKE_ORG_ID, projectId: FAKE_ORG_ID }),
        }),
    );

    const postRequestFor = (orgId: string, projectId: string) =>
      new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Leaked key', environmentId: 'does-not-matter', scopes: ['ingest.write'] }),
      });

    await expectIndistinguishable(
      () => mintApiKey(postRequestFor(orgB.id, FAKE_ORG_ID), { params: Promise.resolve({ orgId: orgB.id, projectId: FAKE_ORG_ID }) }),
      () =>
        mintApiKey(postRequestFor(FAKE_ORG_ID, FAKE_ORG_ID), {
          params: Promise.resolve({ orgId: FAKE_ORG_ID, projectId: FAKE_ORG_ID }),
        }),
    );

    await expectIndistinguishable(
      () =>
        revokeApiKey(new Request('https://growthos.test'), {
          params: Promise.resolve({ orgId: orgB.id, projectId: FAKE_ORG_ID, apiKeyId: FAKE_MEMBERSHIP_ID }),
        }),
      () =>
        revokeApiKey(new Request('https://growthos.test'), {
          params: Promise.resolve({ orgId: FAKE_ORG_ID, projectId: FAKE_ORG_ID, apiKeyId: FAKE_MEMBERSHIP_ID }),
        }),
    );
  });

  it('POST /api/orgs/[orgId]/projects/[projectId]/schema-defs: org caller cannot see vs. fake org id (KAN-31)', async () => {
    const callerSession = await sessionFor(unique('uid'), uniqueEmail('iso-schema-caller'));
    const caller = await ensureUserForFirebaseSession({
      firebaseUid: callerSession.uid,
      email: callerSession.email as string,
    });
    await createOrganizationWithOwner({ name: 'Isolation Org A (schema-defs)', ownerUserId: caller.id });

    const otherOwner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: uniqueEmail('iso-schema-b-owner') });
    const { organization: orgB } = await createOrganizationWithOwner({ name: 'Isolation Org B (schema-defs)', ownerUserId: otherOwner.id });

    getServerSessionMock.mockResolvedValue(callerSession);

    const requestFor = (orgId: string, projectId: string) =>
      new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/schema-defs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'event',
          name: 'leaked_event',
          fields: [{ name: 'id', type: 'string', isRequired: true, isPii: false, isIdentityKey: false }],
        }),
      });

    await expectIndistinguishable(
      () =>
        registerSchemaDef(requestFor(orgB.id, FAKE_ORG_ID), {
          params: Promise.resolve({ orgId: orgB.id, projectId: FAKE_ORG_ID }),
        }),
      () =>
        registerSchemaDef(requestFor(FAKE_ORG_ID, FAKE_ORG_ID), {
          params: Promise.resolve({ orgId: FAKE_ORG_ID, projectId: FAKE_ORG_ID }),
        }),
    );

    const getRequestFor = (orgId: string, projectId: string) =>
      new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/schema-defs`);

    await expectIndistinguishable(
      () =>
        listSchemaDefs(getRequestFor(orgB.id, FAKE_ORG_ID), {
          params: Promise.resolve({ orgId: orgB.id, projectId: FAKE_ORG_ID }),
        }),
      () =>
        listSchemaDefs(getRequestFor(FAKE_ORG_ID, FAKE_ORG_ID), {
          params: Promise.resolve({ orgId: FAKE_ORG_ID, projectId: FAKE_ORG_ID }),
        }),
    );

    const evolveRequestFor = (orgId: string, projectId: string) =>
      new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/schema-defs/evolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'event',
          name: 'leaked_event',
          fields: [{ name: 'id', type: 'string', isRequired: true, isPii: false, isIdentityKey: false }],
        }),
      });

    await expectIndistinguishable(
      () =>
        evolveSchemaDef(evolveRequestFor(orgB.id, FAKE_ORG_ID), {
          params: Promise.resolve({ orgId: orgB.id, projectId: FAKE_ORG_ID }),
        }),
      () =>
        evolveSchemaDef(evolveRequestFor(FAKE_ORG_ID, FAKE_ORG_ID), {
          params: Promise.resolve({ orgId: FAKE_ORG_ID, projectId: FAKE_ORG_ID }),
        }),
    );
  });

  it('POST /api/orgs/[orgId]/projects/[projectId]/metric-defs: org caller cannot see vs. fake org id (KAN-40)', async () => {
    const callerSession = await sessionFor(unique('uid'), uniqueEmail('iso-metric-caller'));
    const caller = await ensureUserForFirebaseSession({
      firebaseUid: callerSession.uid,
      email: callerSession.email as string,
    });
    await createOrganizationWithOwner({ name: 'Isolation Org A (metric-defs)', ownerUserId: caller.id });

    const otherOwner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: uniqueEmail('iso-metric-b-owner') });
    const { organization: orgB } = await createOrganizationWithOwner({ name: 'Isolation Org B (metric-defs)', ownerUserId: otherOwner.id });

    getServerSessionMock.mockResolvedValue(callerSession);

    const leakedBody = {
      name: 'leaked_metric',
      definition: { kind: 'aggregation', aggregation: { function: 'sum', table: 'fact_ad_spend', column: 'spend', timeColumn: 'date', filters: [] } },
      dimensions: [],
    };

    const requestFor = (orgId: string, projectId: string) =>
      new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/metric-defs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(leakedBody),
      });

    await expectIndistinguishable(
      () =>
        registerMetricDef(requestFor(orgB.id, FAKE_ORG_ID), {
          params: Promise.resolve({ orgId: orgB.id, projectId: FAKE_ORG_ID }),
        }),
      () =>
        registerMetricDef(requestFor(FAKE_ORG_ID, FAKE_ORG_ID), {
          params: Promise.resolve({ orgId: FAKE_ORG_ID, projectId: FAKE_ORG_ID }),
        }),
    );

    const getRequestFor = (orgId: string, projectId: string) =>
      new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/metric-defs`);

    await expectIndistinguishable(
      () =>
        listMetricDefs(getRequestFor(orgB.id, FAKE_ORG_ID), {
          params: Promise.resolve({ orgId: orgB.id, projectId: FAKE_ORG_ID }),
        }),
      () =>
        listMetricDefs(getRequestFor(FAKE_ORG_ID, FAKE_ORG_ID), {
          params: Promise.resolve({ orgId: FAKE_ORG_ID, projectId: FAKE_ORG_ID }),
        }),
    );

    const evolveRequestFor = (orgId: string, projectId: string) =>
      new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/metric-defs/evolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(leakedBody),
      });

    await expectIndistinguishable(
      () =>
        evolveMetricDef(evolveRequestFor(orgB.id, FAKE_ORG_ID), {
          params: Promise.resolve({ orgId: orgB.id, projectId: FAKE_ORG_ID }),
        }),
      () =>
        evolveMetricDef(evolveRequestFor(FAKE_ORG_ID, FAKE_ORG_ID), {
          params: Promise.resolve({ orgId: FAKE_ORG_ID, projectId: FAKE_ORG_ID }),
        }),
    );
  });

  it('GET /api/orgs/[orgId]/audit-log: org caller cannot see vs. fake org id (KAN-44)', async () => {
    const callerSession = await sessionFor(unique('uid'), uniqueEmail('iso-audit-caller'));
    const caller = await ensureUserForFirebaseSession({
      firebaseUid: callerSession.uid,
      email: callerSession.email as string,
    });
    await createOrganizationWithOwner({ name: 'Isolation Org A (audit-log)', ownerUserId: caller.id });

    const otherOwner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: uniqueEmail('iso-audit-b-owner') });
    const { organization: orgB } = await createOrganizationWithOwner({ name: 'Isolation Org B (audit-log)', ownerUserId: otherOwner.id });

    getServerSessionMock.mockResolvedValue(callerSession);

    const requestFor = (orgId: string) => new NextRequest(`https://growthos.test/api/orgs/${orgId}/audit-log`);

    await expectIndistinguishable(
      () => listAuditLog(requestFor(orgB.id), { params: Promise.resolve({ orgId: orgB.id }) }),
      () => listAuditLog(requestFor(FAKE_ORG_ID), { params: Promise.resolve({ orgId: FAKE_ORG_ID }) }),
    );
  });

  it('GET/POST /api/orgs/[orgId]/projects/[projectId]/boards: org caller cannot see vs. fake org id (KAN-60)', async () => {
    const callerSession = await sessionFor(unique('uid'), uniqueEmail('iso-boards-caller'));
    const caller = await ensureUserForFirebaseSession({ firebaseUid: callerSession.uid, email: callerSession.email as string });
    await createOrganizationWithOwner({ name: 'Isolation Org A (boards)', ownerUserId: caller.id });

    const otherOwner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: uniqueEmail('iso-boards-b-owner') });
    const { organization: orgB } = await createOrganizationWithOwner({ name: 'Isolation Org B (boards)', ownerUserId: otherOwner.id });

    getServerSessionMock.mockResolvedValue(callerSession);

    const getRequestFor = (orgId: string, projectId: string) =>
      new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/boards`);
    await expectIndistinguishable(
      () => listBoards(getRequestFor(orgB.id, FAKE_ORG_ID), { params: Promise.resolve({ orgId: orgB.id, projectId: FAKE_ORG_ID }) }),
      () => listBoards(getRequestFor(FAKE_ORG_ID, FAKE_ORG_ID), { params: Promise.resolve({ orgId: FAKE_ORG_ID, projectId: FAKE_ORG_ID }) }),
    );

    const postRequestFor = (orgId: string, projectId: string) =>
      new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${projectId}/boards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'leaked board' }),
      });
    await expectIndistinguishable(
      () => createBoard(postRequestFor(orgB.id, FAKE_ORG_ID), { params: Promise.resolve({ orgId: orgB.id, projectId: FAKE_ORG_ID }) }),
      () => createBoard(postRequestFor(FAKE_ORG_ID, FAKE_ORG_ID), { params: Promise.resolve({ orgId: FAKE_ORG_ID, projectId: FAKE_ORG_ID }) }),
    );
  });

  it('PATCH/DELETE /api/orgs/[orgId]/projects/[projectId]/boards/[boardId] and PUT its tiles: org caller cannot see vs. fake org id (KAN-60)', async () => {
    const callerSession = await sessionFor(unique('uid'), uniqueEmail('iso-board-detail-caller'));
    const caller = await ensureUserForFirebaseSession({ firebaseUid: callerSession.uid, email: callerSession.email as string });
    await createOrganizationWithOwner({ name: 'Isolation Org A (board-detail)', ownerUserId: caller.id });

    const otherOwner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: uniqueEmail('iso-board-detail-b-owner') });
    const { organization: orgB } = await createOrganizationWithOwner({ name: 'Isolation Org B (board-detail)', ownerUserId: otherOwner.id });

    getServerSessionMock.mockResolvedValue(callerSession);
    const FAKE_BOARD_ID = 'does-not-exist-board';

    const params = (orgId: string) => Promise.resolve({ orgId, projectId: FAKE_ORG_ID, boardId: FAKE_BOARD_ID });

    const patchRequestFor = (orgId: string) =>
      new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${FAKE_ORG_ID}/boards/${FAKE_BOARD_ID}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'leaked' }),
      });
    await expectIndistinguishable(
      () => patchBoard(patchRequestFor(orgB.id), { params: params(orgB.id) }),
      () => patchBoard(patchRequestFor(FAKE_ORG_ID), { params: params(FAKE_ORG_ID) }),
    );

    const deleteRequestFor = (orgId: string) =>
      new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${FAKE_ORG_ID}/boards/${FAKE_BOARD_ID}`, { method: 'DELETE' });
    await expectIndistinguishable(
      () => deleteBoard(deleteRequestFor(orgB.id), { params: params(orgB.id) }),
      () => deleteBoard(deleteRequestFor(FAKE_ORG_ID), { params: params(FAKE_ORG_ID) }),
    );

    const tilesRequestFor = (orgId: string) =>
      new NextRequest(`https://growthos.test/api/orgs/${orgId}/projects/${FAKE_ORG_ID}/boards/${FAKE_BOARD_ID}/tiles`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tiles: [] }),
      });
    await expectIndistinguishable(
      () => saveBoardTiles(tilesRequestFor(orgB.id), { params: params(orgB.id) }),
      () => saveBoardTiles(tilesRequestFor(FAKE_ORG_ID), { params: params(FAKE_ORG_ID) }),
    );
  });
});
