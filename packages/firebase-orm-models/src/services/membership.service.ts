import { MembershipModel } from '../models/membership.model';
import { RoleBindingModel } from '../models/role-binding.model';

/**
 * Removes a membership and every role binding it granted within that org, in
 * one call — plan 08 §1.1: "removing the membership cascades removal of all
 * that user's bindings in the org (single revocation point)". Role bindings
 * always hang off a membership regardless of the scope level (org/project/
 * environment) they were granted at, since they all live in the same
 * `organizations/{org}/role_bindings` subcollection.
 *
 * Firestore has no multi-document transaction in this ORM's client-SDK-based
 * API, so this isn't atomic: if a binding delete fails partway through, the
 * membership is deliberately left in place (deleted last) rather than
 * orphaned bindings left behind un-owned. Re-calling with the same
 * membership is safe — the binding query re-reads current state each time,
 * so it only ever removes what's still there.
 */
export async function removeMembershipCascade(membership: MembershipModel): Promise<void> {
  const bindings = await RoleBindingModel.initPath({ organization_id: membership.organization_id })
    .where('principal_type', '==', 'user')
    .where('principal_id', '==', membership.user_id)
    .get();

  await Promise.all(bindings.map((binding) => binding.remove()));
  await membership.remove();
}
