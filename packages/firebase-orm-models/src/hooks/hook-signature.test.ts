import { describe, expect, it } from 'vitest';
import { computeHookSignature, verifyHookSignature } from './hook-signature';

const SECRET = 'a-hook-signing-secret';
const BODY = '{"id":"evt_1","type":"order.created"}';

describe('verifyHookSignature', () => {
  it('accepts a correctly signed payload', () => {
    const header = computeHookSignature(BODY, SECRET);
    expect(verifyHookSignature(BODY, header, SECRET)).toBe(true);
  });

  it('rejects a signature computed with the wrong secret', () => {
    const header = computeHookSignature(BODY, 'wrong-secret');
    expect(verifyHookSignature(BODY, header, SECRET)).toBe(false);
  });

  it('rejects a body that was tampered with after signing', () => {
    const header = computeHookSignature(BODY, SECRET);
    expect(verifyHookSignature(`${BODY} `, header, SECRET)).toBe(false);
  });

  it('rejects a header missing the sha256= prefix', () => {
    const digestOnly = computeHookSignature(BODY, SECRET).slice('sha256='.length);
    expect(verifyHookSignature(BODY, digestOnly, SECRET)).toBe(false);
  });

  it('rejects a non-hex digest without throwing', () => {
    expect(verifyHookSignature(BODY, 'sha256=not-hex-at-all!!', SECRET)).toBe(false);
  });

  it('rejects an empty digest without throwing', () => {
    expect(verifyHookSignature(BODY, 'sha256=', SECRET)).toBe(false);
  });
});
