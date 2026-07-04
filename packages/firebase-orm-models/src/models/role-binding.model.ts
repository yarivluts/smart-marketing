import { BaseModel, Field, Model } from '@arbel/firebase-orm';
import type { PrincipalType, Role, ScopeLevel } from '@growthos/shared';

/**
 * Grants a role to a principal (user or service account) at a scope level.
 * Deny-by-default: absence of a binding means no access (KAN-23).
 */
@Model({
  reference_path: 'organizations/:organization_id/role_bindings',
  path_id: 'role_binding_id',
})
export class RoleBindingModel extends BaseModel {
  @Field({ is_required: true })
  public principal_type!: PrincipalType;

  @Field({ is_required: true })
  public principal_id!: string;

  @Field({ is_required: true })
  public role!: Role;

  @Field({ is_required: true })
  public scope_level!: ScopeLevel;

  /** Id of the org/project/environment the binding is scoped to. */
  @Field({ is_required: true })
  public scope_id!: string;
}
