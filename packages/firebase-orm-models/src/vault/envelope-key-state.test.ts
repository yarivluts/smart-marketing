import { describe, expect, it } from 'vitest';
import { classifySecretEnvelopeKey, type SecretEnvelope } from './envelope';
import type { KmsProvider, WrappedDek } from './kms-provider';

/**
 * The resource library showed "Secret set" for every credential with stored
 * ciphertext, which collapses three states with very different consequences
 * into one reassuring label (KAN-173). These pin them apart.
 *
 * The one that matters is `unreadable`: `unwrapDek` throws `UnknownKmsKeyError`
 * for a key the provider no longer holds, so the secret is present and useless
 * and every connector using it is broken — while the page said it was set. An
 * admin debugging a dead connector would look at the credential, see it
 * configured, and rule it out.
 */
function kmsWith(currentKeyId: string, knownKeyIds: readonly string[]): KmsProvider {
  return {
    currentKeyId,
    knowsKeyId: (keyId) => knownKeyIds.includes(keyId),
    wrapDek: (): Promise<WrappedDek> => {
      throw new Error('not used — classification does no crypto, which is the point');
    },
    unwrapDek: (): Promise<Buffer> => {
      throw new Error('not used — classification does no crypto, which is the point');
    },
  };
}

function envelopeUnder(keyId: string): SecretEnvelope {
  return { keyId, wrappedDek: 'd', iv: 'i', authTag: 'a', ciphertext: 'c' };
}

describe('classifySecretEnvelopeKey', () => {
  it('is current when wrapped under the provider current key', () => {
    expect(classifySecretEnvelopeKey(envelopeUnder('v2'), kmsWith('v2', ['v1', 'v2']))).toBe('current');
  });

  it('is rotatable when wrapped under an older key the provider still holds', () => {
    expect(classifySecretEnvelopeKey(envelopeUnder('v1'), kmsWith('v2', ['v1', 'v2']))).toBe('rotatable');
  });

  /**
   * The dangerous state, and the reason "Secret set" was not enough on its own.
   * Retiring a key from `GROWTHOS_VAULT_KEYS` without rotating the secrets
   * sealed under it leaves exactly this: ciphertext present, nothing able to
   * read it.
   */
  it('is unreadable when wrapped under a key the provider no longer holds', () => {
    expect(classifySecretEnvelopeKey(envelopeUnder('v1'), kmsWith('v2', ['v2']))).toBe('unreadable');
  });

  /**
   * Asserted explicitly because the whole design depends on it: a page listing
   * every credential in an org calls this once per row, and a classification
   * that needed an unwrap would need the tenant id and real crypto per row —
   * expensive enough that the status would get dropped rather than shown.
   */
  it('classifies without unwrapping anything', () => {
    const kms = kmsWith('v2', ['v2']);
    expect(() => classifySecretEnvelopeKey(envelopeUnder('v1'), kms)).not.toThrow();
  });
});
