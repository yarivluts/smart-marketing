import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, rotateSecretEnvelopeKey } from './envelope';
import { generateLocalKmsKeyRing, LocalKmsProvider, loadLocalKmsKeyRingFromEnv, UnknownKmsKeyError } from './local-kms-provider';
import { VaultNotConfiguredError } from './local-kms-provider';

function providerWithKeys(keys: Record<string, Buffer>, currentKeyId: string): LocalKmsProvider {
  return new LocalKmsProvider(keys, currentKeyId);
}

describe('encryptSecret / decryptSecret', () => {
  it('round-trips a secret back to its original plaintext', async () => {
    const { keyRing, currentKeyId } = generateLocalKmsKeyRing();
    const kms = providerWithKeys(keyRing, currentKeyId);

    const envelope = await encryptSecret('super-secret-oauth-token', 'org-1', kms);
    const plaintext = await decryptSecret(envelope, 'org-1', kms);

    expect(plaintext).toBe('super-secret-oauth-token');
  });

  it('never leaks the plaintext into any envelope field', async () => {
    const { keyRing, currentKeyId } = generateLocalKmsKeyRing();
    const kms = providerWithKeys(keyRing, currentKeyId);
    const secret = 'sk_live_totally-real-looking-secret';

    const envelope = await encryptSecret(secret, 'org-1', kms);

    expect(JSON.stringify(envelope)).not.toContain(secret);
    expect(envelope.ciphertext).not.toBe(secret);
    expect(envelope.wrappedDek).not.toBe(secret);
  });

  it('fails to decrypt under a different tenant id — cross-tenant decryption is structurally impossible', async () => {
    const { keyRing, currentKeyId } = generateLocalKmsKeyRing();
    const kms = providerWithKeys(keyRing, currentKeyId);

    const envelope = await encryptSecret('org-1-secret', 'org-1', kms);

    await expect(decryptSecret(envelope, 'org-2', kms)).rejects.toThrow();
  });

  it('fails to decrypt tampered ciphertext (authenticity check)', async () => {
    const { keyRing, currentKeyId } = generateLocalKmsKeyRing();
    const kms = providerWithKeys(keyRing, currentKeyId);

    const envelope = await encryptSecret('org-1-secret', 'org-1', kms);
    const tamperedByte = Buffer.from(envelope.ciphertext, 'base64');
    tamperedByte[0] = tamperedByte[0]! ^ 0xff;
    const tampered = { ...envelope, ciphertext: tamperedByte.toString('base64') };

    await expect(decryptSecret(tampered, 'org-1', kms)).rejects.toThrow();
  });

  it('rejects an envelope wrapped by a key id the provider no longer holds', async () => {
    const { keyRing, currentKeyId } = generateLocalKmsKeyRing('v1');
    const kms = providerWithKeys(keyRing, currentKeyId);
    const envelope = await encryptSecret('org-1-secret', 'org-1', kms);

    const retiredProvider = providerWithKeys({ v2: randomKey() }, 'v2');

    await expect(decryptSecret(envelope, 'org-1', retiredProvider)).rejects.toBeInstanceOf(UnknownKmsKeyError);
  });
});

describe('rotateSecretEnvelopeKey', () => {
  it('re-wraps the DEK under the new current key without changing the ciphertext, and decrypts to the same plaintext', async () => {
    const v1 = generateLocalKmsKeyRing('v1');
    const kmsV1 = providerWithKeys(v1.keyRing, v1.currentKeyId);
    const envelope = await encryptSecret('rotate-me', 'org-1', kmsV1);
    expect(envelope.keyId).toBe('v1');

    // "rotation in progress": both the old and new key are still available.
    const v2Key = randomKey();
    const kmsBoth = providerWithKeys({ v1: v1.keyRing.v1!, v2: v2Key }, 'v2');

    const rotated = await rotateSecretEnvelopeKey(envelope, 'org-1', kmsBoth);

    expect(rotated.keyId).toBe('v2');
    expect(rotated.ciphertext).toBe(envelope.ciphertext);
    expect(rotated.wrappedDek).not.toBe(envelope.wrappedDek);
    await expect(decryptSecret(rotated, 'org-1', kmsBoth)).resolves.toBe('rotate-me');

    // "rotation complete": the old key has been retired entirely.
    const kmsRetired = providerWithKeys({ v2: v2Key }, 'v2');
    await expect(decryptSecret(rotated, 'org-1', kmsRetired)).resolves.toBe('rotate-me');
    await expect(decryptSecret(envelope, 'org-1', kmsRetired)).rejects.toBeInstanceOf(UnknownKmsKeyError);
  });

  it('is a no-op when the envelope already carries the current key id', async () => {
    const { keyRing, currentKeyId } = generateLocalKmsKeyRing();
    const kms = providerWithKeys(keyRing, currentKeyId);
    const envelope = await encryptSecret('already-current', 'org-1', kms);

    const rotated = await rotateSecretEnvelopeKey(envelope, 'org-1', kms);

    expect(rotated).toEqual(envelope);
  });
});

describe('LocalKmsProvider', () => {
  it('rejects construction with a currentKeyId absent from its own key ring', () => {
    expect(() => new LocalKmsProvider({}, 'v1')).toThrow(UnknownKmsKeyError);
  });
});

describe('loadLocalKmsKeyRingFromEnv', () => {
  it('parses a well-formed GROWTHOS_VAULT_KEYS env var', () => {
    const v1 = randomKey().toString('base64');
    const { keyRing, currentKeyId } = loadLocalKmsKeyRingFromEnv({
      GROWTHOS_VAULT_KEYS: JSON.stringify({ currentKeyId: 'v1', keys: { v1 } }),
    } as NodeJS.ProcessEnv);

    expect(currentKeyId).toBe('v1');
    expect(keyRing.v1?.toString('base64')).toBe(v1);
  });

  it('throws VaultNotConfiguredError when the env var is unset', () => {
    expect(() => loadLocalKmsKeyRingFromEnv({} as NodeJS.ProcessEnv)).toThrow(VaultNotConfiguredError);
  });

  it('throws VaultNotConfiguredError on malformed JSON', () => {
    expect(() => loadLocalKmsKeyRingFromEnv({ GROWTHOS_VAULT_KEYS: 'not-json' } as NodeJS.ProcessEnv)).toThrow(
      VaultNotConfiguredError,
    );
  });

  it('throws VaultNotConfiguredError when a key does not decode to 32 bytes', () => {
    expect(() =>
      loadLocalKmsKeyRingFromEnv({
        GROWTHOS_VAULT_KEYS: JSON.stringify({ currentKeyId: 'v1', keys: { v1: 'dG9vc2hvcnQ=' } }),
      } as NodeJS.ProcessEnv),
    ).toThrow(VaultNotConfiguredError);
  });
});

function randomKey(): Buffer {
  return generateLocalKmsKeyRing('k').keyRing.k!;
}
