/**
 * Test-only switches for the Ad Studio's video pipeline (KAN-231): a fake Gemini Omni base URL and a
 * local-folder stand-in for the media bucket, so the browser verification and e2e runs can exercise
 * generation, storage and playback without a paid API or GCS.
 *
 * They can never take effect in a deployment by accident: an override is honoured only while
 * `FIRESTORE_EMULATOR_HOST` is set as well. A deployed service never sets it - with it set, every
 * Firestore read and write would go to an emulator that does not exist there, so the app could not
 * work at all. `next start` runs with NODE_ENV=production, so NODE_ENV alone could not tell a local
 * production build apart from a deployment; the emulator host can.
 */

export const AD_STUDIO_TEST_OMNI_BASE_URL = 'AD_STUDIO_TEST_OMNI_BASE_URL';
export const AD_STUDIO_TEST_MEDIA_DIR = 'AD_STUDIO_TEST_MEDIA_DIR';

export function adStudioTestOverride(env: NodeJS.ProcessEnv, name: typeof AD_STUDIO_TEST_OMNI_BASE_URL | typeof AD_STUDIO_TEST_MEDIA_DIR): string | null {
  const value = env[name]?.trim();
  if (!value) return null;
  if (!env.FIRESTORE_EMULATOR_HOST?.trim()) return null;
  return value;
}

/** The fake Omni server must also be on this machine, so a mistaken value cannot send prompts elsewhere. */
export function isLoopbackHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '[::1]');
  } catch {
    return false;
  }
}
