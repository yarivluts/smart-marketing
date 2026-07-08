import 'server-only';
import {
  checkProjectQueryQuota as checkProjectQueryQuotaInOrganization,
  getEventVolumeOverviewForProject as getEventVolumeOverviewForProjectInOrganization,
  getProjectCostQuota as getProjectCostQuotaInOrganization,
  listTrackingAlertsForProject as listTrackingAlertsForProjectInOrganization,
  type ApiKeySummary,
  type EnvironmentModel,
  type EventVolumeOverviewEntry,
  listActiveAttachmentsForProject as listActiveAttachmentsForProjectInOrganization,
  listApiKeysForProject as listApiKeysForProjectInOrganization,
  listAttachmentsForProject as listAttachmentsForProjectInOrganization,
  listAuditLogEntriesForOrg as listAuditLogEntriesForOrgInOrganization,
  listEnvironmentsForProject as listEnvironmentsForProjectInOrganization,
  listFailedPipelineMessagesForProject as listFailedPipelineMessagesForProjectInOrganization,
  listMetricDefinitionsForProject as listMetricDefinitionsForProjectInOrganization,
  listOrgMembersWithProfiles,
  listOrchestrationRunsForProject as listOrchestrationRunsForProjectInOrganization,
  listOrgPeople as listOrgPeopleInOrganization,
  listOrgProjects as listOrgProjectsForOrganization,
  listPendingAttachmentsForOrg as listPendingAttachmentsForOrgInOrganization,
  listQuarantinedRecordsForProject as listQuarantinedRecordsForProjectInOrganization,
  listQueryCostLogEntriesForProject as listQueryCostLogEntriesForProjectInOrganization,
  listRecentIngestBatchesForProject as listRecentIngestBatchesForProjectInOrganization,
  listResourceTemplates as listResourceTemplatesInOrganization,
  listSchemaDefinitionsForProject as listSchemaDefinitionsForProjectInOrganization,
  listSharedCredentials as listSharedCredentialsInOrganization,
  MembershipModel,
  OrganizationModel,
  UserModel,
  verifyAuditLogChainForOrg as verifyAuditLogChainForOrgInOrganization,
  type AuditLogChainVerification,
  type AuditLogEntryModel,
  type IngestBatchModel,
  type MembershipStatus,
  type MetricDefModel,
  type OrchestrationRunModel,
  type OrgMemberSummary,
  type OrgPersonModel,
  type PipelineMessageModel,
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
} from '@growthos/firebase-orm-models';
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
