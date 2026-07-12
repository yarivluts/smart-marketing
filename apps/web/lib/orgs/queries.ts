import 'server-only';
import {
  checkProjectQueryQuota as checkProjectQueryQuotaInOrganization,
  getBoard as getBoardInOrganization,
  getEventVolumeOverviewForProject as getEventVolumeOverviewForProjectInOrganization,
  getGoal as getGoalInOrganization,
  getOnboardingState as getOnboardingStateInOrganization,
  getProjectCostQuota as getProjectCostQuotaInOrganization,
  getTrialPipelineSummary as getTrialPipelineSummaryInOrganization,
  listTrackingAlertsForProject as listTrackingAlertsForProjectInOrganization,
  type ApiKeySummary,
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
  listBoardsForProject as listBoardsForProjectInOrganization,
  listEnvironmentsForProject as listEnvironmentsForProjectInOrganization,
  listFailedPipelineMessagesForProject as listFailedPipelineMessagesForProjectInOrganization,
  listFieldMappingsForProject as listFieldMappingsForProjectInOrganization,
  listGoalsForProject as listGoalsForProjectInOrganization,
  listHookDeliveriesForProject as listHookDeliveriesForProjectInOrganization,
  listHookEndpointsForProject as listHookEndpointsForProjectInOrganization,
  listMetricDefinitionsForProject as listMetricDefinitionsForProjectInOrganization,
  listMetricsCatalogForProject as listMetricsCatalogForProjectInOrganization,
  listOrgMembersWithProfiles,
  listOrchestrationRunsForProject as listOrchestrationRunsForProjectInOrganization,
  listOrgPeople as listOrgPeopleInOrganization,
  listOrgProjects as listOrgProjectsForOrganization,
  listOnboardingMetricPacks,
  listPendingAttachmentsForOrg as listPendingAttachmentsForOrgInOrganization,
  listPluginInstallsForProject as listPluginInstallsForProjectInOrganization,
  listPluginManifestsForOrg as listPluginManifestsForOrgInOrganization,
  listQuarantinedRecordsForProject as listQuarantinedRecordsForProjectInOrganization,
  listSourcePluginRunsForInstall as listSourcePluginRunsForInstallInOrganization,
  listQueryCostLogEntriesForProject as listQueryCostLogEntriesForProjectInOrganization,
  listRecentIngestBatchesForProject as listRecentIngestBatchesForProjectInOrganization,
  listResourceTemplates as listResourceTemplatesInOrganization,
  listSchemaDefinitionsForProject as listSchemaDefinitionsForProjectInOrganization,
  listSharedCredentials as listSharedCredentialsInOrganization,
  MembershipModel,
  OrganizationModel,
  proposeOnboardingFunnelSteps as proposeOnboardingFunnelStepsInOrganization,
  queryBoardTile as queryBoardTileInOrganization,
  queryGoalProgress as queryGoalProgressInOrganization,
  UserModel,
  verifyAuditLogChainForOrg as verifyAuditLogChainForOrgInOrganization,
  type AuditLogChainVerification,
  type AuditLogEntryModel,
  type BoardTileQueryOutcome,
  type IngestBatchModel,
  type MembershipStatus,
  type MetricCatalogEntry,
  type MetricDefModel,
  type OnboardingStateModel,
  type OrchestrationRunModel,
  type OrgMemberSummary,
  type OrgPersonModel,
  type PipelineMessageModel,
  type PluginInstallModel,
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
import type { FunnelStepSuggestion, Result } from '@growthos/shared';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';

export async function listOrgMembers(organizationId: string): Promise<OrgMemberSummary[]> {
  await ensureFirestoreOrm();
  return listOrgMembersWithProfiles(organizationId);
}

export async function listOrgProjects(organizationId: string): Promise<ProjectModel[]> {
  await ensureFirestoreOrm();
  return listOrgProjectsForOrganization(organizationId);
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

export async function listApiKeysForProject(organizationId: string, projectId: string): Promise<ApiKeySummary[]> {
  await ensureFirestoreOrm();
  return listApiKeysForProjectInOrganization(organizationId, projectId);
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

export async function listFailedPipelineMessagesForProject(
  organizationId: string,
  projectId: string,
  limit?: number,
): Promise<PipelineMessageModel[]> {
  await ensureFirestoreOrm();
  return listFailedPipelineMessagesForProjectInOrganization(organizationId, projectId, limit);
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

export async function listTrackingAlertsForProject(organizationId: string, projectId: string): Promise<TrackingAlertModel[]> {
  await ensureFirestoreOrm();
  return listTrackingAlertsForProjectInOrganization(organizationId, projectId);
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

export async function listGoalsForProject(organizationId: string, projectId: string): Promise<GoalModel[]> {
  await ensureFirestoreOrm();
  return listGoalsForProjectInOrganization(organizationId, projectId);
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
