export class InvalidGoogleAdsCredentialSecretError extends Error {
  constructor() {
    super(
      'Expected the Google Ads credential secret to be JSON of the shape ' +
        '{"developerToken": "...", "clientId": "...", "clientSecret": "...", "refreshToken": "...", "customerId": "1234567890", "loginCustomerId"?: "1234567890"}.',
    );
    this.name = 'InvalidGoogleAdsCredentialSecretError';
  }
}

export interface GoogleAdsCredentialSecret {
  developerToken: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  /** The Google Ads customer id (no dashes) whose campaigns this credential manages. */
  customerId: string;
  /** The manager (MCC) account id, if the OAuth grant authenticates as a manager rather than directly as `customerId`. */
  loginCustomerId?: string;
}

const REQUIRED_STRING_FIELDS = ['developerToken', 'clientId', 'clientSecret', 'refreshToken', 'customerId'] as const;

/**
 * Parses the one JSON blob stored as a `SharedCredentialModel`'s
 * envelope-encrypted `encrypted_secret` (KAN-27/29) for a `provider:
 * 'google_ads'` credential. Bundling the OAuth app credentials, the
 * long-lived refresh token, the developer token, and the target customer id
 * into one credential's one secret field reuses the existing Resource
 * Library set-secret admin form (KAN-29) as-is — no new secret UI or storage
 * field needed for this connector, the same posture `parseStripeCredentialSecret`
 * established. Obtaining the refresh token itself still needs a one-time
 * human OAuth consent flow outside this app (Google Ads Manage access is not
 * a self-serve API key) — out of scope here, same as KAN-49's own deferred
 * Stripe Connect note.
 */
export function parseGoogleAdsCredentialSecret(raw: string): GoogleAdsCredentialSecret {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new InvalidGoogleAdsCredentialSecretError();
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new InvalidGoogleAdsCredentialSecretError();
  }
  const record = parsed as Record<string, unknown>;
  for (const field of REQUIRED_STRING_FIELDS) {
    if (typeof record[field] !== 'string' || (record[field] as string).trim().length === 0) {
      throw new InvalidGoogleAdsCredentialSecretError();
    }
  }
  if (record.loginCustomerId !== undefined && (typeof record.loginCustomerId !== 'string' || record.loginCustomerId.trim().length === 0)) {
    throw new InvalidGoogleAdsCredentialSecretError();
  }
  return record as unknown as GoogleAdsCredentialSecret;
}
