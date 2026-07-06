import { describe, expect, it } from 'vitest';
import { createKmsProviderFromEnv } from './create-kms-provider';
import { generateDataKey, open, seal } from './envelope';
import { LocalKmsProvider, UnknownKeyVersionError } from './local-kms-provider';

describe('generateDataKey', () => {
  it('returns a fresh 32-byte key every call', () => {
    const a = generateDataKey();
    const b = generateDataKey();
    expect(a).toHaveLength(32);
    expect(b).toHaveLength(32);
    expect(a.equals(b)).toBe(false);
  });
});

describe('seal/open', () => {
  it('round-trips plaintext under the same key', () => {
    const key = generateDataKey();
    const plaintext = Buffer.from('super-secret-oauth-token', 'utf8');

    const sealed = seal(plaintext, key);

    expect(sealed.ciphertext).not.toBe(plaintext.toString('base64'));
    expect(open(sealed, key).toString('utf8')).toBe('super-secret-oauth-token');
  });

  it('fails to open with the wrong key', () => {
    const plaintext = Buffer.from('super-secret-oauth-token', 'utf8');
    const sealed = seal(plaintext, generateDataKey());

    expect(() => open(sealed, generateDataKey())).toThrow();
  });

  it('fails to open when the ciphertext has been tampered with', () => {
    const key = generateDataKey();
    const sealed = seal(Buffer.from('super-secret-oauth-token', 'utf8'), key);
    const tamperedByte = Buffer.from(sealed.ciphertext, 'base64');
    tamperedByte[0] ^= 0xff;

    expect(() => open({ ...sealed, ciphertext: tamperedByte.toString('base64') }, key)).toThrow();
  });
});

describe('LocalKmsProvider', () => {
  it('wraps and unwraps a data key for the same tenant', async () => {
    const provider = new LocalKmsProvider({
      masterKeys: { v1: generateDataKey().toString('base64') },
      currentKeyVersion: 'v1',
    });
    const dataKey = generateDataKey();

    const wrapped = await provider.wrapDataKey('org_a', dataKey);
    expect(wrapped.keyVersion).toBe('v1');

    const unwrapped = await provider.unwrapDataKey('org_a', wrapped);
    expect(unwrapped.equals(dataKey)).toBe(true);
  });

  it('derives a distinct key-encryption-key per tenant, so one tenant cannot unwrap another\'s data key', async () => {
    const provider = new LocalKmsProvider({
      masterKeys: { v1: generateDataKey().toString('base64') },
      currentKeyVersion: 'v1',
    });
    const dataKey = generateDataKey();
    const wrapped = await provider.wrapDataKey('org_a', dataKey);

    await expect(provider.unwrapDataKey('org_b', wrapped)).rejects.toThrow();
  });

  it('rejects construction with a currentKeyVersion missing from masterKeys', () => {
    expect(() => new LocalKmsProvider({ masterKeys: { v1: generateDataKey().toString('base64') }, currentKeyVersion: 'v2' })).toThrow(
      UnknownKeyVersionError,
    );
  });

  it('supports rotation: re-wrapping under a newer key version while the old version can still unwrap what it wrapped', async () => {
    const masterKeys = { v1: generateDataKey().toString('base64'), v2: generateDataKey().toString('base64') };
    const providerV1 = new LocalKmsProvider({ masterKeys, currentKeyVersion: 'v1' });
    const providerV2 = new LocalKmsProvider({ masterKeys, currentKeyVersion: 'v2' });
    const dataKey = generateDataKey();

    const wrappedUnderV1 = await providerV1.wrapDataKey('org_a', dataKey);
    expect(wrappedUnderV1.keyVersion).toBe('v1');

    // Rotation: unwrap with whichever version wrapped it, re-wrap under the current version.
    const unwrapped = await providerV2.unwrapDataKey('org_a', wrappedUnderV1);
    const rewrapped = await providerV2.wrapDataKey('org_a', unwrapped);

    expect(rewrapped.keyVersion).toBe('v2');
    expect(await providerV2.unwrapDataKey('org_a', rewrapped)).toEqual(dataKey);

    // A provider that only knows about v2 can no longer unwrap the pre-rotation v1 wrapping.
    const providerV2Only = new LocalKmsProvider({ masterKeys: { v2: masterKeys.v2 }, currentKeyVersion: 'v2' });
    await expect(providerV2Only.unwrapDataKey('org_a', wrappedUnderV1)).rejects.toThrow(UnknownKeyVersionError);
  });
});

describe('createKmsProviderFromEnv', () => {
  it('uses the configured master keys/version when both env vars are set', async () => {
    const masterKey = generateDataKey().toString('base64');
    const provider = createKmsProviderFromEnv({
      VAULT_MASTER_KEYS_JSON: JSON.stringify({ '2026-07': masterKey }),
      VAULT_MASTER_KEY_VERSION: '2026-07',
    } as NodeJS.ProcessEnv);

    expect(provider.currentKeyVersion).toBe('2026-07');
    const wrapped = await provider.wrapDataKey('org_a', generateDataKey());
    expect(wrapped.keyVersion).toBe('2026-07');
  });

  it('falls back to a deterministic insecure dev key when unset', () => {
    const provider = createKmsProviderFromEnv({} as NodeJS.ProcessEnv);
    expect(provider.currentKeyVersion).toBe('dev-insecure');
  });
});
