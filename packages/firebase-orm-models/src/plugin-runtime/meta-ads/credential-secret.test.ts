import { describe, expect, it } from 'vitest';
import { InvalidMetaAdsCredentialSecretError, parseMetaAdsCredentialSecret } from './credential-secret';

const VALID_SECRET = {
  accessToken: 'access-token',
  adAccountId: '1234567890',
  pageId: '9876543210',
};

describe('parseMetaAdsCredentialSecret', () => {
  it('parses a valid secret', () => {
    expect(parseMetaAdsCredentialSecret(JSON.stringify(VALID_SECRET))).toEqual(VALID_SECRET);
  });

  it('throws on invalid JSON', () => {
    expect(() => parseMetaAdsCredentialSecret('not json')).toThrow(InvalidMetaAdsCredentialSecretError);
  });

  it('throws when a required field is missing', () => {
    const { accessToken: _accessToken, ...withoutAccessToken } = VALID_SECRET;
    expect(() => parseMetaAdsCredentialSecret(JSON.stringify(withoutAccessToken))).toThrow(InvalidMetaAdsCredentialSecretError);
  });

  it('throws when a required field is blank', () => {
    expect(() => parseMetaAdsCredentialSecret(JSON.stringify({ ...VALID_SECRET, pageId: '  ' }))).toThrow(InvalidMetaAdsCredentialSecretError);
  });

  it('throws when a required field is not a string', () => {
    expect(() => parseMetaAdsCredentialSecret(JSON.stringify({ ...VALID_SECRET, adAccountId: 1234567890 }))).toThrow(
      InvalidMetaAdsCredentialSecretError,
    );
  });

  it('throws on a JSON array instead of an object', () => {
    expect(() => parseMetaAdsCredentialSecret('[]')).toThrow(InvalidMetaAdsCredentialSecretError);
  });

  it('throws on a JSON null', () => {
    expect(() => parseMetaAdsCredentialSecret('null')).toThrow(InvalidMetaAdsCredentialSecretError);
  });
});
