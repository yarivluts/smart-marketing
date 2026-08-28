import 'server-only';
import { cache } from 'react';
import {
  checkProjectQueryQuota as checkProjectQueryQuotaInOrganization,
  countSegmentMembers as countSegmentMembersInOrganization,
  resolveDefaultQueryEnvironment as resolveDefaultQueryEnvironmentInOrganization,
  getActiveAutomationGuardrailPolicy as getActiveAutomationGuardrailPolicyInOrganization,
  getAutomationKillSwitchStatus as getAutomationKillSwitchStatusInOrganization,
  getBoard as getBoardInOrganization,
  getCancellationReasonCodeBreakdownForProject as getCancellationReasonCodeBreakdownForProjectInOrganization,
  getCancellationReasonDimensionBreakdownForProject as getCancellationReasonDimensionBreakdownForProjectInOrganization,
  getCancellationReasonThemeDigestForProject as getCancellationReasonThemeDigestForProjectInOrganization,
  listCancellationReasonRecordsForProject as listCancellationReasonRecordsForProjectInOrganization,
  type CancellationReasonBreakdownDimension,
  type CancellationReasonDimensionBreakdownOutcome,
  getSignupQualityScoreOverviewForProject as getSignupQualityScoreOverviewForProjectInOrganization,
  getSignupQualityScoreDimensionBreakdownForProject as getSignupQualityScoreDimensionBreakdownForProjectInOrganization,
  getSignupQualityScoreAdjustedMetricsForProject as getSignupQualityScoreAdjustedMetricsForProjectInOrganization,
  listOnboardingSurveyRecordsForProject as listOnboardingSurveyRecordsForProjectInOrganization,
  listActiveQualityMixAlertsForProject as listActiveQualityMixAlertsForProjectInOrganization,
  listQualityMixAlertsForProject as listQualityMixAlertsForProjectInOrganization,
  type SignupQualityScoreBreakdownDimension,
  type SignupQualityScoreQueryOutcome,
  type SignupQualityScoreAdjustedMetricsOutcome,
  type QualityMixAlertModel,
  getFirmographicIndustryBreakdownForProject as getFirmographicIndustryBreakdownForProjectInOrganization,
  getFirmographicCompositionDimensionBreakdownForProject as getFirmographicCompositionDimensionBreakdownForProjectInOrganization,
  listFirmographicRecordsForProject as listFirmographicRecordsForProjectInOrganization,
  listFirmographicCompositionAlertsForProject as listFirmographicCompositionAlertsForProjectInOrganization,
  type FirmographicBreakdownDimension,
  type FirmographicQueryOutcome,
  type FirmographicCompositionAlertModel,
  getCampaignSpendBreakdownForProject as getCampaignSpendBreakdownForProjectInOrganization,
  getCampaignPaybackBreakdownForProject as getCampaignPaybackBreakdownForProjectInOrganization,
  getPaybackOverviewForProject as getPaybackOverviewForProjectInOrganization,
  getQualityCalibrationBreakdownForProject as getQualityCalibrationBreakdownForProjectInOrganization,
  listCampaignTargetsForProject as listCampaignTargetsForProjectInOrganization,
  type CampaignSpendBreakdownOutcome,
  type CampaignPaybackBreakdownOutcome,
  type CampaignTargetModel,
  type PaybackOverviewOutcome,
  type QualityCalibrationBreakdownOutcome,
  getExperimentResultsForProject as getExperimentResultsForProjectInOrganization,
  type ExperimentResultsOutcome,
  getSupportLeaderboardForProject as getSupportLeaderboardForProjectInOrganization,
  type SupportLeaderboardResult,
  getDemoFunnelForProject as getDemoFunnelForProjectInOrganization,
  type DemoFunnelResult,
  getEventVolumeOverviewForProject as getEventVolumeOverviewForProjectInOrganization,
  getFeedbackThemeDigestForProject as getFeedbackThemeDigestForProjectInOrganization,
  getGoal as getGoalInOrganization,
  getNpsOverviewForProject as getNpsOverviewForProjectInOrganization,
  getNpsDimensionBreakdownForProject as getNpsDimensionBreakdownForProjectInOrganization,
  listSurveyResponseRecordsForProject as listSurveyResponseRecordsForProjectInOrganization,
  type NpsOverview,
  type NpsBreakdownDimension,
  type NpsDimensionBreakdownOutcome,
  getOnboardingState as getOnboardingStateInOrganization,
  getProjectCostQuota as getProjectCostQuotaInOrganization,
  getTrialPipelineSummary as getTrialPipelineSummaryInOrganization,
  listTrackingAlertsForProject as listTrackingAlertsForProjectInOrganization,
  type ApiKeySummary,
  type McpOAuthGrantSummary,
  type BoardModel,
  type BoardTile,
  type EnvironmentModel,
  type EventVolumeOverviewEntry,
  type FieldMappingModel,
  type GoalModel,
  type GoalProgressOutcome,
  type HookDeliveryModel,
  type HookEndpointModel,
  listActiveAttachmentsForProject as listActiveAttachmentsForProjectInOrganization,
  listApiKeysForProject as listApiKeysForProjectInOrganization,
  listAttachmentsForProject as listAttachmentsForProjectInOrganization,
  listAuditLogEntriesForOrg as listAuditLogEntriesForOrgInOrganization,
  listAutomationActionsForProject as listAutomationActionsForProjectInOrganization,
  listAutomationActionsForTarget as listAutomationActionsForTargetInOrganization,
  listAutomationTargetStatesForProject as listAutomationTargetStatesForProjectInOrganization,
  listBoardsForProject as listBoardsForProjectInOrganization,
  listEnvironmentsForProject as listEnvironmentsForProjectInOrganization,
  listFailedPipelineMessagesForProject as listFailedPipelineMessagesForProjectInOrganization,
  listQueuedPipelineMessagesForProject as listQueuedPipelineMessagesForProjectInOrganization,
  listFieldMappingsForProject as listFieldMappingsForProjectInOrganization,
  listGoalsForProject as listGoalsForProjectInOrganization,
  listHookDeliveriesForProject as listHookDeliveriesForProjectInOrganization,
  listHookEndpointsForProject as listHookEndpointsForProjectInOrganization,
  listMcpOAuthGrantsForProject as listMcpOAuthGrantsForProjectInOrganization,
  listMetricDefinitionsForProject as listMetricDefinitionsForProjectInOrganization,
  listMetricsCatalogForProject as listMetricsCatalogForProjectInOrganization,
  listOrgMembersWithProfiles,
  listOrchestrationRunsForProject as listOrchestrationRunsForProjectInOrganization,
  getWarehouseFreshnessForProject as getWarehouseFreshnessForProjectInOrganization,
  type WarehouseFreshnessResult,
  listOrgPeople as listOrgPeopleInOrganization,
  listOrgProjects as listOrgProjectsForOrganization,
  listBuiltinMetricPacks,
  listOnboardingMetricPacks,
  listPendingAttachmentsForOrg as listPendingAttachmentsForOrgInOrganization,
  listActionPluginInstallsForProject as listActionPluginInstallsForProjectInOrganization,
  listCrmSyncRunsForSegment as listCrmSyncRunsForSegmentInOrganization,
  listMetaLookalikeAudiencesForInstall as listMetaLookalikeAudiencesForInstallInOrganization,
  listPluginInstallsForProject as listPluginInstallsForProjectInOrganization,
  listPluginManifestsForOrg as listPluginManifestsForOrgInOrganization,
  listQuarantinedRecordsForProject as listQuarantinedRecordsForProjectInOrganization,
  listRecentBillingEventsForProject as listRecentBillingEventsForProjectInOrganization,
  listRecentChurnedSubscriptionsForProject as listRecentChurnedSubscriptionsForProjectInOrganization,
  listRecentDunningSubscriptionsForProject as listRecentDunningSubscriptionsForProjectInOrganization,
  listRecentRecordsForSchemas as listRecentRecordsForSchemasInOrganization,
  type RawRecordModel,
  type RecordFieldFilter,
  type SchemaDefKind,
  listSourcePluginRunsForInstall as listSourcePluginRunsForInstallInOrganization,
  listQueryCostLogEntriesForProject as listQueryCostLogEntriesForProjectInOrganization,
  listRecentIngestBatchesForProject as listRecentIngestBatchesForProjectInOrganization,
  requireRegisteredRedirectUri as requireRegisteredRedirectUriInOrganization,
  listResourceTemplates as listResourceTemplatesInOrganization,
  listSchemaDefinitionsForProject as listSchemaDefinitionsForProjectInOrganization,
  listSegmentsForProject as listSegmentsForProjectInOrganization,
  listSegmentMembers as listSegmentMembersInOrganization,
  listSharedCredentials as listSharedCredentialsInOrganization,
  listRepCollectionEntriesForProject as listRepCollectionEntriesForProjectInOrganization,
  getRepCollectionLeaderboardForProject as getRepCollectionLeaderboardForProjectInOrganization,
  listBillingCollectionSignalsForProject as listBillingCollectionSignalsForProjectInOrganization,
  type RepCollectionEntryModel,
  type RepCollectionLeaderboardPeriod,
  type RepCollectionLeaderboardResult,
  type RepCollectionBillingSignal,
  MembershipModel,
  OrganizationModel,
  proposeOnboardingFunnelSteps as proposeOnboardingFunnelStepsInOrganization,
  queryBoardTile as queryBoardTileInOrganization,
  queryBoardTiles as queryBoardTilesInOrganization,
  queryGoalProgress as queryGoalProgressInOrganization,
  queryProjectFunnelStepsForAdmin as queryProjectFunnelStepsForAdminInOrganization,
  type FunnelStepsOutcome,
  listProjectInsights as listProjectInsightsInOrganization,
  type ProjectInsight,
  UserModel,
  verifyAuditLogChainForOrg as verifyAuditLogChainForOrgInOrganization,
  type AuditLogChainVerification,
  type AuditLogEntryModel,
  type AutomationActionModel,
  type AutomationGuardrailPolicyConfig,
  type AutomationKillSwitchStatus,
  type AutomationTargetStateModel,
  type BoardTileQueryOutcome,
  type IngestBatchModel,
  type MembershipStatus,
  type MetricCatalogEntry,
  type MetricDefModel,
  type OnboardingStateModel,
  type OrchestrationRunModel,
  type OrgMemberSummary,
  type OrgPersonModel,
  type MetaLookalikeAudienceModel,
  type PipelineMessageModel,
  type PluginInstallModel,
  type PluginSinkRunModel,
  type PluginManifestModel,
  type PluginSourceRunModel,
  type ProjectCostQuota,
  type ProjectModel,
  type ProjectQueryQuotaStatus,
  type QuarantinedRecordModel,
  type QueryCostLogEntryModel,
  type ResourceAttachmentModel,
  type ResourceKind,
  type ResourceTemplateModel,
  type Role,
  type SchemaDefModel,
  searchProjectCustomersForAdmin as searchProjectCustomersForAdminInOrganization,
  type CustomerSearchOutcome,
  queryProjectCohortRetentionForAdmin as queryProjectCohortRetentionForAdminInOrganization,
  type CohortRetentionOutcome,
  type SegmentMemberCountOutcome,
  type SegmentMemberListOutcome,
  type SegmentModel,
  type SharedCredentialModel,
  type TrackingAlertModel,
  type TrialPipelineOutcome,
  listWinRulesForProject as listWinRulesForProjectInOrganization,
  listRecentWinEventsForProject as listRecentWinEventsForProjectInOrganization,
  listWinEventsSince as listWinEventsSinceInOrganization,
  activeSchemaNamesForKind,
  getTvPairingStatus as getTvPairingStatusForOrganization,
  listTvPairingsForProject as listTvPairingsForProjectInOrganization,
  requireClaimedTvPairing as requireClaimedTvPairingForOrganization,
  type TvPairingModel,
  type TvPairingStatus,
  type WinEventModel,
  type WinRuleModel,
} from '@growthos/firebase-orm-models';
import type {
  CancellationReasonCodeCount,
  CancellationReasonThemeCluster,
  FeedbackThemeCluster,
  FirmographicIndustryCount,
  FunnelStepSuggestion,
  Result,
  SignupQualityScoreDistribution,
} from '@growthos/shared';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';

export async function listOrgMembers(organizationId: string): Promise<OrgMemberSummary[]> {
  await ensureFirestoreOrm();
  return listOrgMembersWithProfiles(organizationId);
}

/** Loads one org's own record (name/slug/billing_email) for the org settings page, or `null` if it doesn't exist. */
export async function getOrganization(organizationId: string): Promise<OrganizationModel | null> {
  await ensureFirestoreOrm();
  return OrganizationModel.init(organizationId);
}

/**
 * Wrapped in React's `cache()` — the project-level nav shell's `layout.tsx`
 * and every project `page.tsx` it wraps each call this independently for the
 * same request. See `getServerSession`'s own doc comment for why that
 * duplication matters here specifically (concurrent-request gRPC stream
 * corruption against the Firestore emulator, found via PR #88's CI run).
 */
export const listOrgProjects = cache(async (organizationId: string): Promise<ProjectModel[]> => {
  await ensureFirestoreOrm();
  return listOrgProjectsForOrganization(organizationId);
});

/** Validates a `(client_id, redirect_uri)` pair against a registered MCP OAuth client (KAN-75) — throws `InvalidMcpOAuthClientError` otherwise. Used by the consent POST route before it builds any redirect through `redirect_uri`, so an unvalidated value can never become an open-redirect target. */
export async function requireRegisteredMcpRedirectUri(clientId: string, redirectUri: string): Promise<void> {
  await ensureFirestoreOrm();
  await requireRegisteredRedirectUriInOrganization(clientId, redirectUri);
}

export async function listSharedCredentials(organizationId: string): Promise<SharedCredentialModel[]> {
  await ensureFirestoreOrm();
  return listSharedCredentialsInOrganization(organizationId);
}

export async function listResourceTemplates(organizationId: string): Promise<ResourceTemplateModel[]> {
  await ensureFirestoreOrm();
  return listResourceTemplatesInOrganization(organizationId);
}

export async function listOrgPeople(organizationId: string): Promise<OrgPersonModel[]> {
  await ensureFirestoreOrm();
  return listOrgPeopleInOrganization(organizationId);
}

export async function listAttachmentsForProject(
  organizationId: string,
  projectId: string,
): Promise<ResourceAttachmentModel[]> {
  await ensureFirestoreOrm();
  return listAttachmentsForProjectInOrganization(organizationId, projectId);
}

export async function listActiveAttachmentsForProject(
  organizationId: string,
  projectId: string,
): Promise<ResourceAttachmentModel[]> {
  await ensureFirestoreOrm();
  return listActiveAttachmentsForProjectInOrganization(organizationId, projectId);
}

export async function listPendingAttachmentsForOrg(organizationId: string): Promise<ResourceAttachmentModel[]> {
  await ensureFirestoreOrm();
  return listPendingAttachmentsForOrgInOrganization(organizationId);
}

export async function listEnvironmentsForProject(
  organizationId: string,
  projectId: string,
): Promise<EnvironmentModel[]> {
  await ensureFirestoreOrm();
  return listEnvironmentsForProjectInOrganization(organizationId, projectId);
}

/** The project's `prod` environment, or its first if none is named `prod`, or `null` if it has none yet. */
export async function resolveDefaultQueryEnvironment(organizationId: string, projectId: string): Promise<EnvironmentModel | null> {
  await ensureFirestoreOrm();
  return resolveDefaultQueryEnvironmentInOrganization(organizationId, projectId);
}

export async function listApiKeysForProject(organizationId: string, projectId: string): Promise<ApiKeySummary[]> {
  await ensureFirestoreOrm();
  return listApiKeysForProjectInOrganization(organizationId, projectId);
}

/** Every MCP OAuth connection granted for a project (KAN-75) — the Keys page's "MCP connections" section. */
export async function listMcpOAuthGrantsForProject(organizationId: string, projectId: string): Promise<McpOAuthGrantSummary[]> {
  await ensureFirestoreOrm();
  return listMcpOAuthGrantsForProjectInOrganization(organizationId, projectId);
}

export async function listHookEndpointsForProject(organizationId: string, projectId: string): Promise<HookEndpointModel[]> {
  await ensureFirestoreOrm();
  return listHookEndpointsForProjectInOrganization(organizationId, projectId);
}

export async function listHookDeliveriesForProject(organizationId: string, projectId: string): Promise<HookDeliveryModel[]> {
  await ensureFirestoreOrm();
  return listHookDeliveriesForProjectInOrganization(organizationId, projectId);
}

export async function listFieldMappingsForProject(organizationId: string, projectId: string): Promise<FieldMappingModel[]> {
  await ensureFirestoreOrm();
  return listFieldMappingsForProjectInOrganization(organizationId, projectId);
}

export async function listSchemaDefinitionsForProject(
  organizationId: string,
  projectId: string,
): Promise<SchemaDefModel[]> {
  await ensureFirestoreOrm();
  return listSchemaDefinitionsForProjectInOrganization(organizationId, projectId);
}

export async function listMetricDefinitionsForProject(
  organizationId: string,
  projectId: string,
): Promise<MetricDefModel[]> {
  await ensureFirestoreOrm();
  return listMetricDefinitionsForProjectInOrganization(organizationId, projectId);
}

export async function listRecentIngestBatchesForProject(
  organizationId: string,
  projectId: string,
  limit?: number,
): Promise<IngestBatchModel[]> {
  await ensureFirestoreOrm();
  return listRecentIngestBatchesForProjectInOrganization(organizationId, projectId, limit);
}

export async function listQuarantinedRecordsForProject(
  organizationId: string,
  projectId: string,
  limit?: number,
): Promise<QuarantinedRecordModel[]> {
  await ensureFirestoreOrm();
  return listQuarantinedRecordsForProjectInOrganization(organizationId, projectId, limit);
}

export async function listRecentBillingEventsForProject(
  organizationId: string,
  projectId: string,
  limit?: number,
): Promise<RawRecordModel[]> {
  await ensureFirestoreOrm();
  return listRecentBillingEventsForProjectInOrganization(organizationId, projectId, limit);
}

/** The generic, single-schema record feed (KAN-81) — a project-scoped view of any registered schema's recently landed records, optionally restricted to records matching one field's exact value. */
export async function listRecentRecordsForSchema(
  organizationId: string,
  projectId: string,
  kind: SchemaDefKind,
  schemaName: string,
  fieldFilter?: RecordFieldFilter,
): Promise<RawRecordModel[]> {
  await ensureFirestoreOrm();
  return listRecentRecordsForSchemasInOrganization({ organizationId, projectId, kind, schemaNames: [schemaName], fieldFilter });
}

export async function listRecentChurnedSubscriptionsForProject(
  organizationId: string,
  projectId: string,
  limit?: number,
): Promise<RawRecordModel[]> {
  await ensureFirestoreOrm();
  return listRecentChurnedSubscriptionsForProjectInOrganization(organizationId, projectId, limit);
}

export async function listRecentDunningSubscriptionsForProject(
  organizationId: string,
  projectId: string,
  limit?: number,
): Promise<RawRecordModel[]> {
  await ensureFirestoreOrm();
  return listRecentDunningSubscriptionsForProjectInOrganization(organizationId, projectId, limit);
}

export async function listFailedPipelineMessagesForProject(
  organizationId: string,
  projectId: string,
  limit?: number,
): Promise<PipelineMessageModel[]> {
  await ensureFirestoreOrm();
  return listFailedPipelineMessagesForProjectInOrganization(organizationId, projectId, limit);
}

export async function listQueuedPipelineMessagesForProject(
  organizationId: string,
  projectId: string,
  limit?: number,
): Promise<PipelineMessageModel[]> {
  await ensureFirestoreOrm();
  return listQueuedPipelineMessagesForProjectInOrganization(organizationId, projectId, limit);
}

export async function listAuditLogEntriesForOrg(organizationId: string, limit?: number): Promise<AuditLogEntryModel[]> {
  await ensureFirestoreOrm();
  return listAuditLogEntriesForOrgInOrganization(organizationId, limit);
}

export async function listOrchestrationRunsForProject(
  organizationId: string,
  projectId: string,
  limit?: number,
): Promise<OrchestrationRunModel[]> {
  await ensureFirestoreOrm();
  return listOrchestrationRunsForProjectInOrganization(organizationId, projectId, limit);
}

export async function getWarehouseFreshnessForProject(params: {
  organizationId: string;
  projectId: string;
}): Promise<WarehouseFreshnessResult> {
  await ensureFirestoreOrm();
  return getWarehouseFreshnessForProjectInOrganization(params);
}

export async function verifyAuditLogChainForOrg(organizationId: string): Promise<AuditLogChainVerification> {
  await ensureFirestoreOrm();
  return verifyAuditLogChainForOrgInOrganization(organizationId);
}

export async function getProjectCostQuota(organizationId: string, projectId: string): Promise<ProjectCostQuota> {
  await ensureFirestoreOrm();
  return getProjectCostQuotaInOrganization(organizationId, projectId);
}

/** `precomputedQuota` skips a redundant re-fetch of the same quota config for a caller (e.g. the cost-guardrails page) that already loaded it via `getProjectCostQuota`. */
export async function checkProjectQueryQuota(
  organizationId: string,
  projectId: string,
  precomputedQuota?: ProjectCostQuota,
): Promise<ProjectQueryQuotaStatus> {
  await ensureFirestoreOrm();
  return checkProjectQueryQuotaInOrganization(organizationId, projectId, undefined, precomputedQuota);
}

export async function getEventVolumeOverviewForProject(
  organizationId: string,
  projectId: string,
  options?: { precomputedSchemaDefs?: SchemaDefModel[] },
): Promise<EventVolumeOverviewEntry[]> {
  await ensureFirestoreOrm();
  return getEventVolumeOverviewForProjectInOrganization(organizationId, projectId, options);
}

export async function getNpsOverviewForProject(
  organizationId: string,
  projectId: string,
  options?: { limit?: number; windowDays?: number; precomputedRecords?: RawRecordModel[] },
): Promise<NpsOverview> {
  await ensureFirestoreOrm();
  return getNpsOverviewForProjectInOrganization(organizationId, projectId, options);
}

export async function getFeedbackThemeDigestForProject(
  organizationId: string,
  projectId: string,
  options?: { limit?: number; windowDays?: number; precomputedRecords?: RawRecordModel[] },
): Promise<FeedbackThemeCluster[]> {
  await ensureFirestoreOrm();
  return getFeedbackThemeDigestForProjectInOrganization(organizationId, projectId, options);
}

export async function getNpsDimensionBreakdownForProject(
  organizationId: string,
  projectId: string,
  dimension: NpsBreakdownDimension,
): Promise<NpsDimensionBreakdownOutcome> {
  await ensureFirestoreOrm();
  return getNpsDimensionBreakdownForProjectInOrganization(organizationId, projectId, dimension);
}

/** The bounded, landed `survey_response` raw records `getNpsOverviewForProject`/`getFeedbackThemeDigestForProject` each read — fetch once via this and pass the result to both via `precomputedRecords` (the Feedback page's own posture) rather than paying for the same bounded read twice. */
export async function listSurveyResponseRecordsForProject(
  organizationId: string,
  projectId: string,
  limit?: number,
): Promise<RawRecordModel[]> {
  await ensureFirestoreOrm();
  return listSurveyResponseRecordsForProjectInOrganization(organizationId, projectId, limit);
}

/** The per-agent leaderboard + open-ticket backlog (KAN-90, plan `14 §Gap 6`), computed fresh from bounded, landed `support_ticket_event` raw records — no warehouse dependency, same "fetch once, aggregate in TypeScript" posture `getNpsOverviewForProject` establishes. */
export async function getSupportLeaderboardForProject(
  organizationId: string,
  projectId: string,
  options?: { limit?: number },
): Promise<SupportLeaderboardResult> {
  await ensureFirestoreOrm();
  return getSupportLeaderboardForProjectInOrganization(organizationId, projectId, options);
}

/** The demo funnel (scheduled/held/no-show/show-rate) + per-rep breakdown (KAN-92, plan `14 §Gap 9`), computed fresh from bounded, landed `demo_event` raw records — no warehouse dependency, same "fetch once, aggregate in TypeScript" posture `getSupportLeaderboardForProject` establishes. */
export async function getDemoFunnelForProject(
  organizationId: string,
  projectId: string,
  options?: { limit?: number },
): Promise<DemoFunnelResult> {
  await ensureFirestoreOrm();
  return getDemoFunnelForProjectInOrganization(organizationId, projectId, options);
}

/** The bounded, landed `cancellation_reason` raw records `getCancellationReasonCodeBreakdownForProject`/`getCancellationReasonThemeDigestForProject` each read — fetch once via this and pass the result to both via `precomputedRecords`, same posture `listSurveyResponseRecordsForProject` establishes. */
export async function listCancellationReasonRecordsForProject(
  organizationId: string,
  projectId: string,
  limit?: number,
): Promise<RawRecordModel[]> {
  await ensureFirestoreOrm();
  return listCancellationReasonRecordsForProjectInOrganization(organizationId, projectId, limit);
}

export async function getCancellationReasonCodeBreakdownForProject(
  organizationId: string,
  projectId: string,
  options?: { limit?: number; precomputedRecords?: RawRecordModel[] },
): Promise<CancellationReasonCodeCount[]> {
  await ensureFirestoreOrm();
  return getCancellationReasonCodeBreakdownForProjectInOrganization(organizationId, projectId, options);
}

export async function getCancellationReasonThemeDigestForProject(
  organizationId: string,
  projectId: string,
  options?: { limit?: number; windowDays?: number; precomputedRecords?: RawRecordModel[] },
): Promise<CancellationReasonThemeCluster[]> {
  await ensureFirestoreOrm();
  return getCancellationReasonThemeDigestForProjectInOrganization(organizationId, projectId, options);
}

export async function getCancellationReasonDimensionBreakdownForProject(
  organizationId: string,
  projectId: string,
  dimension: CancellationReasonBreakdownDimension,
): Promise<CancellationReasonDimensionBreakdownOutcome> {
  await ensureFirestoreOrm();
  return getCancellationReasonDimensionBreakdownForProjectInOrganization(organizationId, projectId, dimension);
}

/** The bounded, landed `onboarding_survey` raw records `getSignupQualityScoreOverviewForProject` reads — fetch once via this and pass the result via `precomputedRecords` for a page needing more than one read, same posture `listCancellationReasonRecordsForProject` establishes. */
export async function listOnboardingSurveyRecordsForProject(
  organizationId: string,
  projectId: string,
  limit?: number,
): Promise<RawRecordModel[]> {
  await ensureFirestoreOrm();
  return listOnboardingSurveyRecordsForProjectInOrganization(organizationId, projectId, limit);
}

export async function getSignupQualityScoreOverviewForProject(
  organizationId: string,
  projectId: string,
  options?: { limit?: number; precomputedRecords?: RawRecordModel[] },
): Promise<SignupQualityScoreDistribution> {
  await ensureFirestoreOrm();
  return getSignupQualityScoreOverviewForProjectInOrganization(organizationId, projectId, options);
}

export async function getSignupQualityScoreDimensionBreakdownForProject(
  organizationId: string,
  projectId: string,
  dimension: SignupQualityScoreBreakdownDimension,
): Promise<SignupQualityScoreQueryOutcome> {
  await ensureFirestoreOrm();
  return getSignupQualityScoreDimensionBreakdownForProjectInOrganization(organizationId, projectId, dimension);
}

export async function getSignupQualityScoreAdjustedMetricsForProject(
  organizationId: string,
  projectId: string,
): Promise<SignupQualityScoreAdjustedMetricsOutcome> {
  await ensureFirestoreOrm();
  return getSignupQualityScoreAdjustedMetricsForProjectInOrganization(organizationId, projectId);
}

export async function listActiveQualityMixAlertsForProject(organizationId: string, projectId: string): Promise<QualityMixAlertModel[]> {
  await ensureFirestoreOrm();
  return listActiveQualityMixAlertsForProjectInOrganization(organizationId, projectId);
}

export async function listQualityMixAlertsForProject(organizationId: string, projectId: string): Promise<QualityMixAlertModel[]> {
  await ensureFirestoreOrm();
  return listQualityMixAlertsForProjectInOrganization(organizationId, projectId);
}

/** The bounded, landed `company_firmographic` raw records `getFirmographicIndustryBreakdownForProject` reads — fetch once via this and pass the result via `precomputedRecords`, same posture `listCancellationReasonRecordsForProject` establishes. */
export async function listFirmographicRecordsForProject(organizationId: string, projectId: string, limit?: number): Promise<RawRecordModel[]> {
  await ensureFirestoreOrm();
  return listFirmographicRecordsForProjectInOrganization(organizationId, projectId, limit);
}

export async function getFirmographicIndustryBreakdownForProject(
  organizationId: string,
  projectId: string,
  options?: { limit?: number; precomputedRecords?: RawRecordModel[] },
): Promise<FirmographicIndustryCount[]> {
  await ensureFirestoreOrm();
  return getFirmographicIndustryBreakdownForProjectInOrganization(organizationId, projectId, options);
}

export async function getFirmographicCompositionDimensionBreakdownForProject(
  organizationId: string,
  projectId: string,
  dimension: FirmographicBreakdownDimension,
): Promise<FirmographicQueryOutcome> {
  await ensureFirestoreOrm();
  return getFirmographicCompositionDimensionBreakdownForProjectInOrganization(organizationId, projectId, dimension);
}

export async function listFirmographicCompositionAlertsForProject(organizationId: string, projectId: string): Promise<FirmographicCompositionAlertModel[]> {
  await ensureFirestoreOrm();
  return listFirmographicCompositionAlertsForProjectInOrganization(organizationId, projectId);
}

export async function getCampaignSpendBreakdownForProject(organizationId: string, projectId: string): Promise<CampaignSpendBreakdownOutcome> {
  await ensureFirestoreOrm();
  return getCampaignSpendBreakdownForProjectInOrganization(organizationId, projectId);
}

export async function getCampaignPaybackBreakdownForProject(organizationId: string, projectId: string): Promise<CampaignPaybackBreakdownOutcome> {
  await ensureFirestoreOrm();
  return getCampaignPaybackBreakdownForProjectInOrganization(organizationId, projectId);
}

export async function listCampaignTargetsForProject(organizationId: string, projectId: string): Promise<CampaignTargetModel[]> {
  await ensureFirestoreOrm();
  return listCampaignTargetsForProjectInOrganization(organizationId, projectId);
}

export async function getPaybackOverviewForProject(organizationId: string, projectId: string): Promise<PaybackOverviewOutcome> {
  await ensureFirestoreOrm();
  return getPaybackOverviewForProjectInOrganization(organizationId, projectId);
}

export async function getQualityCalibrationBreakdownForProject(organizationId: string, projectId: string): Promise<QualityCalibrationBreakdownOutcome> {
  await ensureFirestoreOrm();
  return getQualityCalibrationBreakdownForProjectInOrganization(organizationId, projectId);
}

export async function getExperimentResultsForProject(organizationId: string, projectId: string): Promise<ExperimentResultsOutcome> {
  await ensureFirestoreOrm();
  return getExperimentResultsForProjectInOrganization(organizationId, projectId);
}

export async function listTrackingAlertsForProject(organizationId: string, projectId: string): Promise<TrackingAlertModel[]> {
  await ensureFirestoreOrm();
  return listTrackingAlertsForProjectInOrganization(organizationId, projectId);
}

export async function getActiveAutomationGuardrailPolicy(organizationId: string, projectId: string): Promise<AutomationGuardrailPolicyConfig> {
  await ensureFirestoreOrm();
  return getActiveAutomationGuardrailPolicyInOrganization(organizationId, projectId);
}

export async function getAutomationKillSwitchStatus(organizationId: string): Promise<AutomationKillSwitchStatus> {
  await ensureFirestoreOrm();
  return getAutomationKillSwitchStatusInOrganization(organizationId);
}

export async function listAutomationActionsForProject(
  organizationId: string,
  projectId: string,
  limit?: number,
): Promise<AutomationActionModel[]> {
  await ensureFirestoreOrm();
  return listAutomationActionsForProjectInOrganization(organizationId, projectId, limit);
}

export async function listAutomationActionsForTarget(
  organizationId: string,
  projectId: string,
  targetId: string,
): Promise<AutomationActionModel[]> {
  await ensureFirestoreOrm();
  return listAutomationActionsForTargetInOrganization(organizationId, projectId, targetId);
}

export async function listAutomationTargetStatesForProject(organizationId: string, projectId: string): Promise<AutomationTargetStateModel[]> {
  await ensureFirestoreOrm();
  return listAutomationTargetStatesForProjectInOrganization(organizationId, projectId);
}

export async function listQueryCostLogEntriesForProject(
  organizationId: string,
  projectId: string,
  limit?: number,
): Promise<QueryCostLogEntryModel[]> {
  await ensureFirestoreOrm();
  return listQueryCostLogEntriesForProjectInOrganization(organizationId, projectId, limit);
}

export async function listPluginManifestsForOrg(organizationId: string): Promise<PluginManifestModel[]> {
  await ensureFirestoreOrm();
  return listPluginManifestsForOrgInOrganization(organizationId);
}

export async function listPluginInstallsForProject(
  organizationId: string,
  projectId: string,
): Promise<PluginInstallModel[]> {
  await ensureFirestoreOrm();
  return listPluginInstallsForProjectInOrganization(organizationId, projectId);
}

export async function listSourcePluginRunsForInstall(
  organizationId: string,
  projectId: string,
  installId: string,
  limit?: number,
): Promise<PluginSourceRunModel[]> {
  await ensureFirestoreOrm();
  return listSourcePluginRunsForInstallInOrganization(organizationId, projectId, installId, limit);
}

/** Every currently-installed, `action`-type plugin install in a project (KAN-81) — the pick-list the Segments page's "Sync to CRM" control offers. */
export async function listActionPluginInstallsForProject(organizationId: string, projectId: string): Promise<PluginInstallModel[]> {
  await ensureFirestoreOrm();
  return listActionPluginInstallsForProjectInOrganization(organizationId, projectId);
}

/** One segment's CRM-sync run history, newest-first (KAN-81). */
export async function listCrmSyncRunsForSegment(organizationId: string, projectId: string, segmentId: string, limit?: number): Promise<PluginSinkRunModel[]> {
  await ensureFirestoreOrm();
  return listCrmSyncRunsForSegmentInOrganization(organizationId, projectId, segmentId, limit);
}

/** One `META_CUSTOM_AUDIENCE_PLUGIN_ID` install's own created Lookalike Audiences, newest-first (KAN-73 follow-up). */
export async function listMetaLookalikeAudiencesForInstall(organizationId: string, projectId: string, installId: string, limit?: number): Promise<MetaLookalikeAudienceModel[]> {
  await ensureFirestoreOrm();
  return listMetaLookalikeAudiencesForInstallInOrganization(organizationId, projectId, installId, limit);
}

export async function listBoardsForProject(organizationId: string, projectId: string): Promise<BoardModel[]> {
  await ensureFirestoreOrm();
  return listBoardsForProjectInOrganization(organizationId, projectId);
}

export async function getBoard(organizationId: string, projectId: string, boardId: string): Promise<BoardModel | null> {
  await ensureFirestoreOrm();
  return getBoardInOrganization(organizationId, projectId, boardId);
}

/** Every `active` metric registered in a project — the shape a board's tile-editor metric picker (KAN-60) reads from (plan `10 §2.2`: "metric picker from the semantic layer, never free-SQL by default"). */
export async function listMetricsCatalogForProject(organizationId: string, projectId: string): Promise<MetricCatalogEntry[]> {
  await ensureFirestoreOrm();
  return listMetricsCatalogForProjectInOrganization(organizationId, projectId);
}

/** One tile's queried data (or a typed, renderable "why not" outcome — see `BoardTileQueryOutcome`'s own doc comment) for board render time. */
export async function queryBoardTile(
  organizationId: string,
  projectId: string,
  board: Pick<BoardModel, 'date_range' | 'compare' | 'global_filters'>,
  tile: BoardTile,
): Promise<BoardTileQueryOutcome> {
  await ensureFirestoreOrm();
  return queryBoardTileInOrganization({ organizationId, projectId, board, tile });
}

/**
 * The batched sibling of {@link queryBoardTile} every board-rendering call
 * site (the board detail page, the TV rotation route) should call instead
 * of fanning `queryBoardTile` out over `board.tiles` itself — see
 * `queryBoardTiles`'s own doc comment (`@growthos/firebase-orm-models`) for
 * the per-tile N+1 this closes.
 */
export async function queryBoardTiles(
  organizationId: string,
  projectId: string,
  board: Pick<BoardModel, 'date_range' | 'compare' | 'global_filters' | 'tiles'>,
): Promise<BoardTileQueryOutcome[]> {
  await ensureFirestoreOrm();
  return queryBoardTilesInOrganization({ organizationId, projectId, board });
}

export async function listGoalsForProject(organizationId: string, projectId: string): Promise<GoalModel[]> {
  await ensureFirestoreOrm();
  return listGoalsForProjectInOrganization(organizationId, projectId);
}

/** A project's saved segments (KAN-76), newest-first — created either by a human via this project's Segments page or by an agent via the MCP `create_segment` tool. */
export async function listSegmentsForProject(organizationId: string, projectId: string): Promise<SegmentModel[]> {
  await ensureFirestoreOrm();
  return listSegmentsForProjectInOrganization(organizationId, projectId);
}

/** A project's rep-attributed collections ledger (KAN-88), newest-`occurred_at`-first. */
export async function listRepCollectionEntriesForProject(organizationId: string, projectId: string): Promise<RepCollectionEntryModel[]> {
  await ensureFirestoreOrm();
  return listRepCollectionEntriesForProjectInOrganization(organizationId, projectId);
}

/** KAN-88's weekly/monthly per-rep leaderboard, aggregated from the ledger. */
export async function getRepCollectionLeaderboardForProject(
  organizationId: string,
  projectId: string,
  period: RepCollectionLeaderboardPeriod,
): Promise<RepCollectionLeaderboardResult> {
  await ensureFirestoreOrm();
  return getRepCollectionLeaderboardForProjectInOrganization({ organizationId, projectId, period });
}

/** KAN-88's "auto from billing" suggestions — recently landed, not-yet-attributed Stripe charges a human can confirm onto the ledger. Pass `existingEntries` (a ledger already fetched for the same page render) to skip this call's own ledger read. */
export async function listBillingCollectionSignalsForProject(
  organizationId: string,
  projectId: string,
  existingEntries?: readonly RepCollectionEntryModel[],
): Promise<RepCollectionBillingSignal[]> {
  await ensureFirestoreOrm();
  return listBillingCollectionSignalsForProjectInOrganization(organizationId, projectId, { existingEntries });
}

/**
 * One segment's live member count (or a typed, renderable "why not" outcome
 * — see `SegmentMemberCountOutcome`'s own doc comment) for the Segments
 * page's own member-count badge. `options` lets a caller fanning this out
 * per segment on one page (the only real caller today) pass in shared state
 * it already fetched once — the environment, the project's cost quota, and
 * the project's active schema defs — instead of paying for a fresh
 * `resolveDefaultQueryEnvironment`/quota-config/schema-def read per segment.
 */
export async function countSegmentMembers(
  organizationId: string,
  projectId: string,
  segmentId: string,
  options?: {
    environmentId?: string;
    precomputedQuota?: ProjectCostQuota;
    precomputedActiveSchemaDefsByKindAndName?: ReadonlyMap<string, SchemaDefModel>;
  },
): Promise<SegmentMemberCountOutcome> {
  await ensureFirestoreOrm();
  return countSegmentMembersInOrganization({ organizationId, projectId, segmentId, ...options });
}

/**
 * One segment's actual matching rows (not just a count — see `SegmentMemberListOutcome`'s own doc
 * comment for the ok/degraded-reason split), for the Segments page's own "view members" panel
 * (KAN-107). Bounded to `limit` — see `listSegmentMembers`'s own `MAX_SEGMENT_MEMBER_LIST_LIMIT`
 * doc comment for why this is never an unbounded export.
 */
export async function listSegmentMembers(
  organizationId: string,
  projectId: string,
  segmentId: string,
  options?: { environmentId?: string; limit?: number },
): Promise<SegmentMemberListOutcome> {
  await ensureFirestoreOrm();
  return listSegmentMembersInOrganization({ organizationId, projectId, segmentId, ...options });
}

/**
 * Substring search over the project's landed `entities` rows (KAN-108, the web admin counterpart of
 * the MCP `search_customers` tool) — or a typed, renderable "why not" outcome (see
 * `CustomerSearchOutcome`'s own doc comment) for the Customers page's own search results. `query` must
 * be non-empty; the page itself is responsible for not calling this until a caller has actually typed
 * something, the same "don't spend a warehouse query on nothing" posture the record feed's own filter
 * form establishes.
 */
export async function searchProjectCustomers(
  organizationId: string,
  projectId: string,
  query: string,
  options?: { schemaName?: string; limit?: number },
): Promise<CustomerSearchOutcome> {
  await ensureFirestoreOrm();
  return searchProjectCustomersForAdminInOrganization({ organizationId, projectId, query, ...options });
}

/**
 * A project's `cohort_month x period_number` retention matrix (KAN-113, the web admin counterpart of
 * the MCP `query_cohort` tool) — or a typed, renderable "why not" outcome (see `CohortRetentionOutcome`'s
 * own doc comment) for the Cohort Retention page.
 */
export async function queryCohortRetention(
  organizationId: string,
  projectId: string,
  options?: { cohortMonth?: string; conversionEvent?: string; limit?: number },
): Promise<CohortRetentionOutcome> {
  await ensureFirestoreOrm();
  return queryProjectCohortRetentionForAdminInOrganization({ organizationId, projectId, ...options });
}

export async function getGoal(organizationId: string, projectId: string, goalId: string): Promise<GoalModel | null> {
  await ensureFirestoreOrm();
  return getGoalInOrganization(organizationId, projectId, goalId);
}

/** One goal's computed progress (or a typed, renderable "why not" outcome — see `GoalProgressOutcome`'s own doc comment) for the goal detail page's thermometer. */
export async function queryGoalProgress(
  organizationId: string,
  projectId: string,
  goal: GoalModel,
): Promise<GoalProgressOutcome> {
  await ensureFirestoreOrm();
  return queryGoalProgressInOrganization({ organizationId, projectId, goal });
}

/**
 * A project's confirmed funnel, per-stage distinct-customer counts and conversion off the first step
 * (or a typed, renderable "why not" outcome — see `FunnelStepsOutcome`'s own doc comment) for the
 * Funnel page. Same environment-scoping convention as `searchProjectCustomers`/`queryGoalProgress`.
 */
export async function queryProjectFunnelSteps(
  organizationId: string,
  projectId: string,
  options?: { environmentId?: string },
): Promise<FunnelStepsOutcome> {
  await ensureFirestoreOrm();
  return queryProjectFunnelStepsForAdminInOrganization({ organizationId, projectId, ...options });
}

/**
 * Recent noteworthy findings for a project (active tracking-broke alerts + fired win-rule events,
 * newest first) — the `list_insights` MCP tool's web admin counterpart, for the Insights page.
 */
export async function listProjectInsights(organizationId: string, projectId: string): Promise<ProjectInsight[]> {
  await ensureFirestoreOrm();
  return listProjectInsightsInOrganization({ organizationId, projectId });
}

export async function listWinRulesForProject(organizationId: string, projectId: string): Promise<WinRuleModel[]> {
  await ensureFirestoreOrm();
  return listWinRulesForProjectInOrganization(organizationId, projectId);
}

export async function listRecentWinEventsForProject(organizationId: string, projectId: string): Promise<WinEventModel[]> {
  await ensureFirestoreOrm();
  return listRecentWinEventsForProjectInOrganization(organizationId, projectId);
}

/** The live win feed's incremental-poll building block — see `feed/route.ts`'s own doc comment. */
export async function listWinEventsSince(organizationId: string, projectId: string, sinceIso: string): Promise<WinEventModel[]> {
  await ensureFirestoreOrm();
  return listWinEventsSinceInOrganization(organizationId, projectId, sinceIso);
}

/** KAN-66's trial-pipeline war-room widget query — see `getTrialPipelineSummary`'s own doc comment (`trial-pipeline.service.ts`) for its degrade-to-outcome shape. */
export async function getTrialPipelineSummary(organizationId: string, projectId: string): Promise<TrialPipelineOutcome> {
  await ensureFirestoreOrm();
  return getTrialPipelineSummaryInOrganization({ organizationId, projectId });
}

/** Every currently-active `event` schema name in a project — the win-rule create form's schema picker. */
export async function listActiveEventSchemaNames(organizationId: string, projectId: string): Promise<string[]> {
  const schemaDefs = await listSchemaDefinitionsForProject(organizationId, projectId);
  return activeSchemaNamesForKind(schemaDefs, 'event');
}

/** A project's onboarding-wizard state (KAN-68), or `null` if the wizard has never been opened for it. */
export async function getOnboardingState(organizationId: string, projectId: string): Promise<OnboardingStateModel | null> {
  await ensureFirestoreOrm();
  return getOnboardingStateInOrganization(organizationId, projectId);
}

/** The built-in metric packs the onboarding wizard's "pick a vertical" step offers — a pure catalog, no Firestore read needed. */
export function onboardingMetricPacks(): ReturnType<typeof listOnboardingMetricPacks> {
  return listOnboardingMetricPacks();
}

/** Every built-in metric pack this platform ships (SaaS, Engagement, Landing Page) — the catalog a project's Plugins page renders one-click install cards from. A pure catalog, no Firestore read needed — same shape as {@link onboardingMetricPacks}, just not keyed by the wizard's fixed `packKey` union. */
export function builtinMetricPacks(): ReturnType<typeof listBuiltinMetricPacks> {
  return listBuiltinMetricPacks();
}

/** An AI-proposed funnel step order for a project's already-registered event schemas (KAN-68 AC). */
export async function proposeOnboardingFunnelSteps(organizationId: string, projectId: string): Promise<FunnelStepSuggestion[]> {
  await ensureFirestoreOrm();
  return proposeOnboardingFunnelStepsInOrganization(organizationId, projectId);
}

/** Every TV paired to a project (KAN-67) — the war-room TV admin list. */
export async function listTvPairingsForProject(organizationId: string, projectId: string): Promise<TvPairingModel[]> {
  await ensureFirestoreOrm();
  return listTvPairingsForProjectInOrganization(organizationId, projectId);
}

/**
 * Resolves a TV's own device token to its current status — used by the
 * session-less `app/api/tv-pairing/status` route (not `requireOrgPermission`,
 * since the caller here is an unauthenticated TV browser, not a signed-in
 * org member — see `TvPairingModel`'s own doc comment).
 */
export async function getTvPairingStatus(deviceToken: string): Promise<TvPairingStatus> {
  await ensureFirestoreOrm();
  return getTvPairingStatusForOrganization(deviceToken);
}

/** The shared guard every session-less viewer endpoint (board data, win feed) calls — see its own doc comment (`tv-pairing.service.ts`) for why "wrong token"/"not yet claimed"/"expired" all collapse to one failure. */
export async function requireClaimedTvPairing(deviceToken: string): Promise<Result<TvPairingModel, string>> {
  await ensureFirestoreOrm();
  return requireClaimedTvPairingForOrganization(deviceToken);
}

export interface PendingAttachmentDetails {
  attachmentId: string;
  projectId: string;
  projectName: string;
  resourceKind: ResourceKind;
  resourceId: string;
  resourceName: string;
  scopeSelection: string[];
}

/** {@link listPendingAttachmentsForOrg}, enriched with project/resource display names for the approval-queue UI. */
export async function listPendingAttachmentsForOrgWithDetails(
  organizationId: string,
): Promise<PendingAttachmentDetails[]> {
  await ensureFirestoreOrm();
  const [attachments, projects, credentials, templates, people] = await Promise.all([
    listPendingAttachmentsForOrgInOrganization(organizationId),
    listOrgProjectsForOrganization(organizationId),
    listSharedCredentialsInOrganization(organizationId),
    listResourceTemplatesInOrganization(organizationId),
    listOrgPeopleInOrganization(organizationId),
  ]);

  const projectNameById = new Map(projects.map((project) => [project.id, project.name]));
  const resourceNameById = new Map<string, string>([
    ...credentials.map((credential) => [credential.id, credential.name] as const),
    ...templates.map((template) => [template.id, template.name] as const),
    ...people.map((person) => [person.id, person.name] as const),
  ]);

  return attachments.map((attachment) => ({
    attachmentId: attachment.id,
    projectId: attachment.project_id,
    projectName: projectNameById.get(attachment.project_id) ?? attachment.project_id,
    resourceKind: attachment.resource_kind,
    resourceId: attachment.resource_id,
    resourceName: resourceNameById.get(attachment.resource_id) ?? attachment.resource_id,
    scopeSelection: attachment.scope_selection ?? [],
  }));
}

export interface InviteDetails {
  organizationId: string;
  organizationName: string;
  membershipId: string;
  role: Role;
  status: MembershipStatus;
  inviteeUserId: string;
  inviteeEmail: string;
}

/** Loads the details an invite-accept page needs to render, or `null` if the invite/org doesn't exist. */
export async function getInviteDetails(organizationId: string, membershipId: string): Promise<InviteDetails | null> {
  await ensureFirestoreOrm();
  const membership = await MembershipModel.init(membershipId, { organization_id: organizationId });
  if (!membership) {
    return null;
  }

  const [organization, invitee] = await Promise.all([
    OrganizationModel.init(organizationId),
    UserModel.init(membership.user_id),
  ]);
  if (!organization) {
    return null;
  }

  return {
    organizationId,
    organizationName: organization.name,
    membershipId: membership.id,
    role: membership.role,
    status: membership.status ?? 'active',
    inviteeUserId: membership.user_id,
    inviteeEmail: invitee?.email ?? '',
  };
}
