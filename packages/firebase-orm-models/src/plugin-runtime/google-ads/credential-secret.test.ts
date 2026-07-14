import { describe, expect, it } from 'vitest';
import { InvalidGoogleAdsCredentialSecretError, parseGoogleAdsCredentialSecret } from './credential-secret';

const VALID_SECRET = {
  developerToken: 'dev-token',
  clientId: 'client-id',
  clientSecret: 'client-secret',
  refreshToken: 'refresh-token',
  customerId: '1234567890',
};

describe('parseGoogleAdsCredentialSecret', () => {
  it('parses a valid secret', () => {
    expect(parseGoogleAdsCredentialSecret(JSON.stringify(VALID_SECRET))).toEqual(VALID_SECRET);
  });

  it('parses a valid secret with an optional loginCustomerId', () => {
    const withManager = { ...VALID_SECRET, loginCustomerId: '111-manager' };
    expect(parseGoogleAdsCredentialSecret(JSON.stringify(withManager))).toEqual(withManager);
  });

  it('throws on invalid JSON', () => {
    expect(() => parseGoogleAdsCredentialSecret('not json')).toThrow(InvalidGoogleAdsCredentialSecretError);
  });

  it('throws when a required field is missing', () => {
    const { developerToken: _developerToken, ...withoutDeveloperToken } = VALID_SECRET;
    expect(() => parseGoogleAdsCredentialSecret(JSON.stringify(withoutDeveloperToken))).toThrow(InvalidGoogleAdsCredentialSecretError);
  });

  it('throws when a required field is blank', () => {
    expect(() => parseGoogleAdsCredentialSecret(JSON.stringify({ ...VALID_SECRET, customerId: '  ' }))).toThrow(
      InvalidGoogleAdsCredentialSecretError,
    );
  });

  it('throws when loginCustomerId is present but not a string', () => {
    expect(() => parseGoogleAdsCredentialSecret(JSON.stringify({ ...VALID_SECRET, loginCustomerId: 12345 }))).toThrow(
      InvalidGoogleAdsCredentialSecretError,
    );
  });

  it('throws on a JSON array instead of an object', () => {
    expect(() => parseGoogleAdsCredentialSecret('[]')).toThrow(InvalidGoogleAdsCredentialSecretError);
  });
});
