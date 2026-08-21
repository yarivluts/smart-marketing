import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { parseSchemaDefRequestBody, parseSchemaFieldsBody } from './parse-schema-fields';

function request(body?: unknown): NextRequest {
  return new NextRequest('https://growthos.test/x', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const validField = { name: 'user_id', type: 'string', isRequired: true, isPii: false, isIdentityKey: true };

describe('parseSchemaFieldsBody', () => {
  it('accepts a well-formed fields array, carrying every field through as-is', () => {
    const parsed = parseSchemaFieldsBody([validField]);
    expect(parsed.error).toBeUndefined();
    expect(parsed.fields).toEqual([validField]);
  });

  it('defaults isRequired/isPii/isIdentityKey to false when omitted', () => {
    const parsed = parseSchemaFieldsBody([{ name: 'email', type: 'string' }]);
    expect(parsed.error).toBeUndefined();
    expect(parsed.fields).toEqual([{ name: 'email', type: 'string', isRequired: false, isPii: false, isIdentityKey: false }]);
  });

  it('coerces truthy non-boolean values for isRequired/isPii/isIdentityKey to true', () => {
    const parsed = parseSchemaFieldsBody([{ name: 'email', type: 'string', isRequired: 1, isPii: 'yes', isIdentityKey: {} }]);
    expect(parsed.error).toBeUndefined();
    expect(parsed.fields).toEqual([{ name: 'email', type: 'string', isRequired: true, isPii: true, isIdentityKey: true }]);
  });

  it('rejects a non-array value', () => {
    expect(parseSchemaFieldsBody(undefined).error?.status).toBe(400);
    expect(parseSchemaFieldsBody({}).error?.status).toBe(400);
    expect(parseSchemaFieldsBody('nope').error?.status).toBe(400);
  });

  it('rejects an empty array', () => {
    expect(parseSchemaFieldsBody([]).error?.status).toBe(400);
  });

  it('rejects an entry that is not an object', () => {
    expect(parseSchemaFieldsBody(['not-a-field']).error?.status).toBe(400);
    expect(parseSchemaFieldsBody([null]).error?.status).toBe(400);
    expect(parseSchemaFieldsBody([42]).error?.status).toBe(400);
  });

  it('rejects an entry missing name or type', () => {
    expect(parseSchemaFieldsBody([{ type: 'string' }]).error?.status).toBe(400);
    expect(parseSchemaFieldsBody([{ name: 'user_id' }]).error?.status).toBe(400);
  });

  it('rejects an entry whose name or type is not a string', () => {
    expect(parseSchemaFieldsBody([{ name: 123, type: 'string' }]).error?.status).toBe(400);
    expect(parseSchemaFieldsBody([{ name: 'user_id', type: 456 }]).error?.status).toBe(400);
  });

  it('rejects the whole array if any single entry is invalid, even after valid entries', () => {
    const parsed = parseSchemaFieldsBody([validField, { name: 'bad' }]);
    expect(parsed.error?.status).toBe(400);
    expect(parsed.fields).toBeUndefined();
  });
});

describe('parseSchemaDefRequestBody', () => {
  const validBody = { kind: 'event', name: 'signup', fields: [validField] };

  it('accepts a well-formed request, trimming the name', async () => {
    const parsed = await parseSchemaDefRequestBody(request({ ...validBody, name: '  signup  ' }));
    expect(parsed.error).toBeUndefined();
    expect(parsed).toEqual(validBody);
  });

  it('accepts every valid kind', async () => {
    for (const kind of ['entity', 'event', 'measure']) {
      const parsed = await parseSchemaDefRequestBody(request({ ...validBody, kind }));
      expect(parsed.error).toBeUndefined();
      expect(parsed.kind).toBe(kind);
    }
  });

  it('rejects invalid JSON', async () => {
    const badRequest = new NextRequest('https://growthos.test/x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{not json' });
    expect((await parseSchemaDefRequestBody(badRequest)).error?.status).toBe(400);
  });

  it('rejects a missing or non-string kind', async () => {
    expect((await parseSchemaDefRequestBody(request({ ...validBody, kind: undefined }))).error?.status).toBe(400);
    expect((await parseSchemaDefRequestBody(request({ ...validBody, kind: 123 }))).error?.status).toBe(400);
  });

  it('rejects a kind that is not one of entity/event/measure', async () => {
    expect((await parseSchemaDefRequestBody(request({ ...validBody, kind: 'entities' }))).error?.status).toBe(400);
  });

  it('rejects a missing, non-string, or blank name', async () => {
    expect((await parseSchemaDefRequestBody(request({ ...validBody, name: undefined }))).error?.status).toBe(400);
    expect((await parseSchemaDefRequestBody(request({ ...validBody, name: 123 }))).error?.status).toBe(400);
    expect((await parseSchemaDefRequestBody(request({ ...validBody, name: '   ' }))).error?.status).toBe(400);
  });

  it('propagates a fields-shape error from parseSchemaFieldsBody', async () => {
    expect((await parseSchemaDefRequestBody(request({ ...validBody, fields: [] }))).error?.status).toBe(400);
    expect((await parseSchemaDefRequestBody(request({ ...validBody, fields: [{ name: 'x' }] }))).error?.status).toBe(400);
  });
});
