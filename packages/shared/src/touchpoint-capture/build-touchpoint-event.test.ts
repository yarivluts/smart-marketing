import { describe, expect, it } from 'vitest';
import { buildTouchpointEventPayload } from './build-touchpoint-event';
import { parseAcquisitionParams } from './parse-acquisition-params';
import { TOUCHPOINT_SCHEMA_FIELDS } from './touchpoint-schema';

describe('buildTouchpointEventPayload', () => {
  it('uses the anon id as the event_id and the fixed "touchpoint" event name', () => {
    const payload = buildTouchpointEventPayload({
      anonId: 'anon_abc',
      ts: '2026-07-09T09:00:00.000Z',
      params: parseAcquisitionParams({ url: 'https://example.com/?gclid=gclid_123' }),
    });
    expect(payload.event_id).toBe('anon_abc');
    expect(payload.event).toBe('touchpoint');
    expect(payload.ts).toBe('2026-07-09T09:00:00.000Z');
    expect(payload.properties.click_id).toBe('gclid_123');
    expect(payload.properties.channel).toBe('paid_search');
  });

  it('omits every field parseAcquisitionParams did not find, rather than including it as undefined', () => {
    const payload = buildTouchpointEventPayload({
      anonId: 'anon_direct',
      ts: '2026-07-09T09:00:00.000Z',
      params: parseAcquisitionParams({ url: 'https://example.com/' }),
    });
    expect(payload.properties).toEqual({ channel: 'direct', landing_page: 'https://example.com/' });
    expect('click_id' in payload.properties).toBe(false);
    expect('utm_source' in payload.properties).toBe(false);
  });

  it('only ever emits properties declared on the registerable schema', () => {
    const payload = buildTouchpointEventPayload({
      anonId: 'anon_full',
      ts: '2026-07-09T09:00:00.000Z',
      params: parseAcquisitionParams({
        url: 'https://example.com/landing?gclid=g1&utm_source=google&utm_medium=cpc&utm_campaign=spring&utm_content=banner&utm_term=shoes',
        referrer: 'https://google.com/',
      }),
    });
    const declaredFieldNames = new Set(TOUCHPOINT_SCHEMA_FIELDS.map((field) => field.name));
    for (const key of Object.keys(payload.properties)) {
      expect(declaredFieldNames.has(key)).toBe(true);
    }
  });
});
