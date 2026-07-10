import { LocalKmsProvider, loadLocalKmsKeyRingFromEnv, type KmsProvider } from '@growthos/firebase-orm-models';

export { VaultNotConfiguredError } from '@growthos/firebase-orm-models';

/**
 * Builds the vault's KMS provider from `GROWTHOS_VAULT_KEYS` — mirrors `apps/web`'s
 * `lib/vault/kms-provider.ts`. Only called for a hook endpoint whose `signature_mode` is
 * `hmac_sha256` (see `HooksController`), so a deploy with no vault configured yet still serves
 * `none`-mode hook endpoints without error.
 */
export function getServerKmsProvider(): KmsProvider {
  const { keyRing, currentKeyId } = loadLocalKmsKeyRingFromEnv();
  return new LocalKmsProvider(keyRing, currentKeyId);
}
