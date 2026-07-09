import { describe, expect, it } from 'vitest';
import { InvalidStripeCredentialSecretError, parseStripeCredentialSecret } from './credential-secret';

describe('parseStripeCredentialSecret', () => {
  it('parses a valid JSON secret', () => {
    const raw = JSON.stringify({ apiSecretKey: 'sk_test_123', webhookSigningSecret: 'whsec_abc' });
    expect(parseStripeCredentialSecret(raw)).toEqual({ apiSecretKey: 'sk_test_123', webhookSigningSecret: 'whsec_abc' });
  });

  it('rejects non-JSON', () => {
    expect(() => parseStripeCredentialSecret('not json')).toThrow(InvalidStripeCredentialSecretError);
  });

  it('rejects JSON missing apiSecretKey', () => {
    expect(() => parseStripeCredentialSecret(JSON.stringify({ webhookSigningSecret: 'whsec_abc' }))).toThrow(
      InvalidStripeCredentialSecretError,
    );
  });

  it('rejects JSON missing webhookSigningSecret', () => {
    expect(() => parseStripeCredentialSecret(JSON.stringify({ apiSecretKey: 'sk_test_123' }))).toThrow(
      InvalidStripeCredentialSecretError,
    );
  });

  it('rejects empty-string values', () => {
    expect(() => parseStripeCredentialSecret(JSON.stringify({ apiSecretKey: '', webhookSigningSecret: 'whsec_abc' }))).toThrow(
      InvalidStripeCredentialSecretError,
    );
  });

  it('rejects a JSON array', () => {
    expect(() => parseStripeCredentialSecret('[1,2,3]')).toThrow(InvalidStripeCredentialSecretError);
  });

  it('rejects a bare JSON string', () => {
    expect(() => parseStripeCredentialSecret('"sk_test_123"')).toThrow(InvalidStripeCredentialSecretError);
  });
});
