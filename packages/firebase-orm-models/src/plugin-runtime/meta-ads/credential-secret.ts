export class InvalidMetaAdsCredentialSecretError extends Error {
  constructor() {
    super(
      'Expected the Meta Ads credential secret to be JSON of the shape ' +
        '{"accessToken": "...", "adAccountId": "1234567890", "pageId": "1234567890"}.',
    );
    this.name = 'InvalidMetaAdsCredentialSecretError';
  }
}

export interface MetaAdsCredentialSecret {
  /** A static long-lived access token (System User token or long-lived User token) — see `MetaAdsApiClientOptions`'s own doc comment for why Meta needs no refresh-token dance. */
  accessToken: string;
  /** The Meta ad account id (no `act_` prefix, no dashes) whose campaigns this credential manages. */
  adAccountId: string;
  /** The Facebook Page id a created link ad's `object_story_spec.page_id` posts as — required for every `campaign_draft_create` action, since Meta has no page-less link ad. */
  pageId: string;
}

const REQUIRED_STRING_FIELDS = ['accessToken', 'adAccountId', 'pageId'] as const;

/**
 * Parses the one JSON blob stored as a `SharedCredentialModel`'s
 * envelope-encrypted `encrypted_secret` (KAN-27/29) for a `provider:
 * 'meta_ads'` credential: the access token, the target ad account id, and
 * the Facebook Page id every created ad posts as. Bundling all three into
 * one credential's one secret field reuses the existing Resource Library
 * set-secret admin form (KAN-29) as-is — no new secret UI or storage field
 * needed for this connector, the same posture `parseGoogleAdsCredentialSecret`
 * established. Obtaining the access token itself still needs a one-time
 * human step outside this app (a System User token minted in Meta Business
 * Manager, or a long-lived User token exchanged via a one-time OAuth
 * consent) — out of scope here, same as KAN-72's own deferred OAuth-consent
 * note.
 */
export function parseMetaAdsCredentialSecret(raw: string): MetaAdsCredentialSecret {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new InvalidMetaAdsCredentialSecretError();
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new InvalidMetaAdsCredentialSecretError();
  }
  const record = parsed as Record<string, unknown>;
  for (const field of REQUIRED_STRING_FIELDS) {
    if (typeof record[field] !== 'string' || (record[field] as string).trim().length === 0) {
      throw new InvalidMetaAdsCredentialSecretError();
    }
  }
  return record as unknown as MetaAdsCredentialSecret;
}
