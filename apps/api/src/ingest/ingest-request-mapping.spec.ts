import { BadRequestException } from '@nestjs/common';
import { parseEntitiesBody, parseEventsBody, parseMeasuresBody } from './ingest-request-mapping';

describe('parseEventsBody', () => {
  it('maps event_id/event/properties into a generic ingest record', () => {
    const records = parseEventsBody({
      batch: [
        {
          event_id: 'ord_1-evt',
          event: 'order_completed',
          ts: '2026-07-03T10:15:00Z',
          properties: { order_id: 'ord_1', net: 349 },
        },
      ],
    });

    expect(records).toEqual([
      { clientRecordId: 'ord_1-evt', name: 'order_completed', data: { order_id: 'ord_1', net: 349 } },
    ]);
  });

  it('defaults properties to an empty object when absent', () => {
    const records = parseEventsBody({ batch: [{ event_id: 'e1', event: 'signup' }] });
    expect(records[0].data).toEqual({});
  });

  it('rejects a body without a batch array', () => {
    expect(() => parseEventsBody({})).toThrow(BadRequestException);
    expect(() => parseEventsBody({ batch: 'not-an-array' })).toThrow(BadRequestException);
  });

  it('rejects a record missing event_id or event', () => {
    expect(() => parseEventsBody({ batch: [{ event: 'signup' }] })).toThrow(BadRequestException);
    expect(() => parseEventsBody({ batch: [{ event_id: 'e1' }] })).toThrow(BadRequestException);
  });
});

describe('parseEntitiesBody', () => {
  it('maps the batch-level type onto every record, with per-record id/attributes', () => {
    const records = parseEntitiesBody({
      type: 'product',
      records: [{ id: 'sku_1', attributes: { name: 'Widget' } }],
    });
    expect(records).toEqual([{ clientRecordId: 'sku_1', name: 'product', data: { name: 'Widget' } }]);
  });

  it('rejects a body without a type', () => {
    expect(() => parseEntitiesBody({ records: [{ id: 'sku_1' }] })).toThrow(BadRequestException);
  });

  it('rejects a record missing id', () => {
    expect(() => parseEntitiesBody({ type: 'product', records: [{ attributes: {} }] })).toThrow(BadRequestException);
  });
});

describe('parseMeasuresBody', () => {
  it('derives the same idempotency key for the same measure/ts/dimensions tuple', () => {
    const record = { measure: 'ad_spend', ts: '2026-07-02', dimensions: { channel: 'meta', campaign_id: 'c_9' }, value: 1250.5 };
    const [first] = parseMeasuresBody({ records: [record] });
    const [second] = parseMeasuresBody({ records: [{ ...record }] });
    expect(first.clientRecordId).toBe(second.clientRecordId);
    expect(first.name).toBe('ad_spend');
    expect(first.data).toEqual({ channel: 'meta', campaign_id: 'c_9' });
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
});
