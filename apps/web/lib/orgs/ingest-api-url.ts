const DEFAULT_INGEST_API_URL = 'http://localhost:3001/v1/ingest';

/**
 * The GrowthOS ingest API's base URL, for building the KAN-57 touchpoint-capture
 * embed snippet. `NEXT_PUBLIC_*` env vars are inlined into the client bundle at
 * build time (Next.js), so this is safe to call from a client component, not
 * just server-side — the ingest API base URL isn't a secret, the write key is.
 */
export function ingestApiUrl(): string {
  return process.env.NEXT_PUBLIC_INGEST_API_URL ?? DEFAULT_INGEST_API_URL;
}
