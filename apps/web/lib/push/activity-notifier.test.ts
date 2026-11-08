import { beforeEach, describe, expect, it, vi } from 'vitest';

const orm = vi.hoisted(() => ({
  recipients: [] as string[],
  growthBrief: false,
  projectName: 'Website',
  briefName: 'Spring sale',
  listeners: new Map<string, (event: unknown) => Promise<void> | void>(),
}));

vi.mock('@growthos/firebase-orm-models', () => ({
  listProjectNotificationRecipients: vi.fn(async () => orm.recipients),
  isGrowthPilotBrief: vi.fn(async () => orm.growthBrief),
  ProjectModel: { init: vi.fn(async () => ({ name: orm.projectName })) },
  getAdStudioBrief: vi.fn(async () => ({ name: orm.briefName })),
  setActivityEventListener: vi.fn((name: string, listener: (event: unknown) => Promise<void> | void) => {
    orm.listeners.set(name, listener);
    return () => orm.listeners.delete(name);
  }),
}));

const deliver = vi.hoisted(() => vi.fn());
vi.mock('./sender', () => ({ deliverToUsers: deliver }));

import { notifyActivityEvent, registerPushNotifier } from './activity-notifier';

const CONFIG = { publicKey: 'pub', privateKey: 'priv', subject: 'mailto:ops@example.com' };
const GROWTH = { source: 'growth_pilot' as const, organizationId: 'o1', projectId: 'p1', actor: 'pilot' };

beforeEach(() => {
  orm.recipients = ['owner', 'editor'];
  orm.growthBrief = false;
  deliver.mockReset();
  deliver.mockResolvedValue({ status: 'sent', sent: 1, failed: 0, removed: 0, optedOut: 0 });
});

describe('notifyActivityEvent', () => {
  it('sends a pushing event to the project members in its category, worded per device', async () => {
    await notifyActivityEvent({ ...GROWTH, kind: 'ads_ready', subject: 'Signatures', count: 4 }, { config: CONFIG });
    expect(deliver).toHaveBeenCalledTimes(1);
    const [params, options] = deliver.mock.calls[0];
    expect(params).toMatchObject({ userIds: ['owner', 'editor'], category: 'ready' });
    expect(options).toMatchObject({ config: CONFIG });
    expect(await params.payloadFor('en')).toEqual({
      title: 'Ads ready',
      body: 'New ads for Signatures are ready to review in Website.',
      url: '/en/orgs/o1/projects/p1/growth-pilot',
      tag: 'growth_pilot:p1:ads_ready:Signatures',
    });
    const hebrew = await params.payloadFor('he');
    expect(hebrew.url).toBe('/he/orgs/o1/projects/p1/growth-pilot');
    expect(hebrew.title).not.toBe('Ads ready');
  });

  it('opens the target details page for an event about one target', async () => {
    await notifyActivityEvent({ ...GROWTH, kind: 'ads_ready', subject: 'Signatures', count: 4, targetId: 't9' }, { config: CONFIG });
    const [params] = deliver.mock.calls[0];
    expect((await params.payloadFor('he')).url).toBe('/he/orgs/o1/projects/p1/growth-pilot/targets/t9');
  });

  it('sends nothing for feed-only events or when push is not set up', async () => {
    expect(await notifyActivityEvent({ ...GROWTH, kind: 'site_read' }, { config: CONFIG })).toBeNull();
    expect(await notifyActivityEvent({ ...GROWTH, kind: 'ads_ready' }, { config: null })).toBeNull();
    expect(deliver).not.toHaveBeenCalled();
  });

  it('does not tell a person about their own action', async () => {
    await notifyActivityEvent({ ...GROWTH, kind: 'ads_published', actor: 'owner', subject: 'Signatures' }, { config: CONFIG });
    expect(deliver.mock.calls[0][0]).toMatchObject({ userIds: ['editor'], category: 'publishing' });
    orm.recipients = ['owner'];
    deliver.mockClear();
    expect(await notifyActivityEvent({ ...GROWTH, kind: 'ads_published', actor: 'owner' }, { config: CONFIG })).toBeNull();
    expect(deliver).not.toHaveBeenCalled();
  });

  it('opens the Ad Studio brief for a finished run, named after the brief', async () => {
    await notifyActivityEvent({ source: 'ad_studio', kind: 'run_done', organizationId: 'o1', projectId: 'p1', actor: 'someone', briefId: 'b1' }, { config: CONFIG });
    const [params] = deliver.mock.calls[0];
    expect(params.category).toBe('ready');
    const payload = await params.payloadFor('en');
    expect(payload.url).toBe('/en/orgs/o1/projects/p1/ad-studio?brief=b1');
    expect(payload.body).toContain('Spring sale');
  });

  it('leaves a Growth Pilot run to the pilot’s own update, so one change is one notification', async () => {
    orm.growthBrief = true;
    expect(await notifyActivityEvent({ source: 'ad_studio', kind: 'run_done', organizationId: 'o1', projectId: 'p1', actor: 'u', briefId: 'b1' }, { config: CONFIG })).toBeNull();
    expect(deliver).not.toHaveBeenCalled();
  });

  it('registers once, by name, as an activity listener', () => {
    registerPushNotifier();
    registerPushNotifier();
    expect([...orm.listeners.keys()]).toEqual(['web-push']);
  });
});
