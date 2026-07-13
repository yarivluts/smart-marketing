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
  PLUGIN_TYPES,
  isPluginType,
  PLUGIN_SCOPES,
  isPluginScope,
  PLUGIN_CONFIG_FIELD_TYPES,
  isPluginConfigFieldType,
  PluginManifestValidationError,
  MAPPING_RECORD_KINDS,
  isMappingRecordKind,
  MAPPING_RULE_TRANSFORMS,
  isMappingRuleTransform,
  MAPPING_CAST_TYPES,
  isMappingCastType,
} from '@growthos/shared';
export type {
  Role,
  ScopeLevel,
  PrincipalType,
  Environment,
  ApiKeyScope,
  ApiKeyMode,
  PluginType,
  PluginScope,
  PluginConfigFieldType,
  PluginConfigFieldSchema,
  PluginManifest,
  PluginManifestRegisters,
  PluginManifestEndpoints,
  MappingRecordKind,
  MappingRuleTransform,
  MappingCastType,
  MappingRule,
  MappingRuleInput,
  MappingApplyResult,
  MappingSuggestion,
  WinRuleFilter,
  WinRuleFilterOperator,
  GuardrailViolation,
  GuardrailViolationType,
} from '@growthos/shared';
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
export * from './models/metric-def.model';
export * from './models/ingest-batch.model';
export * from './models/ingest-dedup-key.model';
export * from './models/pipeline-message.model';
export * from './models/raw-record.model';
export * from './models/quarantined-record.model';
export * from './models/audit-log-entry.model';
export * from './models/orchestration-run.model';
export * from './models/project-cost-quota.model';
export * from './models/query-cost-log-entry.model';
export * from './models/tracking-alert.model';
export * from './models/plugin-manifest.model';
export * from './models/plugin-install.model';
export * from './models/plugin-source-run.model';
export * from './models/board.model';
export * from './models/goal.model';
export * from './models/hook-endpoint.model';
export * from './models/hook-delivery.model';
export * from './models/field-mapping.model';
export * from './models/win-rule.model';
export * from './models/win-event.model';
export * from './models/tv-pairing.model';
export * from './models/onboarding-state.model';
export * from './models/automation-guardrail-policy.model';
export * from './models/automation-kill-switch-event.model';
export * from './models/automation-target-state.model';
export * from './models/automation-action.model';
export * from './models/mcp-oauth-client.model';
export * from './models/mcp-oauth-grant.model';
export * from './models/segment.model';
export * from './firestore-connection';
export * from './services/membership.service';
export * from './services/user.service';
export * from './services/organization.service';
export * from './services/invite.service';
export * from './services/resource-library.service';
export * from './services/key.service';
export * from './services/vault.service';
export * from './services/schema-registry.service';
export * from './services/metric-registry.service';
export * from './services/metrics-compiler.service';
export * from './services/metrics-query.service';
export * from './services/ingest.service';
export * from './services/pipeline.service';
export * from './services/quarantine.service';
export * from './services/audit-log.service';
export * from './services/orchestration.service';
export * from './services/cost-guardrail.service';
export * from './services/tracking-alert.service';
export * from './services/plugin-registry.service';
export * from './services/plugin-runtime.service';
export * from './services/stripe-plugin.service';
export * from './services/ga4-plugin.service';
export * from './services/source-plugin-dispatch.service';
export * from './services/metric-pack-dispatch.service';
export * from './services/board.service';
export * from './services/goal.service';
export * from './services/touchpoint-capture.service';
export * from './services/hook-signature';
export * from './services/hook.service';
export * from './services/field-mapping.service';
export * from './services/win-rule.service';
export * from './services/trial-pipeline.service';
export * from './services/tv-pairing.service';
export * from './services/onboarding.service';
export * from './services/product-analytics.service';
export * from './pipeline';
export * from './services/ingest-health.service';
export * from './vault';
export * from './rate-limit';
export * from './warehouse';
export * from './orchestration';
export * from './plugin-runtime';
export * from './services/automation-guardrail.service';
export * from './services/automation-kill-switch.service';
export * from './services/automation.service';
export * from './automation-runtime';
export * from './services/mcp-oauth.service';
export * from './services/mcp-tools.service';
export * from './services/segment.service';
