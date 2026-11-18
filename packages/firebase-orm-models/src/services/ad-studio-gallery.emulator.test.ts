import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import { AD_STUDIO_MAX_GALLERY_ASSETS } from '@growthos/shared';
import {
  AdStudioGalleryAssetNotFoundError,
  AdStudioGalleryInvalidError,
  createAdStudioBrief,
  createAdStudioGalleryAsset,
  createOrganizationWithOwner,
  createProject,
  deleteAdStudioGalleryAsset,
  ensureUserForFirebaseSession,
  getAdStudioBrief,
  getAdStudioGalleryAsset,
  listAdStudioGalleryAssets,
  saveAdStudioBriefSitePages,
  updateAdStudioBriefSitePageSelection,
  updateAdStudioGalleryAsset,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

beforeAll(async () => {
  await connectToFirestoreEmulator('ad-studio-gallery-tests');
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

async function setup() {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: `${unique('gallery')}@example.com` });
  const { organization } = await createOrganizationWithOwner({ name: 'Gallery Org', ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Gallery Project' });
  return { owner, orgId: organization.id, projectId: project.id };
}

describe('Ad Studio project gallery', () => {
  it('stores, lists newest first, updates, enforces tenant isolation, and deletes gallery assets', async () => {
    const { owner, orgId, projectId } = await setup();
    const first = await createAdStudioGalleryAsset({
      organizationId: orgId,
      projectId,
      kind: 'image',
      source: 'upload',
      label: 'Hero screen',
      description: 'Main workspace screenshot',
      gcsPath: `orgs/${orgId}/projects/${projectId}/gallery/img1.png`,
      mimeType: 'image/png',
      byteSize: 2048,
      actorId: owner.id,
      now: new Date('2026-11-17T10:00:00.000Z'),
    });
    const second = await createAdStudioGalleryAsset({
      organizationId: orgId,
      projectId,
      kind: 'video',
      source: 'upload',
      label: 'Product demo clip',
      description: 'Short clip from the app',
      gcsPath: `orgs/${orgId}/projects/${projectId}/gallery/vid1.mp4`,
      mimeType: 'video/mp4',
      byteSize: 8192,
      durationSeconds: 12.5,
      actorId: owner.id,
      now: new Date('2026-11-17T11:00:00.000Z'),
    });

    const listed = await listAdStudioGalleryAssets(orgId, projectId);
    expect(listed.map((row) => row.id)).toEqual([second.id, first.id]);

    const updated = await updateAdStudioGalleryAsset({
      organizationId: orgId,
      projectId,
      assetId: first.id,
      label: 'Updated hero',
      description: 'Refined caption',
    });
    expect(updated.label).toBe('Updated hero');
    expect(updated.description).toBe('Refined caption');

    const { project: sibling } = await createProject({ organizationId: orgId, name: 'Sibling' });
    await expect(getAdStudioGalleryAsset(orgId, sibling.id, first.id)).rejects.toBeInstanceOf(AdStudioGalleryAssetNotFoundError);

    const removed = await deleteAdStudioGalleryAsset(orgId, projectId, first.id);
    expect(removed.gcsPath).toBe(first.gcs_path);
    await expect(getAdStudioGalleryAsset(orgId, projectId, first.id)).rejects.toBeInstanceOf(AdStudioGalleryAssetNotFoundError);
  });

  it('validates label, description, and the per-project asset limit', async () => {
    const { owner, orgId, projectId } = await setup();
    await expect(
      createAdStudioGalleryAsset({
        organizationId: orgId,
        projectId,
        kind: 'image',
        source: 'upload',
        label: '   ',
        description: '',
        gcsPath: 'x',
        mimeType: 'image/png',
        byteSize: 10,
        actorId: owner.id,
      }),
    ).rejects.toMatchObject({ code: 'label_required' });

    for (let i = 0; i < AD_STUDIO_MAX_GALLERY_ASSETS; i += 1) {
      await createAdStudioGalleryAsset({
        organizationId: orgId,
        projectId,
        kind: 'image',
        source: 'upload',
        label: `Asset ${i}`,
        description: '',
        gcsPath: `orgs/${orgId}/projects/${projectId}/gallery/${i}.png`,
        mimeType: 'image/png',
        byteSize: 100,
        actorId: owner.id,
        now: new Date(1_700_000_000_000 + i * 1000),
      });
    }

    await expect(
      createAdStudioGalleryAsset({
        organizationId: orgId,
        projectId,
        kind: 'image',
        source: 'upload',
        label: 'Overflow',
        description: '',
        gcsPath: 'orgs/overflow.png',
        mimeType: 'image/png',
        byteSize: 100,
        actorId: owner.id,
      }),
    ).rejects.toBeInstanceOf(AdStudioGalleryInvalidError);
  });

  it('saves and updates scanned site scroll pages on a brief', async () => {
    const { owner, orgId, projectId } = await setup();
    const brief = await createAdStudioBrief({
      organizationId: orgId,
      projectId,
      createdByUserId: owner.id,
      input: {
        name: 'Site Scroll Brief',
        objective: 'signups',
        productDescription: 'SaaS workflow automation',
        format: 'vertical',
        language: 'en',
        targetSeconds: 15,
      },
    });

    await saveAdStudioBriefSitePages({
      organizationId: orgId,
      projectId,
      briefId: brief.id,
      landingPageUrl: 'https://example.com',
      sitePages: [
        {
          id: 'p1',
          url: 'https://example.com/',
          title: 'Home',
          kind: 'home',
          relevanceReason: 'Homepage overview',
          screenshotGcsPath: 'orgs/o/p/briefs/b/site-pages/p1.png',
          scrollVideoGcsPath: 'orgs/o/p/briefs/b/site-pages/p1.mp4',
          durationSeconds: 4,
          selected: true,
          capturedOn: '2026-11-18T00:00:00.000Z',
        },
        {
          id: 'p2',
          url: 'https://example.com/product',
          title: 'Product',
          kind: 'product',
          relevanceReason: 'Matches ad focus',
          screenshotGcsPath: 'orgs/o/p/briefs/b/site-pages/p2.png',
          scrollVideoGcsPath: 'orgs/o/p/briefs/b/site-pages/p2.mp4',
          durationSeconds: 4,
          selected: true,
          capturedOn: '2026-11-18T00:00:00.000Z',
        },
      ],
    });

    const updated = await updateAdStudioBriefSitePageSelection({
      organizationId: orgId,
      projectId,
      briefId: brief.id,
      selectedPageIds: ['p2'],
    });
    expect(updated.landing_page_url).toBe('https://example.com');
    expect(updated.site_pages?.map((p) => [p.id, p.selected])).toEqual([
      ['p1', false],
      ['p2', true],
    ]);

    const reloaded = await getAdStudioBrief(orgId, projectId, brief.id);
    expect(reloaded.site_pages).toHaveLength(2);
    expect(reloaded.site_pages?.[1].selected).toBe(true);
  });
});
