import 'server-only';
import {
  classifySecretEnvelopeKey,
  LocalKmsProvider,
  loadLocalKmsKeyRingFromEnv,
  VaultNotConfiguredError,
  type KmsProvider,
  type SecretEnvelope,
  type SecretEnvelopeKeyState,
} from '@growthos/firebase-orm-models';

export { VaultNotConfiguredError } from '@growthos/firebase-orm-models';

/**
 * Builds the vault's KMS provider from `GROWTHOS_VAULT_KEYS` (see
 * `apps/web/.env.example`). Throws `VaultNotConfiguredError` if unset —
 * callers should turn that into a 500, since it means the deploy is missing
 * required secret-store config, not that the caller did anything wrong.
 */
export function getServerKmsProvider(): KmsProvider {
  const { keyRing, currentKeyId } = loadLocalKmsKeyRingFromEnv();
  return new LocalKmsProvider(keyRing, currentKeyId);
}

/**
 * What a stored secret's wrapping key means for whether the secret still
 * works, for display only — `null` when the credential has no secret at all.
 *
 * Swallows `VaultNotConfiguredError` into `'vault_not_configured'` rather than
 * letting it throw, because a read-only status column must not take down a page
 * that renders plenty of things needing no vault at all (people, templates,
 * attachment requests). That state is still worth showing: with no vault
 * configured, every stored secret is unreadable, and "Secret set" alone would
 * be exactly as misleading as it is for a retired key (KAN-173).
 */
export function describeSecretKeyState(envelope: SecretEnvelope | null | undefined): SecretEnvelopeKeyState | 'vault_not_configured' | null {
  if (!envelope) {
    return null;
  }
  try {
    return classifySecretEnvelopeKey(envelope, getServerKmsProvider());
  } catch (error) {
    if (error instanceof VaultNotConfiguredError) {
      return 'vault_not_configured';
    }
    throw error;
  }
}
