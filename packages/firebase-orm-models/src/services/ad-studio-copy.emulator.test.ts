import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import type { AdStudioBriefInput, AdStudioImageConcept } from '@growthos/shared';
import {
  AdStudioCopyInvalidError,
  createAdStudioBrief,
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  getAdStudioBrief,
  saveAdStudioCopy,
  saveAdStudioImageConcepts,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

beforeAll(async () => {
  await connectToFirestoreEmulator('ad-studio-copy-tests');
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

const INPUT: AdStudioBriefInput = { name: 'Sign fast', objective: 'Signups', productDescription: 'E-signatures', landingPageUrl: null, format: 'vertical', language: 'en', targetSeconds: 15 };
const COPY = { headline: 'Sign in 30 seconds', primaryText: 'Upload, send on WhatsApp, signed.', description: 'Start free' };
const idea = (id: string, extra: Partial<AdStudioImageConcept> = {}): AdStudioImageConcept => ({ id, visualPrompt: `Picture ${id}`, headline: '', formats: ['square'], ...extra });

async function setup() {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: `${unique('owner')}@example.com` });
  const { organization } = await createOrganizationWithOwner({ name: 'Copy Org', ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  const brief = await createAdStudioBrief({ organizationId: organization.id, projectId: project.id, input: INPUT, createdByUserId: owner.id });
  return { organizationId: organization.id, projectId: project.id, briefId: brief.id };
}

describe('Ad Studio ad copy', () => {
  it('saves the video copy and an idea copy, cleans whitespace, and clears one with null', async () => {
    const ref = await setup();
    await saveAdStudioImageConcepts({ ...ref, concepts: [idea('a'), idea('b')] });
    const saved = await saveAdStudioCopy({ ...ref, videoCopy: { ...COPY, headline: '  Sign   in 30 seconds ' }, conceptCopies: { a: COPY } });
    expect(saved.video_copy).toEqual(COPY);
    expect(saved.image_concepts?.map((concept) => concept.copy ?? null)).toEqual([COPY, null]);

    await saveAdStudioCopy({ ...ref, videoCopy: null, conceptCopies: { a: { headline: ' ', primaryText: '', description: '' } } });
    const cleared = await getAdStudioBrief(ref.organizationId, ref.projectId, ref.briefId);
    expect(cleared.video_copy).toBeNull();
    expect('copy' in (cleared.image_concepts ?? [])[0]).toBe(false);
  });

  it('refuses copy past the limits or for an idea that does not exist, and saves nothing', async () => {
    const ref = await setup();
    await saveAdStudioImageConcepts({ ...ref, concepts: [idea('a')] });
    const refused = await saveAdStudioCopy({ ...ref, videoCopy: { ...COPY, headline: 'x'.repeat(31) }, conceptCopies: { ghost: COPY } }).catch((caught) => caught);
    expect(refused).toBeInstanceOf(AdStudioCopyInvalidError);
    expect((refused as AdStudioCopyInvalidError).issues).toEqual([
      { code: 'copy_headline_too_long', target: 'video' },
      { code: 'unknown_concept', target: 'ghost' },
    ]);
    expect((await getAdStudioBrief(ref.organizationId, ref.projectId, ref.briefId)).video_copy ?? null).toBeNull();
  });

  it('keeps an idea copy when the ideas are saved without it, and takes a new one when sent', async () => {
    const ref = await setup();
    await saveAdStudioImageConcepts({ ...ref, concepts: [idea('a', { copy: COPY }), idea('b')] });
    // The ideas editor sends ideas without copy: the stored copy stays.
    await saveAdStudioImageConcepts({ ...ref, concepts: [idea('a', { visualPrompt: 'Changed picture' }), idea('b')] });
    let concepts = (await getAdStudioBrief(ref.organizationId, ref.projectId, ref.briefId)).image_concepts ?? [];
    expect(concepts.map((concept) => concept.copy ?? null)).toEqual([COPY, null]);
    expect(concepts[0].visualPrompt).toBe('Changed picture');
    await saveAdStudioImageConcepts({ ...ref, concepts: [idea('a', { copy: { ...COPY, headline: 'New' } })] });
    concepts = (await getAdStudioBrief(ref.organizationId, ref.projectId, ref.briefId)).image_concepts ?? [];
    expect(concepts).toHaveLength(1);
    expect(concepts[0].copy?.headline).toBe('New');
  });
});
