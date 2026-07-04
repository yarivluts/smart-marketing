/**
 * @growthos/firebase-orm-models - the ONLY sanctioned way to touch Firestore.
 * Every model extends @arbel/firebase-orm's BaseModel; app code must never use
 * the raw Firebase SDK (see CLAUDE.md).
 *
 * The identity / RBAC hierarchy (plan 08 par.1.1). Role/permission vocabulary
 * lives in `@growthos/shared` (policy engine, KAN-23) and is re-exported here
 * for convenience since every model in this package is typed against it.
 */
import 'reflect-metadata';

export { ROLES, isRole, SCOPE_LEVELS, isScopeLevel, PRINCIPAL_TYPES } from '@growthos/shared';
export type { Role, ScopeLevel, PrincipalType } from '@growthos/shared';
export * from './models/user.model';
export * from './models/organization.model';
export * from './models/membership.model';
export * from './models/project.model';
export * from './models/environment.model';
export * from './models/role-binding.model';
export * from './models/service-account.model';
