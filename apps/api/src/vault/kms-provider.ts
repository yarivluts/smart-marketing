import { LocalKmsProvider, loadLocalKmsKeyRingFromEnv, type KmsProvider } from '@growthos/firebase-orm-models';

export { VaultNotConfiguredError } from '@growthos/firebase-orm-models';

/**
 * Builds the vault's KMS provider from `GROWTHOS_VAULT_KEYS` — the same env
 * var and provider `apps/web/lib/vault/kms-provider.ts` builds, since both
 * apps decrypt secrets sealed under the same key ring (KAN-53's hook
 * endpoints are created in `apps/web`, their signing secrets decrypted here
 * in `apps/api` at receive time). Throws `VaultNotConfiguredError` if unset.
 */
export function getServerKmsProvider(): KmsProvider {
  const { keyRing, currentKeyId } = loadLocalKmsKeyRingFromEnv();
  return new LocalKmsProvider(keyRing, currentKeyId);
}
