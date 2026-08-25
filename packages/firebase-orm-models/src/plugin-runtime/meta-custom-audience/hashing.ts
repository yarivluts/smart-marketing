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
