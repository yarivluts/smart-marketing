import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { parseCreateRepCollectionEntryRequestBody, parseUpdateRepCollectionEntryRequestBody } from './parse-rep-collection-fields';

function request(body?: unknown): NextRequest {
  return new NextRequest('https://growthos.test/x', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const validBody = {
  orgPersonId: 'person-1',
  company: 'Acme Inc',
  collectionType: 'upgrade',
  planFrom: 'Starter',
  planTo: 'Pro',
  amount: 500,
  occurredAt: '2026-08-24',
  note: 'Upsell after QBR',
  sourceRawRecordId: 'raw-1',
};

describe('parseCreateRepCollectionEntryRequestBody', () => {
  it('accepts a well-formed request', async () => {
    const parsed = await parseCreateRepCollectionEntryRequestBody(request(validBody));
    expect(parsed).toEqual(validBody);
  });

  it('defaults orgPersonId to null and drops optional fields when omitted', async () => {
    const { orgPersonId: _orgPersonId, planFrom: _planFrom, planTo: _planTo, note: _note, sourceRawRecordId: _sourceRawRecordId, ...rest } = validBody;
    const parsed = await parseCreateRepCollectionEntryRequestBody(request(rest));
    expect(parsed).toEqual({ ...rest, orgPersonId: null, planFrom: undefined, planTo: undefined, note: undefined, sourceRawRecordId: undefined });
  });

  it('rejects invalid JSON', async () => {
    const badRequest = new NextRequest('https://growthos.test/x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{not json' });
    expect((await parseCreateRepCollectionEntryRequestBody(badRequest)).error?.status).toBe(400);
  });

  it('rejects a missing or blank company', async () => {
    expect((await parseCreateRepCollectionEntryRequestBody(request({ ...validBody, company: undefined }))).error?.status).toBe(400);
    expect((await parseCreateRepCollectionEntryRequestBody(request({ ...validBody, company: '  ' }))).error?.status).toBe(400);
  });

  it('rejects a missing or blank collectionType', async () => {
    expect((await parseCreateRepCollectionEntryRequestBody(request({ ...validBody, collectionType: undefined }))).error?.status).toBe(400);
  });

  it('rejects a non-numeric amount', async () => {
    expect((await parseCreateRepCollectionEntryRequestBody(request({ ...validBody, amount: 'not-a-number' }))).error?.status).toBe(400);
    expect((await parseCreateRepCollectionEntryRequestBody(request({ ...validBody, amount: Number.NaN }))).error?.status).toBe(400);
  });

  it('rejects a missing or blank occurredAt', async () => {
    expect((await parseCreateRepCollectionEntryRequestBody(request({ ...validBody, occurredAt: undefined }))).error?.status).toBe(400);
    expect((await parseCreateRepCollectionEntryRequestBody(request({ ...validBody, occurredAt: '  ' }))).error?.status).toBe(400);
  });

  it('rejects a blank orgPersonId (whitespace-only)', async () => {
    expect((await parseCreateRepCollectionEntryRequestBody(request({ ...validBody, orgPersonId: '  ' }))).error?.status).toBe(400);
  });

  it('trims a padded orgPersonId and collectionType rather than passing them through verbatim', async () => {
    const parsed = await parseCreateRepCollectionEntryRequestBody(request({ ...validBody, orgPersonId: '  person-1  ', collectionType: '  upgrade  ' }));
    expect(parsed.error).toBeUndefined();
    expect((parsed as { orgPersonId: string | null }).orgPersonId).toBe('person-1');
    expect((parsed as { collectionType: string }).collectionType).toBe('upgrade');
  });

  it('accepts an explicit orgPersonId: null', async () => {
    const parsed = await parseCreateRepCollectionEntryRequestBody(request({ ...validBody, orgPersonId: null }));
    expect(parsed.error).toBeUndefined();
    expect((parsed as { orgPersonId: string | null }).orgPersonId).toBeNull();
  });
});

describe('parseUpdateRepCollectionEntryRequestBody', () => {
  it('accepts orgPersonId alone', async () => {
    const parsed = await parseUpdateRepCollectionEntryRequestBody(request({ orgPersonId: 'person-2' }));
    expect(parsed).toEqual({ orgPersonId: 'person-2' });
  });

  it('accepts orgPersonId: null (unassign)', async () => {
    const parsed = await parseUpdateRepCollectionEntryRequestBody(request({ orgPersonId: null }));
    expect(parsed).toEqual({ orgPersonId: null });
  });

  it('trims a padded orgPersonId', async () => {
    const parsed = await parseUpdateRepCollectionEntryRequestBody(request({ orgPersonId: '  person-2  ' }));
    expect(parsed).toEqual({ orgPersonId: 'person-2' });
  });

  it('accepts amount alone', async () => {
    const parsed = await parseUpdateRepCollectionEntryRequestBody(request({ amount: 700 }));
    expect(parsed).toEqual({ amount: 700 });
  });

  it('accepts both fields together', async () => {
    const parsed = await parseUpdateRepCollectionEntryRequestBody(request({ orgPersonId: 'person-2', amount: 700 }));
    expect(parsed).toEqual({ orgPersonId: 'person-2', amount: 700 });
  });

  it('rejects a body with neither field', async () => {
    expect((await parseUpdateRepCollectionEntryRequestBody(request({}))).error?.status).toBe(400);
  });

  it('rejects a blank orgPersonId (whitespace-only, not null)', async () => {
    expect((await parseUpdateRepCollectionEntryRequestBody(request({ orgPersonId: '   ' }))).error?.status).toBe(400);
  });

  it('rejects a non-numeric amount', async () => {
    expect((await parseUpdateRepCollectionEntryRequestBody(request({ amount: 'lots' }))).error?.status).toBe(400);
  });
});
