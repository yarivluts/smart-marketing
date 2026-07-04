/**
 * @growthos/firebase-orm-models - the ONLY sanctioned way to touch Firestore.
 * Every model extends @arbel/firebase-orm's BaseModel; app code must never use
 * the raw Firebase SDK (see CLAUDE.md).
 *
 * Bootstrap seed: the identity / RBAC hierarchy (plan 08 par.1.1). It is fleshed
 * out under KAN-22 and KAN-23.
 */
import 'reflect-metadata';

export * from './roles';
export * from './models/user.model';
export * from './models/organization.model';
export * from './models/membership.model';
export * from './models/project.model';
export * from './models/environment.model';
export * from './models/role-binding.model';
export * from './models/service-account.model';
