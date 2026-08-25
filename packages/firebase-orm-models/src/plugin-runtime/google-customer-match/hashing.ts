import { createHash } from 'node:crypto';

/**
 * Google Ads' documented Customer Match upload format for a contact-info
 * `hashedEmail` user identifier: the raw value is never sent — only a
 * lowercase, whitespace-trimmed SHA-256 hex digest of it (Google's own
 * "Formatting guidelines for offline data" spec — the same normalize-then-hash
 * shape Meta's own Custom Audience spec requires, see
 * `meta-custom-audience/hashing.ts`'s sibling function; kept as its own
 * per-connector copy rather than a shared cross-connector util, the same
 * "each connector owns its own small hashing/credential/executor module"
 * posture this codebase already establishes for e.g. `stripe/webhook-signature.ts`
 * vs. `hook-signature.ts`). An empty/whitespace-only email normalizes to an
 * empty string, which `GoogleCustomerMatchSinkPluginExecutor` filters out
 * before it ever reaches this function — see that module's own doc comment.
 */
export function hashEmailForGoogleCustomerMatch(email: string): string {
  const normalized = email.trim().toLowerCase();
  return createHash('sha256').update(normalized).digest('hex');
}

/**
 * Google Ads' documented Customer Match upload format for a `hashedPhoneNumber`
 * user identifier: the raw value is never sent — only a SHA-256 hex digest of
 * the number formatted to E.164 (leading `+`, country code, digits only, no
 * spaces/dashes/parens — Google Ads' own "Formatting guidelines for offline
 * data" spec, which keeps the `+` for phone numbers unlike Meta's own PHONE
 * schema, see `meta-custom-audience/hashing.ts`'s sibling function's own doc
 * comment for that difference). This function does not itself validate that
 * `phone` is a real, correctly-country-coded number (same "best effort, not
 * every row is eligible" posture `hashEmailForGoogleCustomerMatch`/`extractEmail`
 * establish) — a source system that stores a national-only number with no
 * country code will still hash and upload, it just won't match on Google's
 * side.
 */
export function hashPhoneForGoogleCustomerMatch(phone: string): string {
  const trimmed = phone.trim();
  const hasPlus = trimmed.startsWith('+');
  const digitsOnly = trimmed.replace(/[^0-9]/g, '');
  const normalized = digitsOnly.length > 0 ? `${hasPlus ? '+' : ''}${digitsOnly}` : '';
  return createHash('sha256').update(normalized).digest('hex');
}
