import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { parseCreateFieldMappingRequestBody, parseFieldMappingRulesBody } from './parse-field-mapping-rules';

function request(body?: unknown): NextRequest {
  return new NextRequest('https://growthos.test/x', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const renameRule = { targetField: 'user_id', transform: 'rename', sourcePath: '$.uid' };
const validCreateBody = {
  environmentId: 'env-1',
  name: 'Signup mapping',
  kind: 'events',
  schemaName: 'signup',
  rules: [renameRule],
};

describe('parseFieldMappingRulesBody', () => {
  it('accepts a well-formed rules array, defaulting optional fields to undefined', () => {
    const parsed = parseFieldMappingRulesBody([renameRule]);
    expect(parsed.error).toBeUndefined();
    expect(parsed.rules).toEqual([{ targetField: 'user_id', transform: 'rename', sourcePath: '$.uid', castType: undefined, template: undefined, staticValue: undefined }]);
  });

  it('accepts a rule carrying every optional field', () => {
    const rule = { targetField: 'plan', transform: 'template', sourcePath: '$.plan', castType: 'string', template: '{{plan}}', staticValue: 'n/a' };
    const parsed = parseFieldMappingRulesBody([rule]);
    expect(parsed.rules).toEqual([rule]);
  });

  it('rejects a non-array or empty value', () => {
    expect(parseFieldMappingRulesBody(undefined).error?.status).toBe(400);
    expect(parseFieldMappingRulesBody({}).error?.status).toBe(400);
    expect(parseFieldMappingRulesBody([]).error?.status).toBe(400);
  });

  it('rejects a rule missing targetField or transform', () => {
    expect(parseFieldMappingRulesBody([{ transform: 'rename' }]).error?.status).toBe(400);
    expect(parseFieldMappingRulesBody([{ targetField: 'user_id' }]).error?.status).toBe(400);
  });

  it('rejects a rule that is not an object', () => {
    expect(parseFieldMappingRulesBody(['not-a-rule']).error?.status).toBe(400);
  });
});

describe('parseCreateFieldMappingRequestBody', () => {
  it('accepts a well-formed request, omitting hookEndpointId when not sent', async () => {
    const parsed = await parseCreateFieldMappingRequestBody(request(validCreateBody));
    expect(parsed.error).toBeUndefined();
    expect(parsed).toEqual({
      environmentId: 'env-1',
      hookEndpointId: undefined,
      name: 'Signup mapping',
      kind: 'events',
      schemaName: 'signup',
      rules: [{ ...renameRule, castType: undefined, template: undefined, staticValue: undefined }],
    });
  });

  it('accepts a blank hookEndpointId as undefined but keeps a real one', async () => {
    const blank = await parseCreateFieldMappingRequestBody(request({ ...validCreateBody, hookEndpointId: '   ' }));
    expect(blank.error).toBeUndefined();
    expect((blank as { hookEndpointId?: string }).hookEndpointId).toBeUndefined();

    const real = await parseCreateFieldMappingRequestBody(request({ ...validCreateBody, hookEndpointId: 'hook-1' }));
    expect(real.error).toBeUndefined();
    expect((real as { hookEndpointId?: string }).hookEndpointId).toBe('hook-1');
  });

  it('rejects invalid JSON', async () => {
    const badRequest = new NextRequest('https://growthos.test/x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{not json' });
    expect((await parseCreateFieldMappingRequestBody(badRequest)).error?.status).toBe(400);
  });

  it('rejects a missing or blank environmentId/name/kind/schemaName', async () => {
    expect((await parseCreateFieldMappingRequestBody(request({ ...validCreateBody, environmentId: undefined }))).error?.status).toBe(400);
    expect((await parseCreateFieldMappingRequestBody(request({ ...validCreateBody, name: '  ' }))).error?.status).toBe(400);
    expect((await parseCreateFieldMappingRequestBody(request({ ...validCreateBody, kind: undefined }))).error?.status).toBe(400);
    expect((await parseCreateFieldMappingRequestBody(request({ ...validCreateBody, schemaName: '  ' }))).error?.status).toBe(400);
  });

  it('propagates a rules-shape error from parseFieldMappingRulesBody', async () => {
    expect((await parseCreateFieldMappingRequestBody(request({ ...validCreateBody, rules: [] }))).error?.status).toBe(400);
    expect((await parseCreateFieldMappingRequestBody(request({ ...validCreateBody, rules: [{ targetField: 'x' }] }))).error?.status).toBe(400);
  });
});
