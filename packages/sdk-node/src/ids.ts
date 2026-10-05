import { createHash } from 'node:crypto';

/**
 * A stable event id from your own data: the same parts always give the same id, so a retried or
 * replayed event (a Firestore trigger firing twice, a queue redelivery) is reported as a duplicate
 * instead of being counted twice.
 *
 * ```ts
 * eventId('document_signed', doc.id)        // once per document
 * eventId('plan_change', user.id, change.at) // once per change
 * ```
 */
export function eventId(...parts: (string | number | Date)[]): string {
  if (parts.length === 0) throw new Error('GrowthOS: eventId() needs at least one part.');
  const canonical = parts
    .map((part) => (part instanceof Date ? part.toISOString() : String(part)))
    .join('\u001f');
  return `evt_${createHash('sha256').update(canonical).digest('hex').slice(0, 32)}`;
}
