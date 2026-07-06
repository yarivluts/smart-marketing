import { createHash } from 'node:crypto';
import type { KmsProvider } from './kms-provider';
import { LocalKmsProvider } from './local-kms-provider';

const DEV_FALLBACK_KEY_VERSION = 'dev-insecure';

// A fixed, publicly-known master key used only when NEITHER
// VAULT_MASTER_KEYS_JSON nor VAULT_MASTER_KEY_VERSION is set — i.e. local dev
// and CI against the Firestore emulator, where there is no real secret to
// protect yet. Exactly as "insecure" as the emulator's own hardcoded
// `demo-growthos-test` project id, and never reachable in a real deployment:
// KAN-18 (real GCP project) must set both vars before KAN-27/49 ever store a
// real OAuth token through this module. If only one of the two is set, that's
// a real deployment mid-configuration, not a dev environment — see the
// `MissingVaultConfigError` branch below, which fails loudly instead of
// silently falling back to this key.
const DEV_FALLBACK_MASTER_KEY = createHash('sha256').update('growthos-dev-insecure-vault-master-key').digest('base64');

export class MissingVaultConfigError extends Error {
  constructor(missingVar: string, presentVar: string) {
    super(
      `${presentVar} is set but ${missingVar} is not. Both VAULT_MASTER_KEYS_JSON and ` +
        'VAULT_MASTER_KEY_VERSION must be set together, or neither (dev/test only) — ' +
        'refusing to silently fall back to the insecure dev key with a half-configured vault.',
    );
    this.name = 'MissingVaultConfigError';
  }
}

export class InvalidVaultMasterKeysError extends Error {
  constructor(cause: unknown) {
    super(`VAULT_MASTER_KEYS_JSON is not valid JSON: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'InvalidVaultMasterKeysError';
  }
}

/**
 * Builds the `KmsProvider` this process should use, from environment
 * variables:
 *  - `VAULT_MASTER_KEYS_JSON`: JSON object mapping key version -> base64
 *    32-byte master key, e.g. `{"2026-07":"<base64>"}`. Keep every version a
 *    not-yet-rotated secret might still need to unwrap with — dropping an old
 *    version orphans anything not yet rotated onto a newer one.
 *  - `VAULT_MASTER_KEY_VERSION`: which entry of the map above is current.
 *
 * Falls back to a single, deliberately insecure dev key only when *both* are
 * unset — mirrors `apps/web/lib/firebase/admin.ts`'s "real credentials only
 * required against a real project" split. If exactly one is set (a plausible
 * partial-rollout ops mistake), throws `MissingVaultConfigError` rather than
 * silently using the dev key against what's likely a real deployment. Real
 * GCP Cloud KMS is deferred to a later story (see `LocalKmsProvider`'s doc
 * comment).
 */
export function createKmsProviderFromEnv(env: NodeJS.ProcessEnv = process.env): KmsProvider {
  const rawMasterKeys = env.VAULT_MASTER_KEYS_JSON;
  const currentKeyVersion = env.VAULT_MASTER_KEY_VERSION;

  if (rawMasterKeys && !currentKeyVersion) {
    throw new MissingVaultConfigError('VAULT_MASTER_KEY_VERSION', 'VAULT_MASTER_KEYS_JSON');
  }
  if (currentKeyVersion && !rawMasterKeys) {
    throw new MissingVaultConfigError('VAULT_MASTER_KEYS_JSON', 'VAULT_MASTER_KEY_VERSION');
  }

  if (rawMasterKeys && currentKeyVersion) {
    let masterKeys: Record<string, string>;
    try {
      masterKeys = JSON.parse(rawMasterKeys) as Record<string, string>;
    } catch (cause) {
      throw new InvalidVaultMasterKeysError(cause);
    }
    return new LocalKmsProvider({ masterKeys, currentKeyVersion });
  }

  return new LocalKmsProvider({
    masterKeys: { [DEV_FALLBACK_KEY_VERSION]: DEV_FALLBACK_MASTER_KEY },
    currentKeyVersion: DEV_FALLBACK_KEY_VERSION,
  });
}
