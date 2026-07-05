import { MembershipModel } from '../models/membership.model';
import { RoleBindingModel } from '../models/role-binding.model';

/**
 * Removes a membership and every role binding it granted within that org, in
 * one call — plan 08 §1.1: "removing the membership cascades removal of all
 * that user's bindings in the org (single revocation point)". Role bindings
 * always hang off a membership regardless of the scope level (org/project/
 * environment) they were granted at, since they all live in the same
 * `organizations/{org}/role_bindings` subcollection.
 */
export async function removeMembershipCascade(membership: MembershipModel): Promise<void> {
  const bindings = await RoleBindingModel.initPath({ organization_id: membership.organization_id })
    .where('principal_type', '==', 'user')
    .where('principal_id', '==', membership.user_id)
    .get();

  await Promise.all(bindings.map((binding) => binding.remove()));
  await membership.remove();
}
