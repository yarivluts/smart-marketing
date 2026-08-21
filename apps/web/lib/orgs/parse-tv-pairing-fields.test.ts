import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { parseClaimTvPairingRequestBody } from './parse-tv-pairing-fields';

function request(body?: unknown): NextRequest {
  return new NextRequest('https://growthos.test/x', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const validBody = {
  code: 'ABCD-1234',
  boardIds: ['board-1', 'board-2'],
  rotationSeconds: 30,
  reducedMotion: false,
  label: 'Lobby TV',
};

describe('parseClaimTvPairingRequestBody', () => {
  it('accepts a well-formed request', async () => {
    const parsed = await parseClaimTvPairingRequestBody(request(validBody));
    expect(parsed).toEqual(validBody);
  });

  it('rejects invalid JSON', async () => {
    const badRequest = new NextRequest('https://growthos.test/x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{not json' });
    expect((await parseClaimTvPairingRequestBody(badRequest)).error?.status).toBe(400);
  });

  it('rejects a missing or blank code', async () => {
    expect((await parseClaimTvPairingRequestBody(request({ ...validBody, code: undefined }))).error?.status).toBe(400);
    expect((await parseClaimTvPairingRequestBody(request({ ...validBody, code: '   ' }))).error?.status).toBe(400);
  });

  it('rejects a missing, empty, or non-string-array boardIds', async () => {
    expect((await parseClaimTvPairingRequestBody(request({ ...validBody, boardIds: undefined }))).error?.status).toBe(400);
    expect((await parseClaimTvPairingRequestBody(request({ ...validBody, boardIds: [] }))).error?.status).toBe(400);
    expect((await parseClaimTvPairingRequestBody(request({ ...validBody, boardIds: ['board-1', 2] }))).error?.status).toBe(400);
  });

  it('rejects a non-finite or non-numeric rotationSeconds', async () => {
    expect((await parseClaimTvPairingRequestBody(request({ ...validBody, rotationSeconds: 'thirty' }))).error?.status).toBe(400);
    expect((await parseClaimTvPairingRequestBody(request({ ...validBody, rotationSeconds: Infinity }))).error?.status).toBe(400);
  });

  it('rejects a non-boolean reducedMotion', async () => {
    expect((await parseClaimTvPairingRequestBody(request({ ...validBody, reducedMotion: 'false' }))).error?.status).toBe(400);
  });

  it('rejects a missing or blank label', async () => {
    expect((await parseClaimTvPairingRequestBody(request({ ...validBody, label: undefined }))).error?.status).toBe(400);
    expect((await parseClaimTvPairingRequestBody(request({ ...validBody, label: '   ' }))).error?.status).toBe(400);
  });
});
