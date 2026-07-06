import { createHash } from 'node:crypto';
import type { KmsProvider } from './kms-provider';
import { LocalKmsProvider } from './local-kms-provider';

const DEV_FALLBACK_KEY_VERSION = 'dev-insecure';

// A fixed, publicly-known master key used only when VAULT_MASTER_KEYS_JSON is
// unset — i.e. local dev and CI against the Firestore emulator, where there
// is no real secret to protect yet. Exactly as "insecure" as the emulator's
// own hardcoded `demo-growthos-test` project id, and never reachable in a
// real deployment: KAN-18 (real GCP project) must set VAULT_MASTER_KEYS_JSON
// before KAN-27/49 ever store a real OAuth token through this module.
const DEV_FALLBACK_MASTER_KEY = createHash('sha256').update('growthos-dev-insecure-vault-master-key').digest('base64');

/**
 * Builds the `KmsProvider` this process should use, from environment
 * variables:
 *  - `VAULT_MASTER_KEYS_JSON`: JSON object mapping key version -> base64
 *    32-byte master key, e.g. `{"2026-07":"<base64>"}`. Keep every version a
 *    not-yet-rotated secret might still need to unwrap with — dropping an old
 *    version orphans anything not yet rotated onto a newer one.
 *  - `VAULT_MASTER_KEY_VERSION`: which entry of the map above is current.
 *
 * Falls back to a single, deliberately insecure dev key when either is unset
 * — mirrors `apps/web/lib/firebase/admin.ts`'s "real credentials only
 * required against a real project" split. Real GCP Cloud KMS is deferred to
 * a later story (see `LocalKmsProvider`'s doc comment).
 */
export function createKmsProviderFromEnv(env: NodeJS.ProcessEnv = process.env): KmsProvider {
  const rawMasterKeys = env.VAULT_MASTER_KEYS_JSON;
  const currentKeyVersion = env.VAULT_MASTER_KEY_VERSION;

  if (rawMasterKeys && currentKeyVersion) {
    return new LocalKmsProvider({
      masterKeys: JSON.parse(rawMasterKeys) as Record<string, string>,
      currentKeyVersion,
    });
  }

  return new LocalKmsProvider({
    masterKeys: { [DEV_FALLBACK_KEY_VERSION]: DEV_FALLBACK_MASTER_KEY },
    currentKeyVersion: DEV_FALLBACK_KEY_VERSION,
  });
}
