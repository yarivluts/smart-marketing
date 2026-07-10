import { describe, expect, it } from 'vitest';
import { InvalidGa4CredentialSecretError, parseGa4CredentialSecret } from './credential-secret';

describe('parseGa4CredentialSecret', () => {
  it('parses a valid secret', () => {
    expect(parseGa4CredentialSecret(JSON.stringify({ accessToken: 'ya29.test' }))).toEqual({ accessToken: 'ya29.test' });
  });

  it('rejects non-JSON', () => {
    expect(() => parseGa4CredentialSecret('not json')).toThrow(InvalidGa4CredentialSecretError);
  });

  it('rejects JSON missing accessToken', () => {
    expect(() => parseGa4CredentialSecret(JSON.stringify({}))).toThrow(InvalidGa4CredentialSecretError);
  });

  it('rejects a blank accessToken', () => {
    expect(() => parseGa4CredentialSecret(JSON.stringify({ accessToken: '   ' }))).toThrow(InvalidGa4CredentialSecretError);
  });

  it('rejects a JSON array', () => {
    expect(() => parseGa4CredentialSecret('[]')).toThrow(InvalidGa4CredentialSecretError);
  });
});
