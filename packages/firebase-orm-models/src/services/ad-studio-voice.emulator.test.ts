import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import { sceneFingerprint, type AdStudioBriefInput } from '@growthos/shared';
import {
  AdStudioBriefInvalidError,
  adStudioNarrationMode,
  saveAdStudioNarrationMode,
  updateAdStudioBriefDetails,
  AdStudioVideoSettingsInvalidError,
  AdStudioVoiceInvalidError,
  createAdStudioBrief,
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  getAdStudioBrief,
  saveAdStudioScript,
  saveAdStudioVideoSettings,
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

  it('changes the advanced video settings field by field, stores defaults as null, and refuses invalid ones', async () => {
    const ref = await setup();
    const read = async () => (await getAdStudioBrief(ref.organizationId, ref.projectId, ref.briefId)).video_settings ?? null;
    await saveAdStudioVideoSettings({ ...ref, settings: { resolution: '1080p', avoid: '  no   cars ' } });
    expect(await read()).toEqual({ resolution: '1080p', style: 'commercial', music: 'auto', avoid: 'no cars' });
    // A field left out keeps its value.
    await saveAdStudioVideoSettings({ ...ref, settings: { style: 'cinematic' } });
    expect(await read()).toEqual({ resolution: '1080p', style: 'cinematic', music: 'auto', avoid: 'no cars' });
    await expect(saveAdStudioVideoSettings({ ...ref, settings: { music: 'custom', musicDescription: ' ' } })).rejects.toBeInstanceOf(AdStudioVideoSettingsInvalidError);
    await expect(saveAdStudioVideoSettings({ ...ref, settings: { resolution: '4k' as never } })).rejects.toMatchObject({ code: 'unknown_resolution' });
    await saveAdStudioVideoSettings({ ...ref, settings: { resolution: '720p', style: 'commercial', avoid: '' } });
    expect(await read()).toBeNull();
  });

  it('keeps who speaks each scene through a script save in a mixed ad', async () => {
    const ref = await setup();
    await saveAdStudioNarrationMode({ ...ref, mode: 'mixed' });
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

describe('Ad Studio narration mode', () => {
  const SCRIPT = [
    { id: 's1', durationSeconds: 5, visualPrompt: 'A lawyer', voiceover: 'Sign fast', onScreenText: '' },
    { id: 's2', durationSeconds: 5, visualPrompt: 'Two lawyers', voiceover: 'From anywhere', onScreenText: '', delivery: 'on_screen' as const, speaker: 'the man in grey' },
    { id: 's3', durationSeconds: 5, visualPrompt: 'A phone', voiceover: '', onScreenText: '' },
  ];
  const read = (ref: { organizationId: string; projectId: string; briefId: string }) => getAdStudioBrief(ref.organizationId, ref.projectId, ref.briefId);

  it('starts automatic, and a voice-over ad never keeps a speaker on screen', async () => {
    const ref = await setup();
    const fresh = await read(ref);
    expect(fresh.narration_mode ?? null).toBeNull();
    expect(adStudioNarrationMode(fresh)).toBe('voiceover');
    await saveAdStudioScript({ ...ref, scenes: SCRIPT });
    expect((await read(ref)).scenes.map((scene) => scene.delivery ?? null)).toEqual([null, null, null]);
  });

  it('stores the mode the script writer detected, and a chosen mode wins over it', async () => {
    const ref = await setup();
    await saveAdStudioScript({ ...ref, scenes: SCRIPT, detectedNarrationMode: 'on_camera' });
    let brief = await read(ref);
    expect(brief.detected_narration_mode).toBe('on_camera');
    expect(brief.scenes.map((scene) => [scene.delivery ?? null, scene.speaker ?? null])).toEqual([
      ['on_screen', 'the man in grey'],
      ['on_screen', 'the man in grey'],
      [null, null],
    ]);
    await saveAdStudioNarrationMode({ ...ref, mode: 'voiceover' });
    brief = await read(ref);
    expect(brief.narration_mode).toBe('voiceover');
    expect(adStudioNarrationMode(brief)).toBe('voiceover');
    expect(brief.scenes.every((scene) => scene.delivery === undefined && scene.speaker === undefined)).toBe(true);
  });

  it('puts one named presenter on camera in every narrated scene and makes their clips out of date', async () => {
    const ref = await setup();
    await saveAdStudioNarrationMode({ ...ref, mode: 'mixed' });
    await saveAdStudioScript({ ...ref, scenes: SCRIPT });
    const context = { format: 'vertical' as const, language: 'en', voice: null, settings: null };
    const before = (await read(ref)).scenes.map((scene) => sceneFingerprint(scene, context));
    await saveAdStudioNarrationMode({ ...ref, mode: 'on_camera', presenter: '  a chef in a white apron ' });
    const brief = await read(ref);
    expect(brief.scenes.map((scene) => [scene.delivery ?? null, scene.speaker ?? null])).toEqual([
      ['on_screen', 'a chef in a white apron'],
      ['on_screen', 'a chef in a white apron'],
      [null, null],
    ]);
    const after = brief.scenes.map((scene) => sceneFingerprint(scene, context));
    expect(before.map((value, index) => value !== after[index])).toEqual([true, true, false]);
  });

  it('takes the mode with the brief, keeps it when a brief update leaves it out, and refuses an unknown one', async () => {
    const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: `${unique('owner')}@example.com` });
    const { organization } = await createOrganizationWithOwner({ name: 'Narration Org', ownerUserId: owner.id });
    const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
    const created = await createAdStudioBrief({ organizationId: organization.id, projectId: project.id, input: { ...INPUT, narrationMode: 'on_camera' }, createdByUserId: owner.id });
    const ref = { organizationId: organization.id, projectId: project.id, briefId: created.id };
    expect((await read(ref)).narration_mode).toBe('on_camera');
    await updateAdStudioBriefDetails({ ...ref, input: { ...INPUT, name: 'Renamed' } });
    expect((await read(ref)).narration_mode).toBe('on_camera');
    await updateAdStudioBriefDetails({ ...ref, input: { ...INPUT, narrationMode: null } });
    expect((await read(ref)).narration_mode ?? null).toBeNull();
    await expect(updateAdStudioBriefDetails({ ...ref, input: { ...INPUT, narrationMode: 'presenter' as never } })).rejects.toBeInstanceOf(AdStudioBriefInvalidError);
    await expect(saveAdStudioNarrationMode({ ...ref, mode: 'loud' as never })).rejects.toBeInstanceOf(AdStudioBriefInvalidError);
  });
});
