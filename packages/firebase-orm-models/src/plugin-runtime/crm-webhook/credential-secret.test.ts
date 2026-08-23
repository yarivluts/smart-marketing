import { describe, expect, it } from 'vitest';
import { InvalidCrmWebhookCredentialSecretError, parseCrmWebhookCredentialSecret } from './credential-secret';

describe('parseCrmWebhookCredentialSecret', () => {
  it('parses a valid JSON secret', () => {
    const raw = JSON.stringify({ webhookUrl: 'https://crm.example.com/webhooks/growthos', bearerToken: 'tok_abc' });
    expect(parseCrmWebhookCredentialSecret(raw)).toEqual({ webhookUrl: 'https://crm.example.com/webhooks/growthos', bearerToken: 'tok_abc' });
  });

  it('accepts a plain http URL too', () => {
    const raw = JSON.stringify({ webhookUrl: 'http://localhost:4000/hook', bearerToken: 'tok_abc' });
    expect(parseCrmWebhookCredentialSecret(raw).webhookUrl).toBe('http://localhost:4000/hook');
  });

  it('rejects non-JSON', () => {
    expect(() => parseCrmWebhookCredentialSecret('not json')).toThrow(InvalidCrmWebhookCredentialSecretError);
  });

  it('rejects JSON missing webhookUrl', () => {
    expect(() => parseCrmWebhookCredentialSecret(JSON.stringify({ bearerToken: 'tok_abc' }))).toThrow(InvalidCrmWebhookCredentialSecretError);
  });

  it('rejects JSON missing bearerToken', () => {
    expect(() => parseCrmWebhookCredentialSecret(JSON.stringify({ webhookUrl: 'https://crm.example.com/hook' }))).toThrow(
      InvalidCrmWebhookCredentialSecretError,
    );
  });

  it('rejects an empty-string bearerToken', () => {
    expect(() => parseCrmWebhookCredentialSecret(JSON.stringify({ webhookUrl: 'https://crm.example.com/hook', bearerToken: '' }))).toThrow(
      InvalidCrmWebhookCredentialSecretError,
    );
  });

  it('rejects a malformed webhookUrl', () => {
    expect(() => parseCrmWebhookCredentialSecret(JSON.stringify({ webhookUrl: 'not-a-url', bearerToken: 'tok_abc' }))).toThrow(
      InvalidCrmWebhookCredentialSecretError,
    );
  });

  it('rejects a non-http(s) scheme (e.g. file:)', () => {
    expect(() => parseCrmWebhookCredentialSecret(JSON.stringify({ webhookUrl: 'file:///etc/passwd', bearerToken: 'tok_abc' }))).toThrow(
      InvalidCrmWebhookCredentialSecretError,
    );
  });

  it('rejects a JSON array', () => {
    expect(() => parseCrmWebhookCredentialSecret('[1,2,3]')).toThrow(InvalidCrmWebhookCredentialSecretError);
  });

  it('rejects a bare JSON string', () => {
    expect(() => parseCrmWebhookCredentialSecret('"https://crm.example.com/hook"')).toThrow(InvalidCrmWebhookCredentialSecretError);
  });
});
