import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import type { AdStudioBriefInput } from '@growthos/shared';
import {
  AdShareLinkInvalidError,
  AdShareLinkModel,
  AdShareLinkNotFoundError,
  AdStudioBriefNotFoundError,
  createAdShareLink,
  createAdStudioBrief,
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  hashAdShareToken,
  listAdShareLinks,
  listAuditLogEntriesForOrg,
  ProjectNotFoundError,
  resolveAdShareToken,
  revokeAdShareLink,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

beforeAll(async () => {
  await connectToFirestoreEmulator('ad-share-link-tests');
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

const INPUT: AdStudioBriefInput = {
  name: 'Sign in 30 seconds',
  objective: 'Trial signups',
  productDescription: 'E-signatures for lawyers',
  landingPageUrl: 'https://example.com',
  format: 'vertical',
  language: 'en',
  targetSeconds: 30,
};

async function setup() {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: `${unique('owner')}@example.com` });
  const { organization } = await createOrganizationWithOwner({ name: 'Share Org', ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  const brief = await createAdStudioBrief({ organizationId: organization.id, projectId: project.id, input: INPUT, createdByUserId: owner.id });
  return { owner, orgId: organization.id, projectId: project.id, briefId: brief.id };
}

describe('ad share links', () => {
  it('stores only the hash of the token, and the token resolves to its project and ads', async () => {
    const ctx = await setup();
    const { token, link } = await createAdShareLink({ organizationId: ctx.orgId, projectId: ctx.projectId, briefIds: [ctx.briefId], label: ' Dana ', actorId: ctx.owner.id });
    expect(link.id).toBe(hashAdShareToken(token));
    expect(link).toMatchObject({ briefIds: [ctx.briefId], label: 'Dana', status: 'active', revokedOn: null });
    const stored = await AdShareLinkModel.init(link.id);
    expect(stored?.organization_id).toBe(ctx.orgId);
    expect(Object.values(stored ?? {}).some((value) => value === token)).toBe(false);

    expect(await resolveAdShareToken(token)).toEqual({ id: link.id, organizationId: ctx.orgId, projectId: ctx.projectId, briefIds: [ctx.briefId], expiresOn: link.expiresOn });
    expect(await resolveAdShareToken(`${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`)).toBeNull();
    expect(await resolveAdShareToken('not-a-token')).toBeNull();

    const actions = (await listAuditLogEntriesForOrg(ctx.orgId)).map((entry) => entry.action);
    expect(actions).toContain('ad_studio.share_link_created');
  });

  it('defaults to 30 days and all ads; an expired link no longer resolves', async () => {
    const ctx = await setup();
    const now = new Date('2026-01-01T00:00:00.000Z');
    const { token, link } = await createAdShareLink({ organizationId: ctx.orgId, projectId: ctx.projectId, briefIds: null, actorId: ctx.owner.id, now });
    expect(link).toMatchObject({ briefIds: null, expiresOn: '2026-01-31T00:00:00.000Z' });
    expect(await resolveAdShareToken(token, new Date('2026-01-30T23:59:59.000Z'))).not.toBeNull();
    expect(await resolveAdShareToken(token, new Date('2026-01-31T00:00:00.000Z'))).toBeNull();
    const [listed] = await listAdShareLinks(ctx.orgId, ctx.projectId, new Date('2026-02-01T00:00:00.000Z'));
    expect(listed.status).toBe('expired');
  });

  it('revokes at once, idempotently, and audits it', async () => {
    const ctx = await setup();
    const { token, link } = await createAdShareLink({ organizationId: ctx.orgId, projectId: ctx.projectId, briefIds: null, expiresInDays: 7, actorId: ctx.owner.id });
    const revoked = await revokeAdShareLink({ organizationId: ctx.orgId, projectId: ctx.projectId, linkId: link.id, actorId: ctx.owner.id });
    expect(revoked.status).toBe('revoked');
    expect(await resolveAdShareToken(token)).toBeNull();
    const again = await revokeAdShareLink({ organizationId: ctx.orgId, projectId: ctx.projectId, linkId: link.id, actorId: ctx.owner.id });
    expect(again.revokedOn).toBe(revoked.revokedOn);
    expect((await listAuditLogEntriesForOrg(ctx.orgId)).filter((entry) => entry.action === 'ad_studio.share_link_revoked')).toHaveLength(1);
  });

  it('lists only the project own links, newest first, without tokens', async () => {
    const ctx = await setup();
    const other = await setup();
    await createAdShareLink({ organizationId: ctx.orgId, projectId: ctx.projectId, briefIds: null, label: 'first', actorId: ctx.owner.id, now: new Date(Date.now() - 1000) });
    await createAdShareLink({ organizationId: ctx.orgId, projectId: ctx.projectId, briefIds: null, label: 'second', actorId: ctx.owner.id });
    await createAdShareLink({ organizationId: other.orgId, projectId: other.projectId, briefIds: null, label: 'elsewhere', actorId: other.owner.id });
    const links = await listAdShareLinks(ctx.orgId, ctx.projectId);
    expect(links.map((link) => link.label)).toEqual(['second', 'first']);
    expect(JSON.stringify(links)).not.toContain('token');
  });

  it('refuses a brief of another project, bad input, and revoking another project link', async () => {
    const ctx = await setup();
    const other = await setup();
    await expect(createAdShareLink({ organizationId: ctx.orgId, projectId: ctx.projectId, briefIds: [other.briefId], actorId: ctx.owner.id })).rejects.toBeInstanceOf(AdStudioBriefNotFoundError);
    await expect(createAdShareLink({ organizationId: ctx.orgId, projectId: ctx.projectId, briefIds: null, expiresInDays: 365, actorId: ctx.owner.id })).rejects.toBeInstanceOf(AdShareLinkInvalidError);
    await expect(createAdShareLink({ organizationId: ctx.orgId, projectId: other.projectId, briefIds: null, actorId: ctx.owner.id })).rejects.toBeInstanceOf(ProjectNotFoundError);
    const { link } = await createAdShareLink({ organizationId: other.orgId, projectId: other.projectId, briefIds: null, actorId: other.owner.id });
    await expect(revokeAdShareLink({ organizationId: ctx.orgId, projectId: ctx.projectId, linkId: link.id, actorId: ctx.owner.id })).rejects.toBeInstanceOf(AdShareLinkNotFoundError);
    await expect(revokeAdShareLink({ organizationId: ctx.orgId, projectId: ctx.projectId, linkId: 'nope', actorId: ctx.owner.id })).rejects.toBeInstanceOf(AdShareLinkNotFoundError);
  });
});
