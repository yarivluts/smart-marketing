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

export {
  ROLES,
  isRole,
  SCOPE_LEVELS,
  isScopeLevel,
  PRINCIPAL_TYPES,
  ENVIRONMENTS,
  API_KEY_SCOPES,
  isApiKeyScope,
  API_KEY_PREFIXES,
  apiKeyMode,
  apiKeyModeForEnvironment,
} from '@growthos/shared';
export type { Role, ScopeLevel, PrincipalType, Environment, ApiKeyScope, ApiKeyMode } from '@growthos/shared';
export * from './models/user.model';
export * from './models/organization.model';
export * from './models/membership.model';
export * from './models/project.model';
export * from './models/environment.model';
export * from './models/role-binding.model';
export * from './models/service-account.model';
export * from './models/shared-credential.model';
export * from './models/resource-template.model';
export * from './models/org-person.model';
export * from './models/resource-attachment.model';
export * from './models/api-key.model';
export * from './models/schema-def.model';
export * from './models/ingest-batch.model';
export * from './models/ingest-dedup-key.model';
export * from './models/pipeline-message.model';
export * from './models/raw-record.model';
export * from './firestore-connection';
export * from './services/membership.service';
export * from './services/user.service';
export * from './services/organization.service';
export * from './services/invite.service';
export * from './services/resource-library.service';
export * from './services/key.service';
export * from './services/vault.service';
export * from './services/schema-registry.service';
export * from './services/ingest.service';
export * from './services/pipeline.service';
export * from './pipeline';
export * from './vault';
