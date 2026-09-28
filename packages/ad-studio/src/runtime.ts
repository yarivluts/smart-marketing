import { LocalKmsProvider, loadLocalKmsKeyRingFromEnv, type KmsProvider } from '@growthos/firebase-orm-models';
import type { AdStudioMediaStorage } from './media-storage';
import type { concatClips } from './ffmpeg';

/**
 * How the host app plugs into the Ad Studio engine. The engine is shared by the web app (routes and
 * pages) and the API's MCP server, which connect the Firestore ORM differently: the web app lazily
 * per request, the API once at boot. Everything else - the vault, the model clients, storage,
 * ffmpeg - the engine resolves itself from the environment.
 */
export interface AdStudioRuntime {
  /** Makes sure the ORM is connected before the engine reads or writes. The API connects at boot, so its default is a no-op. */
  ensureOrm: () => Promise<void>;
  /**
   * Test seams: a media store and a clip joiner to use instead of the environment's. Only tests set
   * these; production resolves GCS and runs the real ffmpeg binary.
   */
  mediaStorage?: () => AdStudioMediaStorage;
  concatClips?: typeof concatClips;
}

let runtime: AdStudioRuntime = { ensureOrm: async () => undefined };

export function configureAdStudioRuntime(next: Partial<AdStudioRuntime>): void {
  runtime = { ...runtime, ...next };
}

/** Restores the defaults (tests). */
export function resetAdStudioRuntime(): void {
  runtime = { ensureOrm: async () => undefined };
}

export function adStudioRuntime(): AdStudioRuntime {
  return runtime;
}

export async function ensureOrm(): Promise<void> {
  await runtime.ensureOrm();
}

/** The vault's KMS provider from GROWTHOS_VAULT_KEYS (throws VaultNotConfiguredError if unset) - the same provider both apps build. */
export function getServerKmsProvider(): KmsProvider {
  const { keyRing, currentKeyId } = loadLocalKmsKeyRingFromEnv();
  return new LocalKmsProvider(keyRing, currentKeyId);
}
