import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  ingestBatch,
  inviteMemberToOrganization,
  acceptInvite,
  registerSchemaDefinition,
} from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { GET } from './route';

const { getServerSessionMock } = vi.hoisted(() => ({ getServerSessionMock: vi.fn() }));
vi.mock('@/lib/auth/get-server-session', () => ({ getServerSession: getServerSessionMock }));

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8090';
  process.env.FIREBASE_PROJECT_ID = 'demo-growthos-test';
  await ensureFirestoreOrm();
});

beforeEach(() => getServerSessionMock.mockReset());

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

async function sessionFor(email: string): Promise<DecodedIdToken> {
  return { uid: unique('uid'), email, email_verified: true } as DecodedIdToken;
}

async function setup() {
  const ownerSession = await sessionFor(`${unique('owner')}@example.com`);
  const owner = await ensureUserForFirebaseSession({
    firebaseUid: ownerSession.uid,
    email: ownerSession.email as string,
  });
  const { organization } = await createOrganizationWithOwner({
    name: 'Install Org',
    ownerUserId: owner.id,
  });
  const { project, environments } = await createProject({
    organizationId: organization.id,
    name: 'Website',
  });
  const prod = environments.find((environment) => environment.name === 'prod')!;
  await registerSchemaDefinition({
    organizationId: organization.id,
    projectId: project.id,
    kind: 'event',
    name: 'signup',
    fields: [
      { name: 'plan', type: 'string', isRequired: true, isPii: false, isIdentityKey: false },
    ],
    createdByUserId: owner.id,
  });
  await ingestBatch({
    organizationId: organization.id,
    projectId: project.id,
    environmentId: prod.id,
    input: {
      kind: 'event',
      records: [
        {
          event_id: 'i-1',
          event: 'signup',
          ts: new Date().toISOString(),
          properties: { plan: 'free' },
        },
      ],
    },
  });
  return { ownerSession, owner, orgId: organization.id, projectId: project.id, prod, environments };
}

function request(orgId: string, projectId: string, query: string) {
  return GET(
    new NextRequest(
      `https://growthos.test/api/orgs/${orgId}/projects/${projectId}/installation?${query}`,
    ),
    { params: Promise.resolve({ orgId, projectId }) },
  );
}

describe('GET /api/orgs/[orgId]/projects/[projectId]/installation', () => {
  it('checks each expected schema in the chosen environment from what really arrived', async () => {
    const ctx = await setup();
    getServerSessionMock.mockResolvedValue(ctx.ownerSession);
    const response = await request(
      ctx.orgId,
      ctx.projectId,
      `environmentId=${ctx.prod.id}&expect=signup,touchpoint`,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      environment: { name: string };
      report: { status: string; schemas: { name: string; status: string }[] };
    };
    expect(body.environment.name).toBe('prod');
    expect(body.report.schemas.map((schema) => [schema.name, schema.status])).toEqual([
      ['signup', 'receiving'],
      ['touchpoint', 'not_registered'],
    ]);
    // Another environment has seen nothing.
    const dev = ctx.environments.find((environment) => environment.name === 'dev')!;
    const devBody = (await (
      await request(ctx.orgId, ctx.projectId, `environmentId=${dev.id}&expect=signup`)
    ).json()) as { report: { schemas: { status: string }[] } };
    expect(devBody.report.schemas[0].status).toBe('registered_no_data');
  });

  it('refuses an unknown environment, too many names, a stranger and a viewer', async () => {
    const ctx = await setup();
    getServerSessionMock.mockResolvedValue(ctx.ownerSession);
    expect((await request(ctx.orgId, ctx.projectId, 'environmentId=nope')).status).toBe(404);
    expect(
      (
        await request(
          ctx.orgId,
          ctx.projectId,
          `environmentId=${ctx.prod.id}&expect=${Array.from({ length: 51 }, (_, i) => `s${i}`).join(',')}`,
        )
      ).status,
    ).toBe(400);

    getServerSessionMock.mockResolvedValue(await sessionFor(`${unique('stranger')}@example.com`));
    expect((await request(ctx.orgId, ctx.projectId, `environmentId=${ctx.prod.id}`)).status).toBe(
      404,
    );

    const viewerEmail = `${unique('viewer')}@example.com`;
    const invitation = await inviteMemberToOrganization({
      organizationId: ctx.orgId,
      email: viewerEmail,
      role: 'viewer',
      invitedByUserId: ctx.owner.id,
    });
    const viewerSession = await sessionFor(viewerEmail);
    const viewer = await ensureUserForFirebaseSession({
      firebaseUid: viewerSession.uid,
      email: viewerEmail,
    });
    await acceptInvite({
      organizationId: ctx.orgId,
      membershipId: invitation.id,
      userId: viewer.id,
      callerEmailVerified: true,
    });
    getServerSessionMock.mockResolvedValue(viewerSession);
    expect((await request(ctx.orgId, ctx.projectId, `environmentId=${ctx.prod.id}`)).status).toBe(
      403,
    );
  });
});
