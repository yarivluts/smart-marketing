const DEFAULT_HOOKS_API_URL = 'http://localhost:3001/v1/hooks';

/**
 * The GrowthOS inbound-webhook API's base URL (KAN-53), for building the full
 * `{base}/{projectId}/{hookEndpointId}` URL an admin pastes into a third-party SaaS's webhook
 * settings. Same "not a secret, safe in a client bundle" reasoning as `ingestApiUrl()`.
 */
export function hooksApiUrl(): string {
  return process.env.NEXT_PUBLIC_HOOKS_API_URL ?? DEFAULT_HOOKS_API_URL;
}
