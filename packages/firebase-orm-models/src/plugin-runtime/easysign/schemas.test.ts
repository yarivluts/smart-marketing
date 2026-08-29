import { describe, expect, it } from 'vitest';
import {
  EASYSIGN_DOCUMENT_CREATED_EVENT_NAME,
  EASYSIGN_SIGNING_VIEWED_EVENT_NAME,
  EASYSIGN_DOCUMENT_SIGNED_EVENT_NAME,
  EASYSIGN_DOCUMENT_DECLINED_EVENT_NAME,
  EASYSIGN_SCHEMAS,
} from './schemas';

describe('EasySign Schema Definitions (KAN-81)', () => {
  it('contains all 4 required EasySign lifecycle event schemas', () => {
    const names = EASYSIGN_SCHEMAS.map((s) => s.name);
    expect(names).toContain(EASYSIGN_DOCUMENT_CREATED_EVENT_NAME);
    expect(names).toContain(EASYSIGN_SIGNING_VIEWED_EVENT_NAME);
    expect(names).toContain(EASYSIGN_DOCUMENT_SIGNED_EVENT_NAME);
    expect(names).toContain(EASYSIGN_DOCUMENT_DECLINED_EVENT_NAME);
  });

  it('declares proper identity keys and PII markers for compliance', () => {
    const docSigned = EASYSIGN_SCHEMAS.find(
      (s) => s.name === EASYSIGN_DOCUMENT_SIGNED_EVENT_NAME,
    );
    expect(docSigned).toBeDefined();

    const phoneField = docSigned?.fields.find((f) => f.name === 'signerPhoneHash');
    expect(phoneField?.isPii).toBe(true);
    expect(phoneField?.isIdentityKey).toBe(true);

    const docIdField = docSigned?.fields.find((f) => f.name === 'documentId');
    expect(docIdField?.isRequired).toBe(true);
    expect(docIdField?.isIdentityKey).toBe(true);

    const signingViewed = EASYSIGN_SCHEMAS.find(
      (s) => s.name === EASYSIGN_SIGNING_VIEWED_EVENT_NAME,
    );
    const ipField = signingViewed?.fields.find((f) => f.name === 'signerIpHash');
    expect(ipField?.isPii).toBe(true);
  });
});

