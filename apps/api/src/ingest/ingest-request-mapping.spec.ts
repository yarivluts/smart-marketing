import { BadRequestException } from '@nestjs/common';
import { parseEntitiesBody, parseEventsBody, parseMeasuresBody } from './ingest-request-mapping';

describe('parseEventsBody', () => {
  it('maps event_id/event/properties into a generic ingest record, keeping the full record as raw', () => {
    const rawRecord = {
      event_id: 'ord_1-evt',
      event: 'order_completed',
      ts: '2026-07-03T10:15:00Z',
      identities: { user_id: 'u_123' },
      context: { utm: { source: 'google' } },
      properties: { order_id: 'ord_1', net: 349 },
    };
    const records = parseEventsBody({ batch: [rawRecord] });

    expect(records).toEqual([
      {
        clientRecordId: 'ord_1-evt',
        name: 'order_completed',
        data: { order_id: 'ord_1', net: 349 },
        raw: rawRecord,
      },
    ]);
  });

  it('defaults properties to an empty object when absent, but still keeps ts/identities/context in raw', () => {
    const records = parseEventsBody({ batch: [{ event_id: 'e1', event: 'signup', ts: '2026-07-03T00:00:00Z' }] });
    expect(records[0].data).toEqual({});
    expect(records[0].raw).toEqual({ event_id: 'e1', event: 'signup', ts: '2026-07-03T00:00:00Z' });
  });

  it('rejects a body without a batch array', () => {
    expect(() => parseEventsBody({})).toThrow(BadRequestException);
    expect(() => parseEventsBody({ batch: 'not-an-array' })).toThrow(BadRequestException);
  });

  it('rejects a record missing event_id or event', () => {
    expect(() => parseEventsBody({ batch: [{ event: 'signup' }] })).toThrow(BadRequestException);
    expect(() => parseEventsBody({ batch: [{ event_id: 'e1' }] })).toThrow(BadRequestException);
  });

  it('rejects a batch entry that is not an object (null, array, primitive)', () => {
    expect(() => parseEventsBody({ batch: [null] })).toThrow(BadRequestException);
    expect(() => parseEventsBody({ batch: [['nope']] })).toThrow(BadRequestException);
    expect(() => parseEventsBody({ batch: ['nope'] })).toThrow(BadRequestException);
  });

  it('rejects a batch larger than the max batch size', () => {
    const batch = Array.from({ length: 1001 }, (_, i) => ({ event_id: `e${i}`, event: 'signup' }));
    expect(() => parseEventsBody({ batch })).toThrow(BadRequestException);
  });
});

describe('parseEntitiesBody', () => {
  it('maps the batch-level type onto every record, with per-record id/attributes, keeping raw complete', () => {
    const records = parseEntitiesBody({
      type: 'product',
      records: [{ id: 'sku_1', attributes: { name: 'Widget' } }],
    });
    expect(records).toEqual([
      {
        clientRecordId: 'sku_1',
        name: 'product',
        data: { name: 'Widget' },
        raw: { id: 'sku_1', attributes: { name: 'Widget' }, type: 'product' },
      },
    ]);
  });

  it('rejects a body without a type', () => {
    expect(() => parseEntitiesBody({ records: [{ id: 'sku_1' }] })).toThrow(BadRequestException);
  });

  it('rejects a record missing id', () => {
    expect(() => parseEntitiesBody({ type: 'product', records: [{ attributes: {} }] })).toThrow(BadRequestException);
  });
});

describe('parseMeasuresBody', () => {
  it('derives the same idempotency key for the same measure/ts/dimensions tuple, and keeps value/currency in raw', () => {
    const record = {
      measure: 'ad_spend',
      ts: '2026-07-02',
      dimensions: { channel: 'meta', campaign_id: 'c_9' },
      value: 1250.5,
      currency: 'USD',
    };
    const [first] = parseMeasuresBody({ records: [record] });
    const [second] = parseMeasuresBody({ records: [{ ...record }] });
    expect(first.clientRecordId).toBe(second.clientRecordId);
    expect(first.name).toBe('ad_spend');
    expect(first.data).toEqual({ channel: 'meta', campaign_id: 'c_9' });
    expect(first.raw).toEqual(record);
  });

  it('derives a different key when dimensions differ, regardless of key order', () => {
    const [a] = parseMeasuresBody({
      records: [{ measure: 'ad_spend', ts: '2026-07-02', dimensions: { channel: 'meta', campaign_id: 'c_9' } }],
    });
    const [b] = parseMeasuresBody({
      records: [{ measure: 'ad_spend', ts: '2026-07-02', dimensions: { campaign_id: 'c_9', channel: 'google' } }],
    });
    expect(a.clientRecordId).not.toBe(b.clientRecordId);
  });

  it('rejects a record missing measure or ts', () => {
    expect(() => parseMeasuresBody({ records: [{ ts: '2026-07-02' }] })).toThrow(BadRequestException);
    expect(() => parseMeasuresBody({ records: [{ measure: 'ad_spend' }] })).toThrow(BadRequestException);
  });

  it('rejects a maliciously deep dimensions object with a clean 400, instead of an uncaught crash', () => {
    let deeplyNested: Record<string, unknown> = { leaf: true };
    for (let i = 0; i < 5000; i += 1) {
      deeplyNested = { nested: deeplyNested };
    }
    expect(() =>
      parseMeasuresBody({ records: [{ measure: 'ad_spend', ts: '2026-07-02', dimensions: deeplyNested }] }),
    ).toThrow(BadRequestException);
  });
});
