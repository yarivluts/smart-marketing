export class InvalidCrmWebhookCredentialSecretError extends Error {
  constructor() {
    super('Expected the CRM webhook credential secret to be JSON of the shape {"webhookUrl": "https://...", "bearerToken": "..."}.');
    this.name = 'InvalidCrmWebhookCredentialSecretError';
  }
}

export interface CrmWebhookCredentialSecret {
  webhookUrl: string;
  bearerToken: string;
}

/**
 * Parses the one JSON blob stored as a `SharedCredentialModel`'s
 * envelope-encrypted `encrypted_secret` (KAN-27/29) for a `provider:
 * 'generic'` credential attached to a CRM-sync plugin install. Mirrors
 * `parseStripeCredentialSecret`'s exact shape/validation posture — bundling
 * both the destination URL and its bearer token into one secret reuses the
 * existing Resource Library set-secret admin form as-is, no new secret UI or
 * storage field needed for this connector.
 */
export function parseCrmWebhookCredentialSecret(raw: string): CrmWebhookCredentialSecret {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new InvalidCrmWebhookCredentialSecretError();
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>).webhookUrl !== 'string' ||
    typeof (parsed as Record<string, unknown>).bearerToken !== 'string' ||
    (parsed as CrmWebhookCredentialSecret).bearerToken.trim().length === 0
  ) {
    throw new InvalidCrmWebhookCredentialSecretError();
  }

  let webhookUrl: URL;
  try {
    webhookUrl = new URL((parsed as CrmWebhookCredentialSecret).webhookUrl);
  } catch {
    throw new InvalidCrmWebhookCredentialSecretError();
  }
  if (webhookUrl.protocol !== 'https:' && webhookUrl.protocol !== 'http:') {
    throw new InvalidCrmWebhookCredentialSecretError();
  }

  return parsed as CrmWebhookCredentialSecret;
}
