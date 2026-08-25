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
 * Google Ads' documented Customer Match upload format for a contact-info
 * `hashedPhoneNumber` user identifier: the raw value is never sent — only a
 * SHA-256 hex digest of the number normalized to E.164 (a leading `+`
 * followed only by digits, per Google's own "Formatting guidelines for
 * offline data" spec). Punctuation commonly present in an ingested phone
 * field (spaces, dashes, parentheses) is stripped before hashing; a number
 * with no leading `+` is hashed as digits-only rather than guessed at a
 * country code, so a caller that already stores E.164 numbers (the only
 * format Google actually matches against) gets a correct hash, while a
 * bare local-format number normalizes to something Google simply won't
 * match — the same "garbage in, no match, not a crash" posture
 * {@link hashEmailForGoogleCustomerMatch} accepts for a malformed email.
 */
export function hashPhoneNumberForGoogleCustomerMatch(phoneNumber: string): string {
  const trimmed = phoneNumber.trim();
  const digitsOnly = trimmed.replace(/[^\d]/g, '');
  const normalized = trimmed.startsWith('+') ? `+${digitsOnly}` : digitsOnly;
  return createHash('sha256').update(normalized).digest('hex');
}
