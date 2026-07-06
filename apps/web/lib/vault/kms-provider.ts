import 'server-only';
import { LocalKmsProvider, loadLocalKmsKeyRingFromEnv, type KmsProvider } from '@growthos/firebase-orm-models';

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
