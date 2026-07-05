import 'server-only';
import {
  acceptInvite as acceptInviteForOrganization,
  createOrganizationWithOwner,
  createOrgPerson as createOrgPersonInOrganization,
  createProject as createProjectInOrganization,
  createResourceTemplate as createResourceTemplateInOrganization,
  createSharedCredential as createSharedCredentialInOrganization,
  decideResourceAttachment as decideResourceAttachmentInOrganization,
  detachResource as detachResourceInOrganization,
  inviteMemberToOrganization,
  removeOrgMember,
  requestResourceAttachment as requestResourceAttachmentInOrganization,
  type AcceptInviteResult,
  type CreateOrganizationResult,
  type CreateProjectResult,
  type CredentialProvider,
  type InvitableRole,
  type MembershipModel,
  type OrgPersonModel,
  type ResourceAttachmentModel,
  type ResourceKind,
  type ResourceTemplateModel,
  type ResourceTemplateType,
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
}

/** Revokes a pending invite or removes an active member — see `removeOrgMember`'s doc comment. */
export async function removeMember(input: RemoveMemberInput): Promise<void> {
  await ensureFirestoreOrm();
  return removeOrgMember(input.organizationId, input.membershipId);
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
