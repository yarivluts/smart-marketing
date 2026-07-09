export class InvalidStripeCredentialSecretError extends Error {
  constructor() {
    super(
      'Expected the Stripe credential secret to be JSON of the shape {"apiSecretKey": "sk_...", "webhookSigningSecret": "whsec_..."}.',
    );
    this.name = 'InvalidStripeCredentialSecretError';
  }
}

export interface StripeCredentialSecret {
  apiSecretKey: string;
  webhookSigningSecret: string;
}

/**
 * Parses the one JSON blob stored as a `SharedCredentialModel`'s
 * envelope-encrypted `encrypted_secret` (KAN-27/29) for a `provider:
 * 'stripe'` credential. Bundling both the API secret key and the webhook
 * signing secret into one credential's one secret field reuses the existing
 * Resource Library set-secret admin form (KAN-29) as-is — no new secret UI
 * or storage field needed for this connector.
 */
export function parseStripeCredentialSecret(raw: string): StripeCredentialSecret {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new InvalidStripeCredentialSecretError();
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>).apiSecretKey !== 'string' ||
    typeof (parsed as Record<string, unknown>).webhookSigningSecret !== 'string' ||
    (parsed as StripeCredentialSecret).apiSecretKey.trim().length === 0 ||
    (parsed as StripeCredentialSecret).webhookSigningSecret.trim().length === 0
  ) {
    throw new InvalidStripeCredentialSecretError();
  }
  return parsed as StripeCredentialSecret;
}
