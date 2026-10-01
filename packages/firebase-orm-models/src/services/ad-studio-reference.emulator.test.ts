import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import { AD_STUDIO_MAX_REFERENCES, type AdStudioBriefInput, type AdStudioScene } from '@growthos/shared';
import {
  AdStudioReferenceInvalidError,
  AdStudioReferenceNotFoundError,
  AdStudioScriptInvalidError,
  createAdStudioBrief,
  createAdStudioReference,
  createOrganizationWithOwner,
  createProject,
  deleteAdStudioBrief,
  deleteAdStudioReference,
  ensureUserForFirebaseSession,
  getAdStudioBrief,
  getAdStudioReference,
  getAdStudioUsageToday,
  listAdStudioReferences,
  markAdStudioReferenceFailed,
  markAdStudioReferenceReady,
  recordAdStudioUsage,
  saveAdStudioScript,
  updateAdStudioReference,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

beforeAll(async () => {
  await connectToFirestoreEmulator('ad-studio-reference-tests');
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

const INPUT: AdStudioBriefInput = {
  name: 'Show the real app',
  objective: 'Trial signups',
  productDescription: 'GrowthOS growth analytics',
  landingPageUrl: null,
  format: 'horizontal',
  language: 'en',
  targetSeconds: 15,
};

async function setup() {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: `${unique('owner')}@example.com` });
  const { organization } = await createOrganizationWithOwner({ name: 'Reference Org', ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  const brief = await createAdStudioBrief({ organizationId: organization.id, projectId: project.id, input: INPUT, createdByUserId: owner.id });
  const ref = { organizationId: organization.id, projectId: project.id, briefId: brief.id };
  const add = (label = 'Dashboard', description = 'The ad studio dashboard') => createAdStudioReference({ ...ref, source: 'upload', label, description, actorId: owner.id });
  return { owner, ref, add };
}

const scene = (id: string, imageIds: string[] = []): AdStudioScene => ({
  id,
  durationSeconds: 5,
  visualPrompt: `Shot ${id}`,
  voiceover: '',
  onScreenText: '',
  ...(imageIds.length ? { references: imageIds.map((imageId) => ({ imageId, use: 'screen' as const })) } : {}),
});

describe('Ad Studio reference images', () => {
  it('records an image, marks it ready or failed, renames it, and refuses a missing label', async () => {
    const { ref, add } = await setup();
    const created = await add('  Dashboard   home ', ' The   main screen ');
    expect(created).toMatchObject({ status: 'generating', label: 'Dashboard home', description: 'The main screen', source: 'upload' });
    await markAdStudioReferenceReady(created, { gcsPath: 'p/ref.png', mimeType: 'image/png', byteSize: 1200 });
    const updated = await updateAdStudioReference({ ...ref, referenceId: created.id, label: 'Home', description: '' });
    expect(updated).toMatchObject({ status: 'ready', label: 'Home', description: '', gcs_path: 'p/ref.png' });

    const failed = await markAdStudioReferenceFailed(await add('Broken'), { code: 'provider_error', message: 'x'.repeat(900) });
    expect(failed.failure_message).toHaveLength(500);
    expect((await listAdStudioReferences(ref.organizationId, ref.projectId, ref.briefId)).map((row) => row.label).sort()).toEqual(['Broken', 'Home']);

    const missing = await add('   ').catch((caught) => caught);
    expect(missing).toBeInstanceOf(AdStudioReferenceInvalidError);
    expect((missing as AdStudioReferenceInvalidError).code).toBe('label_required');
    expect(((await add('x'.repeat(81)).catch((caught) => caught)) as AdStudioReferenceInvalidError).code).toBe('label_too_long');
    expect(((await add('ok', 'x'.repeat(301)).catch((caught) => caught)) as AdStudioReferenceInvalidError).code).toBe('description_too_long');
    await expect(getAdStudioReference(ref.organizationId, ref.projectId, 'another-brief', created.id)).rejects.toBeInstanceOf(AdStudioReferenceNotFoundError);
  });

  it('refuses an image past the library limit', async () => {
    const { add } = await setup();
    for (let index = 0; index < AD_STUDIO_MAX_REFERENCES; index += 1) await add(`Image ${index}`);
    expect(((await add('One too many').catch((caught) => caught)) as AdStudioReferenceInvalidError).code).toBe('library_full');
  });

  it('lets a scene attach only a ready image of the ad, and detaches an image when it is deleted', async () => {
    const { ref, add } = await setup();
    const ready = await markAdStudioReferenceReady(await add('Ready'), { gcsPath: 'p/a.png', mimeType: 'image/png', byteSize: 10 });
    const pending = await add('Still drawing');
    const refused = await saveAdStudioScript({ ...ref, scenes: [scene('s1', [ready.id]), scene('s2', [pending.id]), scene('s3', ['nope'])] }).catch((caught) => caught);
    expect(refused).toBeInstanceOf(AdStudioScriptInvalidError);
    expect((refused as AdStudioScriptInvalidError).issues).toEqual([
      { code: 'unknown_reference', scene: 2 },
      { code: 'unknown_reference', scene: 3 },
    ]);

    await saveAdStudioScript({ ...ref, scenes: [scene('s1', [ready.id]), scene('s2')] });
    expect((await getAdStudioBrief(ref.organizationId, ref.projectId, ref.briefId)).scenes[0].references).toEqual([{ imageId: ready.id, use: 'screen' }]);
    expect(await deleteAdStudioReference(ref.organizationId, ref.projectId, ref.briefId, ready.id)).toEqual({ gcsPath: 'p/a.png' });
    const scenes = (await getAdStudioBrief(ref.organizationId, ref.projectId, ref.briefId)).scenes;
    expect(scenes.map((entry) => 'references' in entry)).toEqual([false, false]);
    expect((await listAdStudioReferences(ref.organizationId, ref.projectId, ref.briefId)).map((row) => row.id)).toEqual([pending.id]);
  });

  it('goes with its ad, and an illustration counts toward the daily image limit', async () => {
    const { owner, ref, add } = await setup();
    await add();
    await recordAdStudioUsage({ organizationId: ref.organizationId, projectId: ref.projectId, kind: 'reference_image', provider: 'gemini', model: 'm', units: 1, briefId: ref.briefId, actorId: owner.id, outcome: 'succeeded' });
    expect((await getAdStudioUsageToday(ref.organizationId, ref.projectId)).images).toBe(1);
    await deleteAdStudioBrief({ ...ref, actorId: owner.id });
    expect(await listAdStudioReferences(ref.organizationId, ref.projectId, ref.briefId)).toEqual([]);
  });
});
