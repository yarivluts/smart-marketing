export class InvalidGa4CredentialSecretError extends Error {
  constructor() {
    super('Expected the GA4 credential secret to be JSON of the shape {"accessToken": "ya29...."}.');
    this.name = 'InvalidGa4CredentialSecretError';
  }
}

export interface Ga4CredentialSecret {
  /** A bearer OAuth2 access token for the GA4 Data API (`https://www.googleapis.com/auth/analytics.readonly` scope), minted/refreshed by whoever set this credential — this connector does not perform its own OAuth flow or token refresh (a real Google Cloud OAuth consent screen needs a human-submitted app review, the same KAN-43-style human-gated-approval shape already deferred for Google Ads/Meta). */
  accessToken: string;
}

/**
 * Parses the one JSON blob stored as a `SharedCredentialModel`'s
 * envelope-encrypted `encrypted_secret` (KAN-27/29) for a `provider: 'ga4'`
 * credential — the same "reuse the existing Resource Library set-secret
 * form as-is" posture `parseStripeCredentialSecret` (KAN-49) already
 * established.
 */
export function parseGa4CredentialSecret(raw: string): Ga4CredentialSecret {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new InvalidGa4CredentialSecretError();
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>).accessToken !== 'string' ||
    (parsed as Ga4CredentialSecret).accessToken.trim().length === 0
  ) {
    throw new InvalidGa4CredentialSecretError();
  }
  return parsed as Ga4CredentialSecret;
}
