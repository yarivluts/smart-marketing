import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import type { AdStudioBriefInput, AdStudioScene } from '@growthos/shared';
import {
  AdStudioBriefInvalidError,
  AdStudioBriefNotFoundError,
  AdStudioQuotaExceededError,
  AdStudioScriptInvalidError,
  AD_STUDIO_DEFAULT_DAILY_TEXT_GENERATIONS,
  AD_STUDIO_DEFAULT_DAILY_VIDEO_SECONDS,
  AD_STUDIO_DEFAULT_DAILY_IMAGES,
  assertAdStudioQuota,
  createAdStudioBrief,
  createOrganizationWithOwner,
  createProject,
  deleteAdStudioBrief,
  ensureUserForFirebaseSession,
  getAdStudioBrief,
  getAdStudioSettings,
  getAdStudioUsageToday,
  listAdStudioBriefs,
  listAdStudioUsage,
  listAuditLogEntriesForOrg,
  recordAdStudioUsage,
  saveAdStudioScript,
  setAdStudioSettings,
  updateAdStudioBriefDetails,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

beforeAll(async () => {
  await connectToFirestoreEmulator('ad-studio-tests');
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

async function setup() {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('uid'), email: `${unique('owner')}@example.com` });
  const { organization } = await createOrganizationWithOwner({ name: 'Ad Studio Org', ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  return { owner, orgId: organization.id, projectId: project.id };
}

const INPUT: AdStudioBriefInput = {
  name: '  Sign in 30 seconds ',
  objective: 'Trial signups from small law firms',
  productDescription: 'E-signatures for lawyers',
  landingPageUrl: 'https://example.com/lawyers',
  format: 'vertical',
  language: 'HE',
  targetSeconds: 30,
};

const scene = (id: string, durationSeconds: number): AdStudioScene => ({ id, durationSeconds, visualPrompt: `Shot ${id}`, voiceover: '', onScreenText: '' });

describe('Ad Studio briefs', () => {
  it('creates a normalized draft, lists newest first, and updates the details', async () => {
    const { owner, orgId, projectId } = await setup();
    const first = await createAdStudioBrief({ organizationId: orgId, projectId, input: INPUT, createdByUserId: owner.id, now: new Date('2026-09-27T10:00:00Z') });
    expect(first).toMatchObject({ name: 'Sign in 30 seconds', language: 'he', video_format: 'vertical', status: 'draft', scenes: [], target_seconds: 30 });
    const second = await createAdStudioBrief({ organizationId: orgId, projectId, input: { ...INPUT, name: 'Second' }, createdByUserId: owner.id, now: new Date('2026-09-27T11:00:00Z') });
    expect((await listAdStudioBriefs(orgId, projectId)).map((brief) => brief.id)).toEqual([second.id, first.id]);

    const updated = await updateAdStudioBriefDetails({ organizationId: orgId, projectId, briefId: first.id, input: { ...INPUT, format: 'horizontal', targetSeconds: 60 } });
    expect(updated).toMatchObject({ video_format: 'horizontal', target_seconds: 60 });
  });

  it('rejects an invalid brief with every reason', async () => {
    const { owner, orgId, projectId } = await setup();
    const error = await createAdStudioBrief({
      organizationId: orgId,
      projectId,
      input: { ...INPUT, name: ' ', landingPageUrl: 'javascript:alert(1)', format: 'square' as never, language: 'hebrew language', targetSeconds: 61 },
      createdByUserId: owner.id,
    }).catch((caught) => caught);
    expect(error).toBeInstanceOf(AdStudioBriefInvalidError);
    expect((error as AdStudioBriefInvalidError).reasons).toHaveLength(5);
  });

  it('saves a legal script, marks AI authorship, clears it on a human save, and refuses a script over 60 seconds', async () => {
    const { owner, orgId, projectId } = await setup();
    const brief = await createAdStudioBrief({ organizationId: orgId, projectId, input: INPUT, createdByUserId: owner.id });
    const generatedBy = { provider: 'gemini' as const, model: 'gemini-3.8-flash', generated_at: '2026-09-27T12:00:00.000Z' };
    const saved = await saveAdStudioScript({ organizationId: orgId, projectId, briefId: brief.id, scenes: [scene('a', 5), scene('b', 10)], generatedBy });
    expect(saved).toMatchObject({ status: 'scripted', script_generated_by: generatedBy });
    const edited = await saveAdStudioScript({ organizationId: orgId, projectId, briefId: brief.id, scenes: [scene('a', 6), scene('b', 10)] });
    expect(edited.script_generated_by).toBeNull();

    const tooLong = await saveAdStudioScript({ organizationId: orgId, projectId, briefId: brief.id, scenes: Array.from({ length: 7 }, (_, index) => scene(`x${index}`, 10)) }).catch((caught) => caught);
    expect(tooLong).toBeInstanceOf(AdStudioScriptInvalidError);
    expect((tooLong as AdStudioScriptInvalidError).issues).toContainEqual({ code: 'total_too_long' });
    expect((await getAdStudioBrief(orgId, projectId, brief.id)).scenes.map((s) => s.durationSeconds)).toEqual([6, 10]);
  });

  it('stores a scene pronunciation, drops it once the narration changes under it, and stores no empty one', async () => {
    const { owner, orgId, projectId } = await setup();
    const brief = await createAdStudioBrief({ organizationId: orgId, projectId, input: INPUT, createdByUserId: owner.id });
    // Hebrew as escapes (no Hebrew in code files): a word, and the same word with nikud.
    const plain = '\u05e9\u05dc\u05d5\u05dd';
    const vocalized = '\u05e9\u05c1\u05b8\u05dc\u05d5\u05b9\u05dd';
    const spoken = (id: string, voiceover: string, pronunciation?: string): AdStudioScene => ({ ...scene(id, 5), voiceover, ...(pronunciation === undefined ? {} : { pronunciation }) });
    await saveAdStudioScript({ organizationId: orgId, projectId, briefId: brief.id, scenes: [spoken('a', plain, vocalized), spoken('b', plain, ''), spoken('c', plain, vocalized)] });
    let stored = (await getAdStudioBrief(orgId, projectId, brief.id)).scenes;
    expect(stored.map((s) => s.pronunciation)).toEqual([vocalized, undefined, vocalized]);
    expect('pronunciation' in stored[1]).toBe(false);

    // Scene a's narration changed but its pronunciation came back as it was; scene c is untouched.
    await saveAdStudioScript({ organizationId: orgId, projectId, briefId: brief.id, scenes: [spoken('a', `${plain} ${plain}`, vocalized), spoken('b', plain), spoken('c', plain, vocalized)] });
    stored = (await getAdStudioBrief(orgId, projectId, brief.id)).scenes;
    expect(stored.map((s) => s.pronunciation)).toEqual([undefined, undefined, vocalized]);
  });

  it('deletes a brief with an audit entry, and a missing brief reads as not found', async () => {
    const { owner, orgId, projectId } = await setup();
    const brief = await createAdStudioBrief({ organizationId: orgId, projectId, input: INPUT, createdByUserId: owner.id });
    await deleteAdStudioBrief({ organizationId: orgId, projectId, briefId: brief.id, actorId: owner.id });
    await expect(getAdStudioBrief(orgId, projectId, brief.id)).rejects.toBeInstanceOf(AdStudioBriefNotFoundError);
    const entries = await listAuditLogEntriesForOrg(orgId);
    expect(entries.some((entry) => entry.action === 'ad_studio.brief_deleted' && entry.target_id === brief.id)).toBe(true);
  });
});

describe('Ad Studio limits and usage', () => {
  it('starts on the defaults, saves new limits with an audit entry, and bounds them', async () => {
    const { owner, orgId, projectId } = await setup();
    expect(await getAdStudioSettings(orgId, projectId)).toEqual({
      dailyTextGenerations: AD_STUDIO_DEFAULT_DAILY_TEXT_GENERATIONS,
      dailyVideoSeconds: AD_STUDIO_DEFAULT_DAILY_VIDEO_SECONDS,
      dailyImages: AD_STUDIO_DEFAULT_DAILY_IMAGES,
      videoQa: { enabled: true, retries: 1 },
      customized: false,
      lastChangedOn: null,
    });
    const set = await setAdStudioSettings({ organizationId: orgId, projectId, dailyTextGenerations: 2, dailyVideoSeconds: 20, actorId: owner.id });
    expect(set).toMatchObject({ dailyTextGenerations: 2, dailyVideoSeconds: 20, customized: true });
    const entries = await listAuditLogEntriesForOrg(orgId);
    expect(entries.find((entry) => entry.action === 'ad_studio.limits_changed')).toMatchObject({ after: { daily_text_generations: 2, daily_video_seconds: 20 } });
    await expect(setAdStudioSettings({ organizationId: orgId, projectId, dailyTextGenerations: -1, dailyVideoSeconds: 999999, actorId: owner.id })).rejects.toBeInstanceOf(AdStudioBriefInvalidError);
  });

  it('counts today per UTC day, text and video apart, failures included, and refuses a call that would pass the limit', async () => {
    const { owner, orgId, projectId } = await setup();
    await setAdStudioSettings({ organizationId: orgId, projectId, dailyTextGenerations: 2, dailyVideoSeconds: 20, actorId: owner.id });
    const today = new Date('2026-09-27T09:00:00Z');
    const base = { organizationId: orgId, projectId, provider: 'gemini', model: 'm', actorId: owner.id, now: today };
    await recordAdStudioUsage({ ...base, kind: 'script', units: 1, outcome: 'succeeded' });
    await recordAdStudioUsage({ ...base, kind: 'scene_rewrite', units: 1, outcome: 'failed', failureReason: 'provider_billing' });
    await recordAdStudioUsage({ ...base, kind: 'video_scene', units: 8, outcome: 'succeeded' });
    await recordAdStudioUsage({ ...base, kind: 'script', units: 1, outcome: 'succeeded', now: new Date('2026-09-26T23:59:00Z') });

    expect(await getAdStudioUsageToday(orgId, projectId, today)).toEqual({ day: '2026-09-27', textGenerations: 2, videoSeconds: 8, images: 0 });
    await expect(assertAdStudioQuota({ organizationId: orgId, projectId, kind: 'plan', units: 1, now: today })).rejects.toMatchObject({ limitKind: 'text', used: 2, limit: 2 });
    await expect(assertAdStudioQuota({ organizationId: orgId, projectId, kind: 'video_scene', units: 12, now: today })).resolves.toBeUndefined();
    const refused = await assertAdStudioQuota({ organizationId: orgId, projectId, kind: 'video_edit', units: 13, now: today }).catch((caught) => caught);
    expect(refused).toBeInstanceOf(AdStudioQuotaExceededError);
    expect((await listAdStudioUsage(orgId, projectId)).map((row) => row.kind)[0]).toBeDefined();
  });
});
