import 'server-only';
import {
  acceptInvite as acceptInviteForOrganization,
  type ApiKeyModel,
  type ApiKeyScope,
  createOrganizationWithOwner,
  createOrgPerson as createOrgPersonInOrganization,
  createProject as createProjectInOrganization,
  createResourceTemplate as createResourceTemplateInOrganization,
  createSharedCredential as createSharedCredentialInOrganization,
  decideResourceAttachment as decideResourceAttachmentInOrganization,
  type DrainPipelineResult,
  detachResource as detachResourceInOrganization,
  evolveMetricDefinition as evolveMetricDefinitionInOrganization,
  evolveSchemaDefinition as evolveSchemaDefinitionInOrganization,
  inviteMemberToOrganization,
  mintApiKey as mintApiKeyInOrganization,
  type MintApiKeyResult,
  registerMetricDefinition as registerMetricDefinitionInOrganization,
  registerSchemaDefinition as registerSchemaDefinitionInOrganization,
  removeOrgMember,
  replayFailedPipelineMessagesForProject as replayFailedPipelineMessagesForProjectInOrganization,
  replayQuarantinedRecord as replayQuarantinedRecordInOrganization,
  type ReplayQuarantinedRecordResult,
  requestResourceAttachment as requestResourceAttachmentInOrganization,
  revokeApiKey as revokeApiKeyInOrganization,
  rotateSharedCredentialSecretKey as rotateSharedCredentialSecretKeyInOrganization,
  setSharedCredentialSecret as setSharedCredentialSecretInOrganization,
  type AcceptInviteResult,
  type CreateOrganizationResult,
  type CreateProjectResult,
  type CredentialProvider,
  type InvitableRole,
  type KmsProvider,
  type MembershipModel,
  type MetricDefinitionInput,
  type MetricDefModel,
  type OrgPersonModel,
  type ResourceAttachmentModel,
  type ResourceKind,
  type ResourceTemplateModel,
  type ResourceTemplateType,
  type SchemaDefModel,
  type SchemaFieldInput,
  type SharedCredentialModel,
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
