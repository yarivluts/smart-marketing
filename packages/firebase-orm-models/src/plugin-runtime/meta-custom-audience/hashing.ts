import { createHash } from 'node:crypto';

/**
 * Meta's documented Custom Audience upload format for an `EMAIL` schema
 * field: the raw value is never sent — only a lowercase, whitespace-trimmed
 * SHA-256 hex digest of it (Meta's own "Hashing and Normalizing Customer
 * Information" spec). An empty/whitespace-only email normalizes to an empty
 * string, which `MetaCustomAudienceSinkPluginExecutor` filters out before it
 * ever reaches this function — see that module's own doc comment.
 */
export function hashEmailForMetaCustomAudience(email: string): string {
  const normalized = email.trim().toLowerCase();
  return createHash('sha256').update(normalized).digest('hex');
}

/**
 * Meta's documented Custom Audience upload format for a `PHONE` schema
 * field: digits only, country code included, with every leading/trailing
 * whitespace, the leading `+`, and any other punctuation (spaces, dashes,
 * parens) stripped before hashing — unlike `EMAIL`, Meta's own "Hashing and
 * Normalizing Customer Information" spec never keeps a `+` for phone
 * numbers. This function does not itself validate that `phone` is a real,
 * correctly-country-coded number (same "best effort, not every row is
 * eligible" posture `hashEmailForMetaCustomAudience`/`extractEmail`
 * establish) — a source system that stores a national-only number with no
 * country code will still hash and upload, it just won't match on Meta's
 * side.
 */
export function hashPhoneForMetaCustomAudience(phone: string): string {
  const digitsOnly = phone.trim().replace(/[^0-9]/g, '');
  return createHash('sha256').update(digitsOnly).digest('hex');
}
