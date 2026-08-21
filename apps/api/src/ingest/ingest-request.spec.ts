import { BadRequestException } from '@nestjs/common';
import {
  parseEntitiesRequestBody,
  parseEventsRequestBody,
  parseMeasuresRequestBody,
} from './ingest-request';

describe('parseEventsRequestBody', () => {
  it('parses a batch array into an event-kind input, passing records through unchanged', () => {
    const batch = [{ event_id: 'evt_1' }, { event_id: 'evt_2' }];
    const parsed = parseEventsRequestBody({ batch });
    expect(parsed).toEqual({ kind: 'event', records: batch });
  });

  it('accepts an empty batch array', () => {
    expect(parseEventsRequestBody({ batch: [] })).toEqual({ kind: 'event', records: [] });
  });

  it('rejects a non-object body', () => {
    expect(() => parseEventsRequestBody('not an object')).toThrow(BadRequestException);
    expect(() => parseEventsRequestBody(null)).toThrow(BadRequestException);
    expect(() => parseEventsRequestBody(undefined)).toThrow(BadRequestException);
    expect(() => parseEventsRequestBody(['array'])).toThrow(BadRequestException);
  });

  it('rejects a missing "batch"', () => {
    expect(() => parseEventsRequestBody({})).toThrow(BadRequestException);
  });

  it('rejects a non-array "batch"', () => {
    expect(() => parseEventsRequestBody({ batch: 'not-an-array' })).toThrow(BadRequestException);
    expect(() => parseEventsRequestBody({ batch: { event_id: 'evt_1' } })).toThrow(BadRequestException);
  });
});

describe('parseEntitiesRequestBody', () => {
  it('parses a type + records array into an entity-kind input', () => {
    const records = [{ customer_id: 'cus_1' }];
    const parsed = parseEntitiesRequestBody({ type: 'customer', records });
    expect(parsed).toEqual({ kind: 'entity', type: 'customer', records });
  });

  it('accepts an empty records array', () => {
    expect(parseEntitiesRequestBody({ type: 'customer', records: [] })).toEqual({
      kind: 'entity',
      type: 'customer',
      records: [],
    });
  });

  it('rejects a non-object body', () => {
    expect(() => parseEntitiesRequestBody('not an object')).toThrow(BadRequestException);
    expect(() => parseEntitiesRequestBody(null)).toThrow(BadRequestException);
    expect(() => parseEntitiesRequestBody(['array'])).toThrow(BadRequestException);
  });

  it('rejects a missing "type"', () => {
    expect(() => parseEntitiesRequestBody({ records: [] })).toThrow(BadRequestException);
  });

  it('rejects a non-string "type"', () => {
    expect(() => parseEntitiesRequestBody({ type: 123, records: [] })).toThrow(BadRequestException);
  });

  it('rejects an empty or whitespace-only "type"', () => {
    expect(() => parseEntitiesRequestBody({ type: '', records: [] })).toThrow(BadRequestException);
    expect(() => parseEntitiesRequestBody({ type: '   ', records: [] })).toThrow(BadRequestException);
  });

  it('rejects a missing or non-array "records" once "type" is valid', () => {
    expect(() => parseEntitiesRequestBody({ type: 'customer' })).toThrow(BadRequestException);
    expect(() => parseEntitiesRequestBody({ type: 'customer', records: 'not-an-array' })).toThrow(
      BadRequestException,
    );
  });

  it('reports the "type" error before the "records" error when both are invalid', () => {
    expect(() => parseEntitiesRequestBody({ records: 'not-an-array' })).toThrow(
      'Request body must include a non-empty "type".',
    );
  });
});

describe('parseMeasuresRequestBody', () => {
  it('parses a records array into a measure-kind input', () => {
    const records = [{ measure: 'mrr', value: 100 }];
    const parsed = parseMeasuresRequestBody({ records });
    expect(parsed).toEqual({ kind: 'measure', records });
  });

  it('accepts an empty records array', () => {
    expect(parseMeasuresRequestBody({ records: [] })).toEqual({ kind: 'measure', records: [] });
  });

  it('rejects a non-object body', () => {
    expect(() => parseMeasuresRequestBody('not an object')).toThrow(BadRequestException);
    expect(() => parseMeasuresRequestBody(null)).toThrow(BadRequestException);
    expect(() => parseMeasuresRequestBody(['array'])).toThrow(BadRequestException);
  });

  it('rejects a missing "records"', () => {
    expect(() => parseMeasuresRequestBody({})).toThrow(BadRequestException);
  });

  it('rejects a non-array "records"', () => {
    expect(() => parseMeasuresRequestBody({ records: 'not-an-array' })).toThrow(BadRequestException);
    expect(() => parseMeasuresRequestBody({ records: { measure: 'mrr' } })).toThrow(BadRequestException);
  });
});
