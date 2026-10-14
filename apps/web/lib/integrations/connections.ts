import type { AdPlatformProvider, SharedCredentialModel } from '@growthos/firebase-orm-models';

/** An ad platform connection as the Connections page shows it - never its secret. */
export interface ConnectionView {
  id: string;
  provider: AdPlatformProvider;
  name: string;
  accountId: string | null;
  accountName: string | null;
  currency: string | null;
  hasSecret: boolean;
  connectedVia: 'oauth' | null;
  tokenExpiresOn: string | null;
  lastCheckedOn: string | null;
  /** `ok`, a failure reason, or null when never checked. */
  lastCheckStatus: string | null;
}

export function toConnectionView(credential: SharedCredentialModel): ConnectionView {
  return {
    id: credential.id,
    provider: credential.provider as AdPlatformProvider,
    name: credential.name,
    accountId: credential.last_check_account?.id ?? credential.available_scopes?.[0] ?? null,
    accountName: credential.last_check_account?.name ?? null,
    currency: credential.last_check_account?.currency ?? null,
    hasSecret: Boolean(credential.encrypted_secret),
    connectedVia: credential.connected_via ?? null,
    tokenExpiresOn: credential.token_expires_on ?? null,
    lastCheckedOn: credential.last_checked_on ?? null,
    lastCheckStatus: credential.last_check_status ?? null,
  };
}
