const DEFAULT_HOOK_API_URL = 'http://localhost:3001/v1/hooks';

/**
 * The GrowthOS inbound-hook API's base URL (KAN-53), for building a hook
 * endpoint's copy-paste receive URL on the Hooks admin page — same posture
 * as `ingestApiUrl()`: not a secret, safe to read from a client component.
 */
export function hookApiUrl(): string {
  return process.env.NEXT_PUBLIC_HOOK_API_URL ?? DEFAULT_HOOK_API_URL;
}
