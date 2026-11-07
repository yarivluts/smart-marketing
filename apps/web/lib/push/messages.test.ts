import { describe, expect, it } from 'vitest';
import { pushEventKinds, PUSH_EVENT_SOURCES } from '@growthos/shared';
import en from '@/messages/en.json';
import he from '@/messages/he.json';
import { buildEventPayload, buildTestPayload, pushEventPath, pushLocale } from './messages';

type Events = Record<string, Record<string, { title?: string; body?: string }>>;

describe('push notification wording', () => {
  it('has a title and body in English and Hebrew for every event that sends a push', () => {
    for (const messages of [en, he]) {
      const events = (messages as unknown as { PushNotifications: { events: Events } }).PushNotifications.events;
      for (const source of PUSH_EVENT_SOURCES) {
        for (const kind of pushEventKinds(source)) {
          expect(events[source]?.[kind]?.title, `${source}.${kind}.title`).toBeTruthy();
          expect(events[source]?.[kind]?.body, `${source}.${kind}.body`).toBeTruthy();
        }
      }
    }
  });

  it('words an event with its project, subject and count', async () => {
    const payload = await buildEventPayload('en', { source: 'growth_pilot', kind: 'targets_proposed', organizationId: 'o', projectId: 'p', projectName: 'Shop', subject: null, count: 3, briefId: null });
    expect(payload.title).toBe('New ideas to approve');
    expect(payload.body).toBe('Growth Pilot suggested 3 things to grow in Shop.');
  });

  it('falls back to a general update for an event without its own wording', async () => {
    const payload = await buildEventPayload('en', { source: 'growth_pilot', kind: 'something_new', organizationId: 'o', projectId: 'p', projectName: 'Shop', subject: null, count: null, briefId: null });
    expect(payload).toMatchObject({ title: 'Update in Shop', body: 'Something changed in Shop. Open it to see.' });
  });

  it('opens a same-origin page in the device language, defaulting to English', async () => {
    expect(pushLocale('he')).toBe('he');
    expect(pushLocale('fr')).toBe('en');
    expect(pushLocale(null)).toBe('en');
    expect(pushEventPath('he', { source: 'ad_studio', organizationId: 'o 1', projectId: 'p', briefId: null })).toBe('/he/orgs/o%201/projects/p/ad-studio');
    expect(pushEventPath('en', { source: 'growth_pilot', organizationId: 'o', projectId: 'p', briefId: null })).toBe('/en/orgs/o/projects/p/growth-pilot');
    expect(pushEventPath('en', { source: 'growth_pilot', organizationId: 'o', projectId: 'p', briefId: null, targetId: 't 1' })).toBe('/en/orgs/o/projects/p/growth-pilot/targets/t%201');
    const test = await buildTestPayload('he');
    expect(test.url).toBe('/he/dashboard/notifications');
    expect(test.title).toBe(he.PushNotifications.testNotification.title);
  });
});
