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

/**
 * Meta's documented Custom Audience upload format for a `MADID` schema
 * field (a mobile advertiser id — Android AAID or iOS IDFA, both
 * UUID-shaped): a lowercase SHA-256 hex digest of it, same
 * normalize-then-hash shape as `EMAIL` (Meta's own "Hashing and Normalizing
 * Customer Information" spec). Unlike {@link hashPhoneForMetaCustomAudience},
 * this does not strip any punctuation — a MAID's internal hyphens are part
 * of its own format (the standard UUID grouping), not incidental formatting
 * a source system added the way phone-number punctuation is, so stripping
 * them would normalize two different-looking-but-identical-once-hyphens-removed
 * strings that Meta's own spec treats as distinct. Only surrounding
 * whitespace is trimmed and the value is lowercased before hashing.
 */
export function hashMobileDeviceIdForMetaCustomAudience(mobileDeviceId: string): string {
  const normalized = mobileDeviceId.trim().toLowerCase();
  return createHash('sha256').update(normalized).digest('hex');
}

/**
 * Meta's documented Custom Audience upload format for `FN`/`LN` (first/last
 * name) schema fields: trim surrounding whitespace, lowercase, then SHA-256
 * hash — the same normalize-then-hash shape as `EMAIL`/`MADID` (Meta's own
 * "Hashing and Normalizing Customer Information" spec). Unlike
 * {@link hashCityForMetaCustomAudience}, Meta's spec does not call for
 * stripping internal whitespace/punctuation from a name.
 */
export function hashNameForMetaCustomAudience(name: string): string {
  const normalized = name.trim().toLowerCase();
  return createHash('sha256').update(normalized).digest('hex');
}

/**
 * Meta's documented Custom Audience upload format for a `CT` (city) schema
 * field: lowercase, with *all* whitespace and punctuation removed (Meta's
 * own spec example: "St. Louis" becomes "stlouis") before hashing — unlike
 * {@link hashNameForMetaCustomAudience}, which only trims surrounding
 * whitespace.
 */
export function hashCityForMetaCustomAudience(city: string): string {
  const normalized = city.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  return createHash('sha256').update(normalized).digest('hex');
}

/**
 * Meta's documented Custom Audience upload format for an `ST` (state)
 * schema field: the two-letter ANSI abbreviation, lowercased, with all
 * whitespace/punctuation stripped before hashing — same normalization
 * shape as {@link hashCityForMetaCustomAudience}. This function does not
 * itself validate that `state` is really a two-letter code (same "best
 * effort, not every row is eligible" posture every other function in this
 * file establishes).
 */
export function hashStateForMetaCustomAudience(state: string): string {
  const normalized = state.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  return createHash('sha256').update(normalized).digest('hex');
}

/**
 * Meta's documented Custom Audience upload format for a `ZIP` schema field:
 * strip whitespace/punctuation, lowercase (Meta's spec: some countries'
 * postal codes include letters), then keep only the first 5 characters —
 * Meta's own spec: "Remove any characters after the first 5 digits for
 * United States zip codes" (a `zip+4` value like `94103-1234` hashes the
 * same as `94103`).
 */
export function hashZipForMetaCustomAudience(zip: string): string {
  const normalized = zip
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 5);
  return createHash('sha256').update(normalized).digest('hex');
}

/**
 * Meta's documented Custom Audience upload format for a `COUNTRY` schema
 * field: the two-letter ISO 3166-1 alpha-2 country code, lowercased, with
 * whitespace/punctuation stripped before hashing — same normalization shape
 * as {@link hashStateForMetaCustomAudience}. This function does not itself
 * validate that `country` is really a two-letter code (same "best effort"
 * posture every other function in this file establishes).
 */
export function hashCountryForMetaCustomAudience(country: string): string {
  const normalized = country.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  return createHash('sha256').update(normalized).digest('hex');
}
