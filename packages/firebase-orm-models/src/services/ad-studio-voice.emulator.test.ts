import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import type { AdStudioBriefInput } from '@growthos/shared';
import {
  AdStudioVoiceInvalidError,
  createAdStudioBrief,
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  getAdStudioBrief,
  saveAdStudioScript,
  saveAdStudioVoice,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

beforeAll(async () => {
  await connectToFirestoreEmulator('ad-studio-voice-tests');
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

const INPUT: AdStudioBriefInput = { name: 'Sign fast', objective: 'Signups', productDescription: 'E-signatures', landingPageUrl: null, format: 'vertical', language: 'en', targetSeconds: 15 };

async function setup() {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: `${unique('owner')}@example.com` });
  const { organization } = await createOrganizationWithOwner({ name: 'Voice Org', ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  const brief = await createAdStudioBrief({ organizationId: organization.id, projectId: project.id, input: INPUT, createdByUserId: owner.id });
  return { organizationId: organization.id, projectId: project.id, briefId: brief.id };
}

describe('Ad Studio narrator voice', () => {
  it('stores a preset without a description, a custom voice cleaned to one line, and clears it with null', async () => {
    const ref = await setup();
    expect((await getAdStudioBrief(ref.organizationId, ref.projectId, ref.briefId)).narrator_voice ?? null).toBeNull();

    await saveAdStudioVoice({ ...ref, voice: { preset: 'man_deep', description: 'ignored' } });
    expect((await getAdStudioBrief(ref.organizationId, ref.projectId, ref.briefId)).narrator_voice).toEqual({ preset: 'man_deep' });

    await saveAdStudioVoice({ ...ref, voice: { preset: 'custom', description: '  an older man,\n slow and warm ' } });
    expect((await getAdStudioBrief(ref.organizationId, ref.projectId, ref.briefId)).narrator_voice).toEqual({ preset: 'custom', description: 'an older man, slow and warm' });

    await saveAdStudioVoice({ ...ref, voice: null });
    expect((await getAdStudioBrief(ref.organizationId, ref.projectId, ref.briefId)).narrator_voice).toBeNull();
  });

  it('refuses an invalid voice and keeps the saved one', async () => {
    const ref = await setup();
    await saveAdStudioVoice({ ...ref, voice: { preset: 'woman_warm' } });
    await expect(saveAdStudioVoice({ ...ref, voice: { preset: 'custom', description: ' ' } })).rejects.toBeInstanceOf(AdStudioVoiceInvalidError);
    await expect(saveAdStudioVoice({ ...ref, voice: { preset: 'robot' as never } })).rejects.toMatchObject({ code: 'unknown_voice' });
    expect((await getAdStudioBrief(ref.organizationId, ref.projectId, ref.briefId)).narrator_voice).toEqual({ preset: 'woman_warm' });
  });

  it('keeps who speaks each scene through a script save', async () => {
    const ref = await setup();
    await saveAdStudioScript({
      ...ref,
      scenes: [
        { id: 's1', durationSeconds: 5, visualPrompt: 'Two lawyers', voiceover: 'Sign fast', onScreenText: '', delivery: 'on_screen', speaker: '  the woman in blue ' },
        { id: 's2', durationSeconds: 5, visualPrompt: 'A phone', voiceover: '', onScreenText: '', delivery: 'on_screen', speaker: 'nobody' },
      ],
    });
    const brief = await getAdStudioBrief(ref.organizationId, ref.projectId, ref.briefId);
    expect(brief.scenes[0]).toMatchObject({ delivery: 'on_screen', speaker: 'the woman in blue' });
    // No narration: nothing to speak, so no speaker is kept.
    expect(brief.scenes[1].delivery).toBeUndefined();
    expect(brief.scenes[1].speaker).toBeUndefined();
  });
});
