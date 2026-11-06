import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  AdStudioBrandKitInvalidError,
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  getAdStudioAdvertiserName,
  getAdStudioBrandKit,
  listAuditLogEntriesForOrg,
  setAdStudioBrandKit,
  setAdStudioBrandLogo,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

beforeAll(async () => {
  await connectToFirestoreEmulator('ad-studio-brand-kit-tests');
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

async function setup() {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: `${unique('owner')}@example.com` });
  const { organization } = await createOrganizationWithOwner({ name: 'Brand Org', ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  return { owner, orgId: organization.id, projectId: project.id };
}

describe('Ad Studio brand kit', () => {
  it('is empty until saved, then reads back what was saved, and the change is audited', async () => {
    const { owner, orgId, projectId } = await setup();
    expect(await getAdStudioBrandKit(orgId, projectId)).toEqual({ brandName: '', slogan: '', toneOfVoice: '', avoidWords: [], colors: [], lastChangedOn: null, logo: null });
    const kit = { brandName: 'EasySign', slogan: 'Sign anywhere', toneOfVoice: 'warm, never pushy', avoidWords: ['cheap'], colors: ['#5b4fe9'] };
    const saved = await setAdStudioBrandKit({ organizationId: orgId, projectId, kit, actorId: owner.id, now: new Date('2026-10-12T10:00:00.000Z') });
    expect(saved).toEqual({ ...kit, lastChangedOn: '2026-10-12T10:00:00.000Z', logo: null });
    await setAdStudioBrandKit({ organizationId: orgId, projectId, kit: { ...kit, colors: [] }, actorId: owner.id });
    expect((await getAdStudioBrandKit(orgId, projectId)).colors).toEqual([]);
    const entries = (await listAuditLogEntriesForOrg(orgId)).filter((entry) => entry.action === 'ad_studio.brand_kit_changed');
    expect(entries).toHaveLength(2);
  });

  it('refuses a kit that breaks the limits, with the codes', async () => {
    const { owner, orgId, projectId } = await setup();
    await expect(
      setAdStudioBrandKit({ organizationId: orgId, projectId, kit: { brandName: '', slogan: '', toneOfVoice: '', avoidWords: [], colors: ['blue'] }, actorId: owner.id }),
    ).rejects.toMatchObject({ name: 'AdStudioBrandKitInvalidError', issues: ['invalid_color'] });
    await expect(
      setAdStudioBrandKit({ organizationId: orgId, projectId, kit: { brandName: '', slogan: 'x'.repeat(71), toneOfVoice: '', avoidWords: [], colors: [] }, actorId: owner.id }),
    ).rejects.toMatchObject({ issues: ['slogan_too_long'] });
    expect(AdStudioBrandKitInvalidError).toBeDefined();
  });

  it('names the advertiser by the brand name, else by the project', async () => {
    const { owner, orgId, projectId } = await setup();
    expect(await getAdStudioAdvertiserName(orgId, projectId)).toBe('Website');
    await setAdStudioBrandKit({ organizationId: orgId, projectId, kit: { brandName: 'EasySign', slogan: '', toneOfVoice: '', avoidWords: [], colors: [] }, actorId: owner.id });
    expect(await getAdStudioAdvertiserName(orgId, projectId)).toBe('EasySign');
  });

  it('keeps the logo next to the text fields: set, kept by a text save, and removed', async () => {
    const { owner, orgId, projectId } = await setup();
    const withLogo = await setAdStudioBrandLogo({ organizationId: orgId, projectId, logo: { path: 'orgs/o/brand/logo.png', mimeType: 'image/png' }, actorId: owner.id });
    expect(withLogo).toMatchObject({ brandName: '', logo: { path: 'orgs/o/brand/logo.png', mimeType: 'image/png' } });
    await setAdStudioBrandKit({ organizationId: orgId, projectId, kit: { brandName: 'EasySign', slogan: '', toneOfVoice: '', avoidWords: [], colors: [] }, actorId: owner.id });
    expect((await getAdStudioBrandKit(orgId, projectId)).logo).toEqual({ path: 'orgs/o/brand/logo.png', mimeType: 'image/png' });
    expect((await setAdStudioBrandLogo({ organizationId: orgId, projectId, logo: null, actorId: owner.id })).logo).toBeNull();
  });
});
