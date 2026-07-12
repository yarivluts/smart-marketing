import 'server-only';
import {
  acceptInvite as acceptInviteForOrganization,
  type ApiKeyModel,
  type ApiKeyScope,
  type BoardModel,
  type BoardTile,
  checkTrackingAlertsForProject as checkTrackingAlertsForProjectInOrganization,
  createBoard as createBoardInOrganization,
  createOrganizationWithOwner,
  createOrgPerson as createOrgPersonInOrganization,
  createProject as createProjectInOrganization,
  createResourceTemplate as createResourceTemplateInOrganization,
  createFieldMapping as createFieldMappingInOrganization,
  createHookEndpoint as createHookEndpointInOrganization,
  createSharedCredential as createSharedCredentialInOrganization,
  decideResourceAttachment as decideResourceAttachmentInOrganization,
  deleteBoard as deleteBoardInOrganization,
  disableHookEndpoint as disableHookEndpointInOrganization,
  disablePlugin as disablePluginInOrganization,
  type DrainPipelineResult,
  detachResource as detachResourceInOrganization,
  disableFieldMapping as disableFieldMappingInOrganization,
  enablePlugin as enablePluginInOrganization,
  type EnsureTouchpointSchemaRegisteredResult,
  ensureTouchpointSchemaRegistered as ensureTouchpointSchemaRegisteredInOrganization,
  evolveMetricDefinition as evolveMetricDefinitionInOrganization,
  evolveSchemaDefinition as evolveSchemaDefinitionInOrganization,
  type FieldMappingModel,
  createGoal as createGoalInOrganization,
  deleteGoal as deleteGoalInOrganization,
  type GoalModel,
  createWinRule as createWinRuleInOrganization,
  updateWinRule as updateWinRuleInOrganization,
  deleteWinRule as deleteWinRuleInOrganization,
  type WinRuleFilter,
  type WinRuleModel,
  type HookEndpointModel,
  type HookSignatureMode,
  installPluginAndProvisionBuiltins as installPluginInOrganization,
  saveBoardTiles as saveBoardTilesInOrganization,
  updateBoardSettings as updateBoardSettingsInOrganization,
  processStripeWebhookEvent as processStripeWebhookEventInOrganization,
  runSourcePluginInstall as runSourcePluginInstallInOrganization,
  inviteMemberToOrganization,
  mintApiKey as mintApiKeyInOrganization,
  type MintApiKeyResult,
  type OrchestrationRunModel,
  type PluginInstallModel,
  type PluginManifestModel,
  type PluginSourceRunModel,
  type ProcessStripeWebhookEventResult,
  registerMetricDefinition as registerMetricDefinitionInOrganization,
  registerPluginManifest as registerPluginManifestInOrganization,
  registerSchemaDefinition as registerSchemaDefinitionInOrganization,
  removeOrgMember,
  replayFailedPipelineMessagesForProject as replayFailedPipelineMessagesForProjectInOrganization,
  replayQuarantinedRecord as replayQuarantinedRecordInOrganization,
  type ReplayQuarantinedRecordResult,
  requestResourceAttachment as requestResourceAttachmentInOrganization,
  revokeApiKey as revokeApiKeyInOrganization,
  rotateSharedCredentialSecretKey as rotateSharedCredentialSecretKeyInOrganization,
  setHookDeliveryStatus as setHookDeliveryStatusInOrganization,
  type HookDeliveryModel,
  type HookDeliveryStatus,
  setHookEndpointSigningSecret as setHookEndpointSigningSecretInOrganization,
  setProjectCostQuota as setProjectCostQuotaInOrganization,
  setSharedCredentialSecret as setSharedCredentialSecretInOrganization,
  type MappingSuggestion,
  suggestFieldMappingRules as suggestFieldMappingRulesInOrganization,
  testRunFieldMapping as testRunFieldMappingInOrganization,
  triggerOrchestrationRun as triggerOrchestrationRunInOrganization,
  uninstallPlugin as uninstallPluginInOrganization,
  type AcceptInviteResult,
  type CreateOrganizationResult,
  type CreateProjectResult,
  type CredentialProvider,
  type InvitableRole,
  type KmsProvider,
  type MappingRuleInput,
  type MembershipModel,
  type MetricDefinitionInput,
  type MetricDefModel,
  type OrgPersonModel,
  type TestRunFieldMappingResult,
  type ProjectCostQuotaModel,
  type ResourceAttachmentModel,
  type ResourceKind,
  type ResourceTemplateModel,
  type ResourceTemplateType,
  type SchemaDefModel,
  type SchemaFieldInput,
  type SharedCredentialModel,
  type TrackingAlertCheckResult,
  claimTvPairing as claimTvPairingInOrganization,
  requestTvPairing as requestTvPairingInOrganization,
  revokeTvPairing as revokeTvPairingInOrganization,
  type RequestTvPairingResult,
  type TvPairingModel,
} from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';

interface CreateOrganizationInput {
  name: string;
  ownerUserId: string;
}

export async function createOrganization(input: CreateOrganizationInput): Promise<CreateOrganizationResult> {
  await ensureFirestoreOrm();
  return createOrganizationWithOwner(input);
}

interface CreateProjectInput {
  organizationId: string;
  name: string;
  vertical?: string;
}

export async function createProject(input: CreateProjectInput): Promise<CreateProjectResult> {
  await ensureFirestoreOrm();
  return createProjectInOrganization(input);
}

interface InviteMemberInput {
  organizationId: string;
  email: string;
  role: InvitableRole;
  invitedByUserId: string;
}

export async function inviteMember(input: InviteMemberInput): Promise<MembershipModel> {
  await ensureFirestoreOrm();
  return inviteMemberToOrganization(input);
}

interface AcceptInviteInput {
  organizationId: string;
  membershipId: string;
  userId: string;
  callerEmailVerified: boolean;
}

export async function acceptInvite(input: AcceptInviteInput): Promise<AcceptInviteResult> {
  await ensureFirestoreOrm();
  return acceptInviteForOrganization(input);
}

interface RemoveMemberInput {
  organizationId: string;
  membershipId: string;
  performedByUserId: string;
}

/** Revokes a pending invite or removes an active member — see `removeOrgMember`'s doc comment. */
export async function removeMember(input: RemoveMemberInput): Promise<void> {
  await ensureFirestoreOrm();
  return removeOrgMember(input.organizationId, input.membershipId, input.performedByUserId);
}

interface CreateSharedCredentialInput {
  organizationId: string;
  name: string;
  provider: CredentialProvider;
  availableScopes: readonly string[];
  createdByUserId: string;
}

export async function createSharedCredential(input: CreateSharedCredentialInput): Promise<SharedCredentialModel> {
  await ensureFirestoreOrm();
  return createSharedCredentialInOrganization(input);
}

interface SetSharedCredentialSecretInput {
  organizationId: string;
  credentialId: string;
  secret: string;
  kms: KmsProvider;
}

export async function setSharedCredentialSecret(input: SetSharedCredentialSecretInput): Promise<SharedCredentialModel> {
  await ensureFirestoreOrm();
  return setSharedCredentialSecretInOrganization(input);
}

interface RotateSharedCredentialSecretKeyInput {
  organizationId: string;
  credentialId: string;
  kms: KmsProvider;
}

export async function rotateSharedCredentialSecretKey(
  input: RotateSharedCredentialSecretKeyInput,
): Promise<SharedCredentialModel> {
  await ensureFirestoreOrm();
  return rotateSharedCredentialSecretKeyInOrganization(input);
}

interface CreateResourceTemplateInput {
  organizationId: string;
  name: string;
  type: ResourceTemplateType;
  config?: Record<string, unknown>;
  createdByUserId: string;
}

export async function createResourceTemplate(input: CreateResourceTemplateInput): Promise<ResourceTemplateModel> {
  await ensureFirestoreOrm();
  return createResourceTemplateInOrganization(input);
}

interface CreateOrgPersonInput {
  organizationId: string;
  name: string;
  email?: string;
  title?: string;
  photoUrl?: string;
  createdByUserId: string;
}

export async function createOrgPerson(input: CreateOrgPersonInput): Promise<OrgPersonModel> {
  await ensureFirestoreOrm();
  return createOrgPersonInOrganization(input);
}

interface RequestResourceAttachmentInput {
  organizationId: string;
  projectId: string;
  resourceKind: ResourceKind;
  resourceId: string;
  requestedByUserId: string;
  scopeSelection?: readonly string[];
}

export async function requestResourceAttachment(
  input: RequestResourceAttachmentInput,
): Promise<ResourceAttachmentModel> {
  await ensureFirestoreOrm();
  return requestResourceAttachmentInOrganization(input);
}

interface DecideResourceAttachmentInput {
  organizationId: string;
  attachmentId: string;
  decidedByUserId: string;
  approve: boolean;
}

export async function decideResourceAttachment(
  input: DecideResourceAttachmentInput,
): Promise<ResourceAttachmentModel> {
  await ensureFirestoreOrm();
  return decideResourceAttachmentInOrganization(input);
}

interface DetachResourceInput {
  organizationId: string;
  attachmentId: string;
}

export async function detachResource(input: DetachResourceInput): Promise<ResourceAttachmentModel> {
  await ensureFirestoreOrm();
  return detachResourceInOrganization(input);
}

interface MintApiKeyInput {
  organizationId: string;
  projectId: string;
  environmentId: string;
  name: string;
  scopes: readonly ApiKeyScope[];
  createdByUserId: string;
}

export async function mintApiKey(input: MintApiKeyInput): Promise<MintApiKeyResult> {
  await ensureFirestoreOrm();
  return mintApiKeyInOrganization(input);
}

interface RevokeApiKeyInput {
  organizationId: string;
  projectId: string;
  apiKeyId: string;
  revokedByUserId: string;
}

export async function revokeApiKey(input: RevokeApiKeyInput): Promise<ApiKeyModel> {
  await ensureFirestoreOrm();
  return revokeApiKeyInOrganization(input);
}

interface CreateHookEndpointInput {
  organizationId: string;
  projectId: string;
  environmentId: string;
  name: string;
  signatureMode: HookSignatureMode;
  signatureHeaderName?: string;
  createdByUserId: string;
}

export async function createHookEndpoint(input: CreateHookEndpointInput): Promise<HookEndpointModel> {
  await ensureFirestoreOrm();
  return createHookEndpointInOrganization(input);
}

interface DisableHookEndpointInput {
  organizationId: string;
  projectId: string;
  hookEndpointId: string;
  disabledByUserId: string;
}

export async function disableHookEndpoint(input: DisableHookEndpointInput): Promise<HookEndpointModel> {
  await ensureFirestoreOrm();
  return disableHookEndpointInOrganization(input);
}

interface SetHookEndpointSigningSecretInput {
  organizationId: string;
  projectId: string;
  hookEndpointId: string;
  signingSecret: string;
  kms: KmsProvider;
  actedByUserId: string;
}

export async function setHookEndpointSigningSecret(input: SetHookEndpointSigningSecretInput): Promise<HookEndpointModel> {
  await ensureFirestoreOrm();
  return setHookEndpointSigningSecretInOrganization(input);
}

interface SetHookDeliveryStatusInput {
  organizationId: string;
  projectId: string;
  hookDeliveryId: string;
  status: Extract<HookDeliveryStatus, 'reviewed' | 'discarded'>;
  actedByUserId: string;
}

export async function setHookDeliveryStatus(input: SetHookDeliveryStatusInput): Promise<HookDeliveryModel> {
  await ensureFirestoreOrm();
  return setHookDeliveryStatusInOrganization(input);
}

interface CreateFieldMappingInput {
  organizationId: string;
  projectId: string;
  environmentId: string;
  hookEndpointId?: string;
  name: string;
  kind: string;
  schemaName: string;
  rules: readonly MappingRuleInput[];
  createdByUserId: string;
}

export async function createFieldMapping(input: CreateFieldMappingInput): Promise<FieldMappingModel> {
  await ensureFirestoreOrm();
  return createFieldMappingInOrganization(input);
}

interface DisableFieldMappingInput {
  organizationId: string;
  projectId: string;
  fieldMappingId: string;
  disabledByUserId: string;
}

export async function disableFieldMapping(input: DisableFieldMappingInput): Promise<FieldMappingModel> {
  await ensureFirestoreOrm();
  return disableFieldMappingInOrganization(input);
}

interface TestRunFieldMappingInput {
  organizationId: string;
  projectId: string;
  fieldMappingId?: string;
  kind?: string;
  rules?: readonly MappingRuleInput[];
  schemaName?: string;
  samplePayload?: string;
  hookDeliveryId?: string;
}

export async function testRunFieldMapping(input: TestRunFieldMappingInput): Promise<TestRunFieldMappingResult> {
  await ensureFirestoreOrm();
  return testRunFieldMappingInOrganization(input);
}

interface SuggestFieldMappingRulesInput {
  organizationId: string;
  projectId: string;
  kind: string;
  schemaName: string;
  samplePayload: string;
}

export async function suggestFieldMappingRules(input: SuggestFieldMappingRulesInput): Promise<{ suggestions: readonly MappingSuggestion[] }> {
  await ensureFirestoreOrm();
  return suggestFieldMappingRulesInOrganization(input);
}

interface RegisterSchemaDefinitionInput {
  organizationId: string;
  projectId: string;
  kind: string;
  name: string;
  fields: readonly SchemaFieldInput[];
  createdByUserId: string;
}

export async function registerSchemaDefinition(input: RegisterSchemaDefinitionInput): Promise<SchemaDefModel> {
  await ensureFirestoreOrm();
  return registerSchemaDefinitionInOrganization(input);
}

interface EvolveSchemaDefinitionInput {
  organizationId: string;
  projectId: string;
  kind: string;
  name: string;
  fields: readonly SchemaFieldInput[];
  createdByUserId: string;
}

export async function evolveSchemaDefinition(input: EvolveSchemaDefinitionInput): Promise<SchemaDefModel> {
  await ensureFirestoreOrm();
  return evolveSchemaDefinitionInOrganization(input);
}

interface RegisterMetricDefinitionInput {
  organizationId: string;
  projectId: string;
  name: string;
  definition: MetricDefinitionInput;
  dimensions: readonly string[];
  createdByUserId: string;
}

export async function registerMetricDefinition(input: RegisterMetricDefinitionInput): Promise<MetricDefModel> {
  await ensureFirestoreOrm();
  return registerMetricDefinitionInOrganization(input);
}

interface EvolveMetricDefinitionInput {
  organizationId: string;
  projectId: string;
  name: string;
  definition: MetricDefinitionInput;
  dimensions: readonly string[];
  createdByUserId: string;
}

export async function evolveMetricDefinition(input: EvolveMetricDefinitionInput): Promise<MetricDefModel> {
  await ensureFirestoreOrm();
  return evolveMetricDefinitionInOrganization(input);
}

interface ReplayQuarantinedRecordInput {
  organizationId: string;
  projectId: string;
  quarantinedRecordId: string;
  performedByUserId: string;
}

export async function replayQuarantinedRecord(input: ReplayQuarantinedRecordInput): Promise<ReplayQuarantinedRecordResult> {
  await ensureFirestoreOrm();
  return replayQuarantinedRecordInOrganization(
    input.organizationId,
    input.projectId,
    input.quarantinedRecordId,
    input.performedByUserId,
  );
}

interface ReplayFailedPipelineMessagesInput {
  organizationId: string;
  projectId: string;
  performedByUserId: string;
}

export async function replayFailedPipelineMessagesForProject(
  input: ReplayFailedPipelineMessagesInput,
): Promise<DrainPipelineResult> {
  await ensureFirestoreOrm();
  return replayFailedPipelineMessagesForProjectInOrganization(
    input.organizationId,
    input.projectId,
    undefined,
    undefined,
    input.performedByUserId,
  );
}

interface TriggerOrchestrationRunInput {
  organizationId: string;
  projectId: string;
  triggeredByUserId: string;
}

export async function triggerOrchestrationRun(input: TriggerOrchestrationRunInput): Promise<OrchestrationRunModel> {
  await ensureFirestoreOrm();
  return triggerOrchestrationRunInOrganization({
    organizationId: input.organizationId,
    projectId: input.projectId,
    triggeredByUserId: input.triggeredByUserId,
  });
}

interface SetProjectCostQuotaInput {
  organizationId: string;
  projectId: string;
  dailyQueryLimit: number;
  labels: Record<string, string>;
  setByUserId: string;
}

export async function setProjectCostQuota(input: SetProjectCostQuotaInput): Promise<ProjectCostQuotaModel> {
  await ensureFirestoreOrm();
  return setProjectCostQuotaInOrganization(input);
}

interface CheckTrackingAlertsInput {
  organizationId: string;
  projectId: string;
  triggeredByUserId: string;
}

export async function checkTrackingAlertsForProject(input: CheckTrackingAlertsInput): Promise<TrackingAlertCheckResult> {
  await ensureFirestoreOrm();
  return checkTrackingAlertsForProjectInOrganization({
    organizationId: input.organizationId,
    projectId: input.projectId,
    triggeredByUserId: input.triggeredByUserId,
  });
}

interface EnsureTouchpointSchemaRegisteredInput {
  organizationId: string;
  projectId: string;
  createdByUserId: string;
}

export async function ensureTouchpointSchemaRegistered(
  input: EnsureTouchpointSchemaRegisteredInput,
): Promise<EnsureTouchpointSchemaRegisteredResult> {
  await ensureFirestoreOrm();
  return ensureTouchpointSchemaRegisteredInOrganization(input);
}

interface RegisterPluginManifestInput {
  organizationId: string;
  manifestYaml: string;
  registeredByUserId: string;
}

export async function registerPluginManifest(input: RegisterPluginManifestInput): Promise<PluginManifestModel> {
  await ensureFirestoreOrm();
  return registerPluginManifestInOrganization(input);
}

interface InstallPluginInput {
  organizationId: string;
  projectId: string;
  pluginId: string;
  version: string;
  consentedScopes: readonly string[];
  config: Record<string, unknown>;
  installedByUserId: string;
}

/**
 * Installs a plugin into a project. Transparently registers every metric a
 * built-in SaaS/marketing metric pack (KAN-59) declares right after install
 * — `installPluginInOrganization` here is actually
 * `installPluginAndProvisionBuiltins`, not the raw generic `installPlugin` —
 * and falls through unchanged for every other plugin.
 */
export async function installPlugin(input: InstallPluginInput): Promise<PluginInstallModel> {
  await ensureFirestoreOrm();
  return installPluginInOrganization(input);
}

interface PluginInstallLifecycleInput {
  organizationId: string;
  projectId: string;
  installId: string;
  performedByUserId: string;
}

export async function disablePlugin(input: PluginInstallLifecycleInput): Promise<PluginInstallModel> {
  await ensureFirestoreOrm();
  return disablePluginInOrganization(input);
}

export async function enablePlugin(input: PluginInstallLifecycleInput): Promise<PluginInstallModel> {
  await ensureFirestoreOrm();
  return enablePluginInOrganization(input);
}

export async function uninstallPlugin(input: PluginInstallLifecycleInput): Promise<PluginInstallModel> {
  await ensureFirestoreOrm();
  return uninstallPluginInOrganization(input);
}

interface RunSourcePluginInstallInput {
  organizationId: string;
  projectId: string;
  environmentId: string;
  installId: string;
  triggeredByUserId: string;
  /** Only consulted for the built-in Stripe plugin — every other install ignores it. */
  kms?: KmsProvider;
}

/**
 * The one "Run now" entry point (KAN-49) — transparently uses a real
 * `StripeSourcePluginExecutor` for the built-in Stripe plugin (resolving its
 * configured credential via `kms`) and falls through to the generic KAN-47
 * toy-executor runtime for every other plugin, unchanged.
 */
export async function runSourcePluginInstall(input: RunSourcePluginInstallInput): Promise<PluginSourceRunModel> {
  await ensureFirestoreOrm();
  return runSourcePluginInstallInOrganization(input);
}

interface ProcessStripeWebhookEventInput {
  organizationId: string;
  projectId: string;
  environmentId: string;
  installId: string;
  rawBody: string;
  signatureHeader: string;
  kms: KmsProvider;
}

/** Verifies and lands one Stripe webhook delivery (KAN-49) — the mutation the webhook route's `POST` handler calls after reading the raw request body. */
export async function processStripeWebhookEvent(input: ProcessStripeWebhookEventInput): Promise<ProcessStripeWebhookEventResult> {
  await ensureFirestoreOrm();
  return processStripeWebhookEventInOrganization(input);
}

interface CreateBoardInput {
  organizationId: string;
  projectId: string;
  name: string;
  createdByUserId: string;
}

export async function createBoard(input: CreateBoardInput): Promise<BoardModel> {
  await ensureFirestoreOrm();
  return createBoardInOrganization(input);
}

interface UpdateBoardSettingsInput {
  organizationId: string;
  projectId: string;
  boardId: string;
  name?: string;
  dateRange?: BoardModel['date_range'];
  compare?: BoardModel['compare'] | null;
  globalFilters?: BoardModel['global_filters'];
  updatedByUserId: string;
}

export async function updateBoardSettings(input: UpdateBoardSettingsInput): Promise<BoardModel> {
  await ensureFirestoreOrm();
  return updateBoardSettingsInOrganization(input);
}

interface SaveBoardTilesInput {
  organizationId: string;
  projectId: string;
  boardId: string;
  tiles: BoardTile[];
  updatedByUserId: string;
}

export async function saveBoardTiles(input: SaveBoardTilesInput): Promise<BoardModel> {
  await ensureFirestoreOrm();
  return saveBoardTilesInOrganization(input);
}

export async function deleteBoard(organizationId: string, projectId: string, boardId: string): Promise<void> {
  await ensureFirestoreOrm();
  return deleteBoardInOrganization(organizationId, projectId, boardId);
}

interface CreateGoalInput {
  organizationId: string;
  projectId: string;
  name: string;
  metricName: string;
  direction: string;
  targetValue?: number;
  rangeMin?: number;
  rangeMax?: number;
  startDate: string;
  deadline: string;
  rhythm: string;
  ownerPersonId: string;
  createdByUserId: string;
}

export async function createGoal(input: CreateGoalInput): Promise<GoalModel> {
  await ensureFirestoreOrm();
  return createGoalInOrganization(input);
}

export async function deleteGoal(
  organizationId: string,
  projectId: string,
  goalId: string,
  deletedByUserId: string,
): Promise<void> {
  await ensureFirestoreOrm();
  return deleteGoalInOrganization(organizationId, projectId, goalId, deletedByUserId);
}

interface CreateWinRuleInput {
  organizationId: string;
  projectId: string;
  name: string;
  schemaName: string;
  filters: readonly WinRuleFilter[];
  winType?: string;
  createdByUserId: string;
}

export async function createWinRule(input: CreateWinRuleInput): Promise<WinRuleModel> {
  await ensureFirestoreOrm();
  return createWinRuleInOrganization(input);
}

interface UpdateWinRuleInput {
  organizationId: string;
  projectId: string;
  winRuleId: string;
  name?: string;
  filters?: readonly WinRuleFilter[];
  winType?: string;
  active?: boolean;
  updatedByUserId: string;
}

export async function updateWinRule(input: UpdateWinRuleInput): Promise<WinRuleModel> {
  await ensureFirestoreOrm();
  return updateWinRuleInOrganization(input);
}

export async function deleteWinRule(
  organizationId: string,
  projectId: string,
  winRuleId: string,
  deletedByUserId: string,
): Promise<void> {
  await ensureFirestoreOrm();
  return deleteWinRuleInOrganization(organizationId, projectId, winRuleId, deletedByUserId);
}

/** A brand-new, unclaimed TV pairing (KAN-67) — called from the fully public `app/api/tv-pairing` route, not `requireOrgPermission`, since the caller is an anonymous TV browser with no org context yet. */
export async function requestTvPairing(): Promise<RequestTvPairingResult> {
  await ensureFirestoreOrm();
  return requestTvPairingInOrganization();
}

export interface ClaimTvPairingInput {
  organizationId: string;
  projectId: string;
  code: string;
  boardIds: string[];
  rotationSeconds: number;
  reducedMotion: boolean;
  label: string;
  claimedByUserId: string;
}

export async function claimTvPairing(input: ClaimTvPairingInput): Promise<TvPairingModel> {
  await ensureFirestoreOrm();
  return claimTvPairingInOrganization(input);
}

export async function revokeTvPairing(
  organizationId: string,
  projectId: string,
  pairingId: string,
  revokedByUserId: string,
): Promise<TvPairingModel> {
  await ensureFirestoreOrm();
  return revokeTvPairingInOrganization({ organizationId, projectId, pairingId, revokedByUserId });
}
