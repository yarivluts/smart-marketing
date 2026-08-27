import 'server-only';
import {
  acceptInvite as acceptInviteForOrganization,
  type AdEditResponsiveSearchAdContent,
  type ApiKeyModel,
  type ApiKeyScope,
  approveAutomationAction as approveAutomationActionInOrganization,
  type AutomationActionModel,
  type AutomationGuardrailPolicyModel,
  type AutomationKillSwitchStatus,
  type AutomationTargetStateModel,
  type CampaignDraft,
  type CampaignDraftKeyword,
  type MetaAdCreativeEditContent,
  type MetaAdSetStatus,
  type MetaAdSetTargetingEdit,
  disengageAutomationKillSwitch as disengageAutomationKillSwitchInOrganization,
  engageAutomationKillSwitch as engageAutomationKillSwitchInOrganization,
  ensureAutomationTargetSeeded as ensureAutomationTargetSeededInOrganization,
  executeAutomationAction as executeAutomationActionInOrganization,
  getAutomationActionTargetId as getAutomationActionTargetIdInOrganization,
  proposeAdEditAction as proposeAdEditActionInOrganization,
  proposeAutomationBudgetChangeAction as proposeAutomationBudgetChangeActionInOrganization,
  proposeCampaignActivationAction as proposeCampaignActivationActionInOrganization,
  proposeCampaignDraftCreateAction as proposeCampaignDraftCreateActionInOrganization,
  proposeKeywordEditAction as proposeKeywordEditActionInOrganization,
  proposeMetaAdCreativeEditAction as proposeMetaAdCreativeEditActionInOrganization,
  proposeMetaAdSetEditAction as proposeMetaAdSetEditActionInOrganization,
  proposeMetaAdSetTargetingEditAction as proposeMetaAdSetTargetingEditActionInOrganization,
  rejectAutomationAction as rejectAutomationActionInOrganization,
  resolveAutomationActionExecutorForTarget as resolveAutomationActionExecutorForTargetInOrganization,
  rollbackAutomationAction as rollbackAutomationActionInOrganization,
  setAutomationGuardrailPolicy as setAutomationGuardrailPolicyInOrganization,
  verifyAutomationAction as verifyAutomationActionInOrganization,
  type BoardModel,
  type BoardTile,
  checkTrackingAlertsForProject as checkTrackingAlertsForProjectInOrganization,
  checkFirmographicCompositionAlertsForProject as checkFirmographicCompositionAlertsForProjectInOrganization,
  completeOnboarding as completeOnboardingInOrganization,
  confirmOnboardingFunnelSteps as confirmOnboardingFunnelStepsInOrganization,
  createBoard as createBoardInOrganization,
  createOrganizationWithOwner,
  createOrgPerson as createOrgPersonInOrganization,
  updateOrgPerson as updateOrgPersonInOrganization,
  createProject as createProjectInOrganization,
  createResourceTemplate as createResourceTemplateInOrganization,
  updateResourceTemplate as updateResourceTemplateInOrganization,
  applyFieldMappingToDelivery as applyFieldMappingToDeliveryInOrganization,
  type ApplyFieldMappingToDeliveryResult,
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
  enableFieldMapping as enableFieldMappingInOrganization,
  enableHookEndpoint as enableHookEndpointInOrganization,
  enablePlugin as enablePluginInOrganization,
  type EnsureTouchpointSchemaRegisteredResult,
  ensureTouchpointSchemaRegistered as ensureTouchpointSchemaRegisteredInOrganization,
  evolveMetricDefinition as evolveMetricDefinitionInOrganization,
  evolveSchemaDefinition as evolveSchemaDefinitionInOrganization,
  type FieldMappingModel,
  getOrCreateOnboardingState as getOrCreateOnboardingStateInOrganization,
  issueMcpAuthorizationCode as issueMcpAuthorizationCodeInOrganization,
  markOnboardingSourceConnected as markOnboardingSourceConnectedInOrganization,
  type McpOAuthGrantModel,
  revokeMcpOAuthGrant as revokeMcpOAuthGrantInOrganization,
  selectOnboardingMetricPack as selectOnboardingMetricPackInOrganization,
  type OnboardingFunnelStep,
  type OnboardingPackKey,
  type OnboardingSourceConnectionMethod,
  type OnboardingStateModel,
  createGoal as createGoalInOrganization,
  updateGoal as updateGoalInOrganization,
  deleteGoal as deleteGoalInOrganization,
  type GoalModel,
  setCampaignTargetBudget as setCampaignTargetBudgetInOrganization,
  deleteCampaignTargetBudget as deleteCampaignTargetBudgetInOrganization,
  type CampaignTargetModel,
  createSegment as createSegmentInOrganization,
  deleteSegment as deleteSegmentInOrganization,
  assignSegmentOwner as assignSegmentOwnerInOrganization,
  updateSegmentStatus as updateSegmentStatusInOrganization,
  suggestSegments as suggestSegmentsInOrganization,
  syncSegmentToCrm as syncSegmentToCrmInOrganization,
  createMetaLookalikeAudience as createMetaLookalikeAudienceInOrganization,
  type MetaLookalikeAudienceModel,
  type SegmentModel,
  type SegmentSuggestion,
  createRepCollectionEntry as createRepCollectionEntryInOrganization,
  updateRepCollectionEntry as updateRepCollectionEntryInOrganization,
  deleteRepCollectionEntry as deleteRepCollectionEntryInOrganization,
  type RepCollectionEntryModel,
  type PluginSinkRunModel,
  createWinRule as createWinRuleInOrganization,
  updateWinRule as updateWinRuleInOrganization,
  deleteWinRule as deleteWinRuleInOrganization,
  type WinRuleFilter,
  type WinRuleModel,
  type HookEndpointModel,
  type HookSignatureMode,
  installBuiltinMetricPack as installBuiltinMetricPackInOrganization,
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
  pushResourceAttachment as pushResourceAttachmentInOrganization,
  registerSchemaDefinition as registerSchemaDefinitionInOrganization,
  removeOrgMember,
  updateMemberRole as updateMemberRoleInOrganization,
  replayFailedPipelineMessagesForProject as replayFailedPipelineMessagesForProjectInOrganization,
  sweepQueuedPipelineMessagesForProject as sweepQueuedPipelineMessagesForProjectInOrganization,
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
  setProjectSessionReplayUrlTemplate as setProjectSessionReplayUrlTemplateInOrganization,
  type ProjectModel,
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
  type ConnectionWriteTier,
  type ResourceAttachmentModel,
  type ResourceKind,
  type ResourceTemplateModel,
  type ResourceTemplateType,
  type SchemaDefModel,
  type SchemaFieldInput,
  setResourceAttachmentWriteTier as setResourceAttachmentWriteTierInOrganization,
  type SharedCredentialModel,
  type TrackingAlertCheckResult,
  checkQualityMixAlertsForProject as checkQualityMixAlertsForProjectInOrganization,
  type QualityMixAlertCheckResult,
  type FirmographicCompositionAlertCheckResult,
  claimTvPairing as claimTvPairingInOrganization,
  requestTvPairing as requestTvPairingInOrganization,
  revokeTvPairing as revokeTvPairingInOrganization,
  type RequestTvPairingResult,
  type TvPairingModel,
} from '@growthos/firebase-orm-models';
import type { SegmentWorkListStatus } from '@growthos/shared';
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
  createdByUserId?: string;
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

interface UpdateMemberRoleInput {
  organizationId: string;
  membershipId: string;
  role: InvitableRole;
  performedByUserId: string;
}

/** Changes a member's role between `org_admin` and `viewer` — see `updateMemberRole`'s doc comment. */
export async function updateMemberRole(input: UpdateMemberRoleInput): Promise<MembershipModel> {
  await ensureFirestoreOrm();
  return updateMemberRoleInOrganization(input.organizationId, input.membershipId, input.role, input.performedByUserId);
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
  actorId: string;
}

export async function setSharedCredentialSecret(input: SetSharedCredentialSecretInput): Promise<SharedCredentialModel> {
  await ensureFirestoreOrm();
  return setSharedCredentialSecretInOrganization(input);
}

interface RotateSharedCredentialSecretKeyInput {
  organizationId: string;
  credentialId: string;
  kms: KmsProvider;
  actorId: string;
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

interface UpdateResourceTemplateInput {
  organizationId: string;
  templateId: string;
  name: string;
  config?: Record<string, unknown>;
  actorId: string;
}

export async function updateResourceTemplate(input: UpdateResourceTemplateInput): Promise<ResourceTemplateModel> {
  await ensureFirestoreOrm();
  return updateResourceTemplateInOrganization(input);
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

interface UpdateOrgPersonInput {
  organizationId: string;
  personId: string;
  name: string;
  email?: string;
  title?: string;
  photoUrl?: string;
  actorId: string;
}

export async function updateOrgPerson(input: UpdateOrgPersonInput): Promise<OrgPersonModel> {
  await ensureFirestoreOrm();
  return updateOrgPersonInOrganization(input);
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

interface PushResourceAttachmentInput {
  organizationId: string;
  projectId: string;
  resourceKind: ResourceKind;
  resourceId: string;
  pushedByUserId: string;
  scopeSelection?: readonly string[];
}

export async function pushResourceAttachment(
  input: PushResourceAttachmentInput,
): Promise<ResourceAttachmentModel> {
  await ensureFirestoreOrm();
  return pushResourceAttachmentInOrganization(input);
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
  actorId: string;
}

export async function detachResource(input: DetachResourceInput): Promise<ResourceAttachmentModel> {
  await ensureFirestoreOrm();
  return detachResourceInOrganization(input);
}

interface SetResourceAttachmentWriteTierInput {
  organizationId: string;
  attachmentId: string;
  tier: ConnectionWriteTier;
  actorId: string;
}

export async function setResourceAttachmentWriteTier(
  input: SetResourceAttachmentWriteTierInput,
): Promise<ResourceAttachmentModel> {
  await ensureFirestoreOrm();
  return setResourceAttachmentWriteTierInOrganization(input);
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

interface IssueMcpAuthorizationCodeInput {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  organizationId: string;
  projectId: string;
  grantedByUserId: string;
}

/** Mints a single-use MCP OAuth authorization code once the consent page's user has approved (KAN-75) — see `mcp-oauth.service.ts`'s own doc comment for the full flow. */
export async function issueMcpAuthorizationCode(
  input: IssueMcpAuthorizationCodeInput,
): Promise<{ code: string }> {
  await ensureFirestoreOrm();
  const { code } = await issueMcpAuthorizationCodeInOrganization(input);
  return { code };
}

interface RevokeMcpOAuthGrantInput {
  organizationId: string;
  projectId: string;
  grantId: string;
  revokedByUserId: string;
}

export async function revokeMcpOAuthGrant(input: RevokeMcpOAuthGrantInput): Promise<McpOAuthGrantModel> {
  await ensureFirestoreOrm();
  return revokeMcpOAuthGrantInOrganization(input);
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

interface EnableHookEndpointInput {
  organizationId: string;
  projectId: string;
  hookEndpointId: string;
  enabledByUserId: string;
}

export async function enableHookEndpoint(input: EnableHookEndpointInput): Promise<HookEndpointModel> {
  await ensureFirestoreOrm();
  return enableHookEndpointInOrganization(input);
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

interface EnableFieldMappingInput {
  organizationId: string;
  projectId: string;
  fieldMappingId: string;
  enabledByUserId: string;
}

export async function enableFieldMapping(input: EnableFieldMappingInput): Promise<FieldMappingModel> {
  await ensureFirestoreOrm();
  return enableFieldMappingInOrganization(input);
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

interface ApplyFieldMappingToDeliveryInput {
  organizationId: string;
  projectId: string;
  fieldMappingId: string;
  hookDeliveryId: string;
  actorId: string;
}

export async function applyFieldMappingToDelivery(input: ApplyFieldMappingToDeliveryInput): Promise<ApplyFieldMappingToDeliveryResult> {
  await ensureFirestoreOrm();
  return applyFieldMappingToDeliveryInOrganization(input);
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

interface SweepQueuedPipelineMessagesInput {
  organizationId: string;
  projectId: string;
  performedByUserId: string;
}

export async function sweepQueuedPipelineMessagesForProject(
  input: SweepQueuedPipelineMessagesInput,
): Promise<DrainPipelineResult> {
  await ensureFirestoreOrm();
  return sweepQueuedPipelineMessagesForProjectInOrganization(
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

interface SetProjectSessionReplayUrlTemplateInput {
  organizationId: string;
  projectId: string;
  template?: string;
  setByUserId: string;
}

export async function setProjectSessionReplayUrlTemplate(
  input: SetProjectSessionReplayUrlTemplateInput,
): Promise<ProjectModel> {
  await ensureFirestoreOrm();
  return setProjectSessionReplayUrlTemplateInOrganization(input);
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

interface CheckQualityMixAlertsInput {
  organizationId: string;
  projectId: string;
  triggeredByUserId: string;
}

/** KAN-83's "check now" mix-shift alert action (same buildable-today posture as `checkTrackingAlertsForProject`, KAN-36) — see `checkQualityMixAlertsForProject`'s own doc comment in `@growthos/firebase-orm-models`. */
export async function checkQualityMixAlertsForProject(input: CheckQualityMixAlertsInput): Promise<QualityMixAlertCheckResult> {
  await ensureFirestoreOrm();
  return checkQualityMixAlertsForProjectInOrganization({
    organizationId: input.organizationId,
    projectId: input.projectId,
    triggeredByUserId: input.triggeredByUserId,
  });
}

interface CheckFirmographicCompositionAlertsInput {
  organizationId: string;
  projectId: string;
  triggeredByUserId: string;
}

export async function checkFirmographicCompositionAlertsForProject(
  input: CheckFirmographicCompositionAlertsInput,
): Promise<FirmographicCompositionAlertCheckResult> {
  await ensureFirestoreOrm();
  return checkFirmographicCompositionAlertsForProjectInOrganization({
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

interface InstallBuiltinMetricPackInput {
  organizationId: string;
  projectId: string;
  pluginId: string;
  installedByUserId: string;
}

/** One-click install for a built-in metric pack — see `installBuiltinMetricPack`'s own doc comment (`metric-pack-dispatch.service.ts`) for why this never needs a manifest version, consented scopes, or config from the caller. */
export async function installBuiltinMetricPack(input: InstallBuiltinMetricPackInput): Promise<PluginInstallModel> {
  await ensureFirestoreOrm();
  return installBuiltinMetricPackInOrganization(input);
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

interface SyncSegmentToCrmInput {
  organizationId: string;
  projectId: string;
  segmentId: string;
  installId: string;
  triggeredByUserId: string;
  kms: KmsProvider;
}

/**
 * Pushes one saved segment's own currently-matching entity rows out to a
 * configured action-type plugin install "right now" (KAN-81, plan `14 §Gap
 * 5`: "export/sync to CRM") — the outbound mirror of `runSourcePluginInstall`.
 */
export async function syncSegmentToCrm(input: SyncSegmentToCrmInput): Promise<PluginSinkRunModel> {
  await ensureFirestoreOrm();
  return syncSegmentToCrmInOrganization(input);
}

interface CreateMetaLookalikeAudienceInput {
  organizationId: string;
  projectId: string;
  installId: string;
  name: string;
  country: string;
  ratio: number;
  createdByUserId: string;
  kms: KmsProvider;
}

/**
 * Creates a Meta Lookalike Audience seeded from a Meta Custom Audience
 * install's own already-synced Custom Audience (KAN-73 follow-up, plan `13
 * §E21.3`'s own "Custom/Lookalike audience creation from GrowthOS segments"
 * bullet).
 */
export async function createMetaLookalikeAudience(input: CreateMetaLookalikeAudienceInput): Promise<MetaLookalikeAudienceModel> {
  await ensureFirestoreOrm();
  return createMetaLookalikeAudienceInOrganization(input);
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

export async function deleteBoard(organizationId: string, projectId: string, boardId: string, deletedByUserId: string): Promise<void> {
  await ensureFirestoreOrm();
  return deleteBoardInOrganization(organizationId, projectId, boardId, deletedByUserId);
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

/** Updates a goal's own target value (or range) — the PATCH commit path the goals table's inline target cell fires on blur. */
export async function updateGoal(
  organizationId: string,
  projectId: string,
  goalId: string,
  fields: { targetValue?: number; rangeMin?: number; rangeMax?: number },
  updatedByUserId: string,
): Promise<GoalModel> {
  await ensureFirestoreOrm();
  return updateGoalInOrganization({ organizationId, projectId, goalId, ...fields, updatedByUserId });
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

interface CreateSegmentInput {
  organizationId: string;
  projectId: string;
  name: string;
  schemaName: string;
  filters: readonly unknown[];
  eventConditions?: readonly unknown[];
  createdByUserId: string;
}

/** Creates a segment (KAN-76) via this app's own session-authenticated route — always `actorType: 'user'` (the service default), distinct from the MCP `create_segment` tool's API-key path. */
export async function createSegment(input: CreateSegmentInput): Promise<SegmentModel> {
  await ensureFirestoreOrm();
  return createSegmentInOrganization(input);
}

export async function deleteSegment(organizationId: string, projectId: string, segmentId: string, deletedByUserId: string): Promise<void> {
  await ensureFirestoreOrm();
  return deleteSegmentInOrganization(organizationId, projectId, segmentId, deletedByUserId);
}

/** Assigns (or clears, with `ownerPersonId: null`) a segment's work-list owner (KAN-81). */
export async function assignSegmentOwner(
  organizationId: string,
  projectId: string,
  segmentId: string,
  ownerPersonId: string | null,
  actorUserId: string,
): Promise<SegmentModel> {
  await ensureFirestoreOrm();
  return assignSegmentOwnerInOrganization({ organizationId, projectId, segmentId, ownerPersonId, actorUserId });
}

/** Ticks a segment's work-list status (KAN-81). */
export async function updateSegmentStatus(
  organizationId: string,
  projectId: string,
  segmentId: string,
  status: SegmentWorkListStatus,
  actorUserId: string,
): Promise<SegmentModel> {
  await ensureFirestoreOrm();
  return updateSegmentStatusInOrganization({ organizationId, projectId, segmentId, status, actorUserId });
}

interface CreateRepCollectionEntryInput {
  organizationId: string;
  projectId: string;
  orgPersonId: string | null;
  company: string;
  collectionType: string;
  planFrom?: string | null;
  planTo?: string | null;
  amount: number;
  occurredAt: string;
  note?: string | null;
  sourceRawRecordId?: string | null;
  createdByUserId: string;
}

/** Logs one entry to the rep-attributed collections ledger (KAN-88). */
export async function createRepCollectionEntry(input: CreateRepCollectionEntryInput): Promise<RepCollectionEntryModel> {
  await ensureFirestoreOrm();
  return createRepCollectionEntryInOrganization(input);
}

/** Reassigns the rep and/or corrects the amount on an existing ledger entry (KAN-88) — the inline-edit commit path. */
export async function updateRepCollectionEntry(
  organizationId: string,
  projectId: string,
  entryId: string,
  fields: { orgPersonId?: string | null; amount?: number },
  actorUserId: string,
): Promise<RepCollectionEntryModel> {
  await ensureFirestoreOrm();
  return updateRepCollectionEntryInOrganization({ organizationId, projectId, entryId, ...fields, actorUserId });
}

/** Deletes a ledger entry outright (KAN-88). */
export async function deleteRepCollectionEntry(organizationId: string, projectId: string, entryId: string, actorUserId: string): Promise<void> {
  await ensureFirestoreOrm();
  return deleteRepCollectionEntryInOrganization(organizationId, projectId, entryId, actorUserId);
}

/** Creates or overwrites a campaign's spend budget target, upserted by campaign id (KAN-86). */
export async function setCampaignTargetBudget(
  organizationId: string,
  projectId: string,
  campaignId: string,
  monthlyBudget: number,
  updatedByUserId: string,
): Promise<CampaignTargetModel> {
  await ensureFirestoreOrm();
  return setCampaignTargetBudgetInOrganization({ organizationId, projectId, campaignId, monthlyBudget, updatedByUserId });
}

/** Removes a campaign's spend target (KAN-86) — reverts to "no target", a no-op if none was set. */
export async function deleteCampaignTargetBudget(organizationId: string, projectId: string, campaignId: string): Promise<void> {
  await ensureFirestoreOrm();
  return deleteCampaignTargetBudgetInOrganization(organizationId, projectId, campaignId);
}

interface SuggestSegmentsInput {
  organizationId: string;
  projectId: string;
  schemaName: string;
}

/** Proposes candidate segment definitions for one entity schema (KAN-81, plan `14 §Gap 9` "AI-suggested lists"). Nothing is saved — the admin UI merges a chosen suggestion into the create-segment form's own state, the same "user confirms" posture `suggestFieldMappingRules` (KAN-55) establishes. */
export async function suggestSegments(input: SuggestSegmentsInput): Promise<{ suggestions: readonly SegmentSuggestion[] }> {
  await ensureFirestoreOrm();
  return suggestSegmentsInOrganization(input);
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

/** Starts (or resumes) a project's onboarding wizard (KAN-68) — creates the singleton state doc on first visit. */
export async function startOnboarding(
  organizationId: string,
  projectId: string,
  userId: string,
): Promise<OnboardingStateModel> {
  await ensureFirestoreOrm();
  return getOrCreateOnboardingStateInOrganization(organizationId, projectId, userId);
}

export interface SelectOnboardingMetricPackInput {
  organizationId: string;
  projectId: string;
  userId: string;
  packKey: OnboardingPackKey;
}

/** The wizard's "pick a vertical/metric pack" step. */
export async function selectOnboardingMetricPack(input: SelectOnboardingMetricPackInput): Promise<OnboardingStateModel> {
  await ensureFirestoreOrm();
  return selectOnboardingMetricPackInOrganization(input);
}

export interface MarkOnboardingSourceConnectedInput {
  organizationId: string;
  projectId: string;
  userId: string;
  method: OnboardingSourceConnectionMethod;
  pluginId?: string;
}

/** The wizard's "connect a first source" step. */
export async function markOnboardingSourceConnected(input: MarkOnboardingSourceConnectedInput): Promise<OnboardingStateModel> {
  await ensureFirestoreOrm();
  return markOnboardingSourceConnectedInOrganization(input);
}

export interface ConfirmOnboardingFunnelStepsInput {
  organizationId: string;
  projectId: string;
  userId: string;
  steps: readonly OnboardingFunnelStep[];
}

/** The wizard's "confirm the AI-proposed funnel mapping" step. */
export async function confirmOnboardingFunnelSteps(input: ConfirmOnboardingFunnelStepsInput): Promise<OnboardingStateModel> {
  await ensureFirestoreOrm();
  return confirmOnboardingFunnelStepsInOrganization(input);
}

/** The wizard's final "done" step. */
export async function completeOnboarding(
  organizationId: string,
  projectId: string,
  userId: string,
): Promise<OnboardingStateModel> {
  await ensureFirestoreOrm();
  return completeOnboardingInOrganization({ organizationId, projectId, userId });
}

interface SetAutomationGuardrailPolicyInput {
  organizationId: string;
  projectId: string;
  maxDailyBudgetChangePct: number | null;
  spendCeilingUsd: number | null;
  protectedTargetIds: string[];
  allowedHours: { startHourUtc: number; endHourUtc: number } | null;
  maxActionsPerDay: number | null;
  maxGuardedMetricRegressionPct: number | null;
  setByUserId: string;
}

export async function setAutomationGuardrailPolicy(input: SetAutomationGuardrailPolicyInput): Promise<AutomationGuardrailPolicyModel> {
  await ensureFirestoreOrm();
  return setAutomationGuardrailPolicyInOrganization(input);
}

interface EngageAutomationKillSwitchInput {
  organizationId: string;
  reason: string;
  actorId: string;
}

export async function engageAutomationKillSwitch(input: EngageAutomationKillSwitchInput): Promise<AutomationKillSwitchStatus> {
  await ensureFirestoreOrm();
  return engageAutomationKillSwitchInOrganization(input);
}

export async function disengageAutomationKillSwitch(organizationId: string, actorId: string): Promise<AutomationKillSwitchStatus> {
  await ensureFirestoreOrm();
  return disengageAutomationKillSwitchInOrganization({ organizationId, actorId });
}

interface SeedAutomationTargetInput {
  organizationId: string;
  projectId: string;
  environmentId: string;
  targetId: string;
  targetType: string;
  label: string;
  initialDailyBudgetUsd: number;
  seededByUserId: string;
  resourceAttachmentId?: string;
}

export async function ensureAutomationTargetSeeded(input: SeedAutomationTargetInput): Promise<AutomationTargetStateModel> {
  await ensureFirestoreOrm();
  return ensureAutomationTargetSeededInOrganization(input);
}

interface ProposeAutomationBudgetChangeInput {
  organizationId: string;
  projectId: string;
  targetId: string;
  afterDailyBudgetUsd: number;
  requestedByUserId: string;
}

export async function proposeAutomationBudgetChangeAction(input: ProposeAutomationBudgetChangeInput): Promise<AutomationActionModel> {
  await ensureFirestoreOrm();
  return proposeAutomationBudgetChangeActionInOrganization(input);
}

interface ProposeCampaignDraftCreateInput {
  organizationId: string;
  projectId: string;
  targetId: string;
  draft: CampaignDraft;
  requestedByUserId: string;
}

export async function proposeCampaignDraftCreateAction(input: ProposeCampaignDraftCreateInput): Promise<AutomationActionModel> {
  await ensureFirestoreOrm();
  return proposeCampaignDraftCreateActionInOrganization(input);
}

interface ProposeCampaignActivationInput {
  organizationId: string;
  projectId: string;
  targetId: string;
  requestedByUserId: string;
}

export async function proposeCampaignActivationAction(input: ProposeCampaignActivationInput): Promise<AutomationActionModel> {
  await ensureFirestoreOrm();
  return proposeCampaignActivationActionInOrganization(input);
}

interface ProposeKeywordEditInput {
  organizationId: string;
  projectId: string;
  targetId: string;
  adGroupResourceName: string;
  addKeywords: CampaignDraftKeyword[];
  addNegativeKeywords: CampaignDraftKeyword[];
  requestedByUserId: string;
}

export async function proposeKeywordEditAction(input: ProposeKeywordEditInput): Promise<AutomationActionModel> {
  await ensureFirestoreOrm();
  return proposeKeywordEditActionInOrganization(input);
}

interface ProposeAdEditInput {
  organizationId: string;
  projectId: string;
  targetId: string;
  previousAdResourceName: string;
  responsiveSearchAd: AdEditResponsiveSearchAdContent;
  requestedByUserId: string;
}

export async function proposeAdEditAction(input: ProposeAdEditInput): Promise<AutomationActionModel> {
  await ensureFirestoreOrm();
  return proposeAdEditActionInOrganization(input);
}

interface ProposeMetaAdSetEditInput {
  organizationId: string;
  projectId: string;
  targetId: string;
  adSetResourceName: string;
  dailyBudgetUsd?: number;
  status?: MetaAdSetStatus;
  requestedByUserId: string;
}

export async function proposeMetaAdSetEditAction(input: ProposeMetaAdSetEditInput): Promise<AutomationActionModel> {
  await ensureFirestoreOrm();
  return proposeMetaAdSetEditActionInOrganization(input);
}

interface ProposeMetaAdSetTargetingEditInput {
  organizationId: string;
  projectId: string;
  targetId: string;
  adSetResourceName: string;
  targeting: MetaAdSetTargetingEdit;
  requestedByUserId: string;
}

export async function proposeMetaAdSetTargetingEditAction(input: ProposeMetaAdSetTargetingEditInput): Promise<AutomationActionModel> {
  await ensureFirestoreOrm();
  return proposeMetaAdSetTargetingEditActionInOrganization(input);
}

interface ProposeMetaAdCreativeEditInput {
  organizationId: string;
  projectId: string;
  targetId: string;
  adResourceName: string;
  creative: MetaAdCreativeEditContent;
  requestedByUserId: string;
}

export async function proposeMetaAdCreativeEditAction(input: ProposeMetaAdCreativeEditInput): Promise<AutomationActionModel> {
  await ensureFirestoreOrm();
  return proposeMetaAdCreativeEditActionInOrganization(input);
}

export async function approveAutomationAction(
  organizationId: string,
  projectId: string,
  actionId: string,
  approverId: string,
): Promise<AutomationActionModel> {
  await ensureFirestoreOrm();
  return approveAutomationActionInOrganization({ organizationId, projectId, actionId, approverId });
}

export async function rejectAutomationAction(
  organizationId: string,
  projectId: string,
  actionId: string,
  rejectedByUserId: string,
): Promise<AutomationActionModel> {
  await ensureFirestoreOrm();
  return rejectAutomationActionInOrganization({ organizationId, projectId, actionId, rejectedByUserId });
}

export async function executeAutomationAction(
  organizationId: string,
  projectId: string,
  actionId: string,
  executedByUserId: string,
  kms?: KmsProvider,
): Promise<AutomationActionModel> {
  await ensureFirestoreOrm();
  const targetId = await getAutomationActionTargetIdInOrganization(organizationId, projectId, actionId);
  const executor = await resolveAutomationActionExecutorForTargetInOrganization(organizationId, projectId, targetId, kms);
  return executeAutomationActionInOrganization({ organizationId, projectId, actionId, executedByUserId, executor });
}

interface VerifyAutomationActionInput {
  organizationId: string;
  projectId: string;
  actionId: string;
  verifiedByUserId: string;
  guardedMetricBefore?: number;
  guardedMetricAfter?: number;
  kms?: KmsProvider;
}

/** Resolves the same real-vs-simulated executor `execute`/`rollback` do — verify's own auto-rollback-on-regression path needs it too (KAN-72), so a regression on a real Google Ads campaign actually rolls back the live campaign, not just the Firestore stand-in. */
export async function verifyAutomationAction(input: VerifyAutomationActionInput): Promise<AutomationActionModel> {
  await ensureFirestoreOrm();
  const { kms, ...rest } = input;
  const targetId = await getAutomationActionTargetIdInOrganization(input.organizationId, input.projectId, input.actionId);
  const executor = await resolveAutomationActionExecutorForTargetInOrganization(input.organizationId, input.projectId, targetId, kms);
  return verifyAutomationActionInOrganization({ ...rest, executor });
}

export async function rollbackAutomationAction(
  organizationId: string,
  projectId: string,
  actionId: string,
  actorId: string,
  kms?: KmsProvider,
): Promise<AutomationActionModel> {
  await ensureFirestoreOrm();
  const targetId = await getAutomationActionTargetIdInOrganization(organizationId, projectId, actionId);
  const executor = await resolveAutomationActionExecutorForTargetInOrganization(organizationId, projectId, targetId, kms);
  return rollbackAutomationActionInOrganization({ organizationId, projectId, actionId, reason: 'manual', actorId, executor });
}
