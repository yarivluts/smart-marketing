import type { MembershipStatus } from '@growthos/firebase-orm-models';

/**
 * A membership with no `status` predates KAN-25's `MembershipStatus` field
 * and is treated as `active` (the only status that existed before it) —
 * every "list active orgs" call site below needs this same fallback, so it's
 * centralized here rather than repeated (KAN-132 review: six near-identical
 * inline copies of this predicate had to be edited in lockstep to stop a
 * `suspended` membership from being treated as active, an easy spot to miss
 * on the next status value or call site).
 */
export function isActiveMembershipStatus(status: MembershipStatus | undefined): boolean {
  return (status ?? 'active') === 'active';
}
