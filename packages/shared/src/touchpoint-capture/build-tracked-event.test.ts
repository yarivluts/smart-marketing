import { describe, expect, it } from 'vitest';
import { buildTrackedEventPayload } from './build-tracked-event';

describe('buildTrackedEventPayload', () => {
  it('attaches anon_id to a custom event so it links back to its originating touchpoint', () => {
    const payload = buildTrackedEventPayload({
      eventId: 'evt_1',
      eventName: 'signup',
      ts: '2026-07-09T09:05:00.000Z',
      anonId: 'anon_abc',
      properties: { plan: 'pro' },
    });
    expect(payload.event_id).toBe('evt_1');
    expect(payload.event).toBe('signup');
    expect(payload.properties).toEqual({ plan: 'pro', anon_id: 'anon_abc' });
  });

  it('never reuses the anon id as the event_id, so repeated events of the same name never collide on ingest dedup', () => {
    const first = buildTrackedEventPayload({ eventId: 'evt_1', eventName: 'purchase', ts: 't1', anonId: 'anon_abc' });
    const second = buildTrackedEventPayload({ eventId: 'evt_2', eventName: 'purchase', ts: 't2', anonId: 'anon_abc' });
    expect(first.event_id).not.toBe(second.event_id);
  });

  it('omits anon_id entirely when the tracker has none yet', () => {
    const payload = buildTrackedEventPayload({ eventId: 'evt_1', eventName: 'viewed_pricing', ts: 't1' });
    expect('anon_id' in payload.properties).toBe(false);
  });
});
