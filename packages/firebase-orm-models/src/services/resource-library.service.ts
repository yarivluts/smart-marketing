import { OrgPersonModel } from '../models/org-person.model';
import { ProjectModel } from '../models/project.model';
import {
  type ConnectionWriteTier,
  isConnectionWriteTier,
  ResourceAttachmentModel,
  type ResourceKind,
} from '../models/resource-attachment.model';
import { ResourceTemplateModel, type ResourceTemplateType } from '../models/resource-template.model';
import { type CredentialProvider, SharedCredentialModel } from '../models/shared-credential.model';
import { recordAuditLogEntry } from './audit-log.service';

export class ProjectNotFoundError extends Error {
  constructor() {
    super('Project not found in this organization.');
    this.name = 'ProjectNotFoundError';
  }
}

export class ResourceNotFoundError extends Error {
  constructor() {
    super('Resource not found in this organization.');
    this.name = 'ResourceNotFoundError';
  }
}

export class AttachmentNotFoundError extends Error {
  constructor() {
    super('Resource attachment not found.');
    this.name = 'AttachmentNotFoundError';
  }
}

export class AttachmentNotPendingError extends Error {
  constructor() {
    super('This attachment request has already been decided.');
    this.name = 'AttachmentNotPendingError';
  }
}

export class AttachmentNotApprovedError extends Error {
  constructor() {
    super('This attachment is not currently approved.');
    this.name = 'AttachmentNotApprovedError';
  }
}

export class InvalidScopeSelectionError extends Error {
  constructor() {
    super("The requested scope selection is not a subset of the credential's available scopes.");
    this.name = 'InvalidScopeSelectionError';
  }
}

export class AttachmentNotCredentialError extends Error {
  constructor() {
    super('A write tier only applies to a credential attachment.');
    this.name = 'AttachmentNotCredentialError';
  }
}

export class InvalidWriteTierError extends Error {
  constructor() {
    super("Write tier must be one of 'read', 'optimize', or 'manage'.");
    this.name = 'InvalidWriteTierError';
  }
}

async function requireProjectInOrg(organizationId: string, projectId: string): Promise<ProjectModel> {
  const project = await ProjectModel.init(projectId, { organization_id: organizationId });
  if (!project || project.organization_id !== organizationId) {
    throw new ProjectNotFoundError();
  }
  return project;
}

export interface CreateSharedCredentialParams {
  organizationId: string;
  name: string;
  provider: CredentialProvider;
  availableScopes: readonly string[];
  createdByUserId: string;
}

/** Registers an org-level connection credential's identity + available-scope slice (see `SharedCredentialModel` for why no secret is stored here yet). */
export async function createSharedCredential(params: CreateSharedCredentialParams): Promise<SharedCredentialModel> {
  const credential = new SharedCredentialModel();
  credential.name = params.name;
  credential.organization_id = params.organizationId;
  credential.provider = params.provider;
  credential.available_scopes = [...params.availableScopes];
  credential.created_by = params.createdByUserId;
  credential.setPathParams({ organization_id: params.organizationId });
  await credential.save();
  return credential;
}

export async function listSharedCredentials(organizationId: string): Promise<SharedCredentialModel[]> {
  return SharedCredentialModel.initPath({ organization_id: organizationId })
    .where('organization_id', '==', organizationId)
    .get();
}

export interface CreateResourceTemplateParams {
  organizationId: string;
  name: string;
  type: ResourceTemplateType;
  config?: Record<string, unknown>;
  createdByUserId: string;
}

export async function createResourceTemplate(params: CreateResourceTemplateParams): Promise<ResourceTemplateModel> {
  const template = new ResourceTemplateModel();
  template.name = params.name;
  template.organization_id = params.organizationId;
  template.type = params.type;
  template.version = 1;
  template.config = params.config;
  template.created_by = params.createdByUserId;
  template.setPathParams({ organization_id: params.organizationId });
  await template.save();
  return template;
}

export async function listResourceTemplates(organizationId: string): Promise<ResourceTemplateModel[]> {
  return ResourceTemplateModel.initPath({ organization_id: organizationId })
    .where('organization_id', '==', organizationId)
    .get();
}

export interface CreateOrgPersonParams {
  organizationId: string;
  name: string;
  email?: string;
  title?: string;
  photoUrl?: string;
  createdByUserId: string;
}

export async function createOrgPerson(params: CreateOrgPersonParams): Promise<OrgPersonModel> {
  const person = new OrgPersonModel();
  person.name = params.name;
  person.organization_id = params.organizationId;
  person.email = params.email;
  person.title = params.title;
  person.photo_url = params.photoUrl;
  person.created_by = params.createdByUserId;
  person.setPathParams({ organization_id: params.organizationId });
  await person.save();
  return person;
}

export async function listOrgPeople(organizationId: string): Promise<OrgPersonModel[]> {
  return OrgPersonModel.initPath({ organization_id: organizationId })
    .where('organization_id', '==', organizationId)
    .get();
}

/** Loads the named resource by kind and confirms it actually belongs to `organizationId` (never trust a caller-supplied id blindly). */
async function requireResourceInOrg(
  organizationId: string,
  resourceKind: ResourceKind,
  resourceId: string,
): Promise<SharedCredentialModel | ResourceTemplateModel | OrgPersonModel> {
  const resource =
    resourceKind === 'credential'
      ? await SharedCredentialModel.init(resourceId, { organization_id: organizationId })
      : resourceKind === 'template'
        ? await ResourceTemplateModel.init(resourceId, { organization_id: organizationId })
        : await OrgPersonModel.init(resourceId, { organization_id: organizationId });

  if (!resource || resource.organization_id !== organizationId) {
    throw new ResourceNotFoundError();
  }
  return resource;
}

export interface RequestResourceAttachmentParams {
  organizationId: string;
  projectId: string;
  resourceKind: ResourceKind;
  resourceId: string;
  requestedByUserId: string;
  /** Required (and validated against the credential's `available_scopes`) only when `resourceKind === 'credential'`. */
  scopeSelection?: readonly string[];
}

/**
 * A project admin's request to attach a library resource — plan 08 §1.2
 * "project-admin initiated ... approved (or org-admin pushed)". Always lands
 * as `pending`; nothing in this codebase auto-approves an org-admin-pushed
 * attachment (a straightforward follow-up once there's a UI need for it).
 */
export async function requestResourceAttachment(
  params: RequestResourceAttachmentParams,
): Promise<ResourceAttachmentModel> {
  await requireProjectInOrg(params.organizationId, params.projectId);
  const resource = await requireResourceInOrg(params.organizationId, params.resourceKind, params.resourceId);

  if (params.resourceKind === 'credential') {
    const available = new Set((resource as SharedCredentialModel).available_scopes ?? []);
    const requested = params.scopeSelection ?? [];
    if (requested.length === 0 || !requested.every((scope) => available.has(scope))) {
      throw new InvalidScopeSelectionError();
    }
  }

  const attachment = new ResourceAttachmentModel();
  attachment.organization_id = params.organizationId;
  attachment.project_id = params.projectId;
  attachment.resource_kind = params.resourceKind;
  attachment.resource_id = params.resourceId;
  attachment.status = 'pending';
  attachment.scope_selection = params.resourceKind === 'credential' ? [...(params.scopeSelection ?? [])] : undefined;
  attachment.resource_version = params.resourceKind === 'template' ? (resource as ResourceTemplateModel).version : undefined;
  // Every attachment starts at the safest tier — an org-resource-owner must explicitly raise it (KAN-74, plan `02 §3`).
  attachment.write_tier = 'read';
  attachment.requested_by = params.requestedByUserId;
  attachment.requested_at = new Date().toISOString();
  attachment.setPathParams({ organization_id: params.organizationId });
  await attachment.save();
  return attachment;
}

async function loadAttachment(organizationId: string, attachmentId: string): Promise<ResourceAttachmentModel> {
  const attachment = await ResourceAttachmentModel.init(attachmentId, { organization_id: organizationId });
  if (!attachment || attachment.organization_id !== organizationId) {
    throw new AttachmentNotFoundError();
  }
  return attachment;
}

export interface DecideResourceAttachmentParams {
  organizationId: string;
  attachmentId: string;
  decidedByUserId: string;
  approve: boolean;
}

/** The org-resource-owner (or org-admin) decision on a pending attachment request. */
export async function decideResourceAttachment(
  params: DecideResourceAttachmentParams,
): Promise<ResourceAttachmentModel> {
  const attachment = await loadAttachment(params.organizationId, params.attachmentId);
  if (attachment.status !== 'pending') {
    throw new AttachmentNotPendingError();
  }

  attachment.status = params.approve ? 'approved' : 'rejected';
  attachment.decided_by = params.decidedByUserId;
  attachment.decided_at = new Date().toISOString();
  await attachment.save();
  return attachment;
}

export interface DetachResourceParams {
  organizationId: string;
  attachmentId: string;
}

/** Revokes an approved attachment immediately (plan 08 §1.2). Kept as a `detached` row rather than deleted, for the per-project usage audit trail the plan calls for. */
export async function detachResource(params: DetachResourceParams): Promise<ResourceAttachmentModel> {
  const attachment = await loadAttachment(params.organizationId, params.attachmentId);
  if (attachment.status !== 'approved') {
    throw new AttachmentNotApprovedError();
  }

  attachment.status = 'detached';
  attachment.detached_at = new Date().toISOString();
  await attachment.save();
  return attachment;
}

/** Every attachment (any status) for one project — the admin-facing view of what a project has requested/holds. */
export async function listAttachmentsForProject(
  organizationId: string,
  projectId: string,
): Promise<ResourceAttachmentModel[]> {
  return ResourceAttachmentModel.initPath({ organization_id: organizationId })
    .where('project_id', '==', projectId)
    .get();
}

/** Every attachment across the org still awaiting a decision — the org-resource-owner's approval queue. */
export async function listPendingAttachmentsForOrg(organizationId: string): Promise<ResourceAttachmentModel[]> {
  return ResourceAttachmentModel.initPath({ organization_id: organizationId })
    .where('organization_id', '==', organizationId)
    .where('status', '==', 'pending')
    .get();
}

/**
 * The actual access-control read: a project only ever "has" a resource
 * through an `approved` attachment, and only ever sees the
 * `scope_selection` slice for a credential — never the credential's full
 * `available_scopes`, and never another project's own attachment/slice of
 * the same shared credential.
 */
export async function listActiveAttachmentsForProject(
  organizationId: string,
  projectId: string,
): Promise<ResourceAttachmentModel[]> {
  return ResourceAttachmentModel.initPath({ organization_id: organizationId })
    .where('project_id', '==', projectId)
    .where('status', '==', 'approved')
    .get();
}

export interface SetResourceAttachmentWriteTierParams {
  organizationId: string;
  attachmentId: string;
  tier: ConnectionWriteTier;
  actorId: string;
}

/**
 * The org-resource-owner's write-tier selector for a connection (KAN-74,
 * plan `02 §3`: Read/Optimize/Manage). Only meaningful for an `approved`
 * `credential` attachment — a `pending`/`rejected`/`detached` one, or a
 * `template`/`person` attachment, has no write capability to tier in the
 * first place. Takes effect immediately: `automation.service.ts` always
 * re-resolves the connection's current tier rather than caching it, so a
 * downgrade blocks the very next propose/approve/execute call.
 */
export async function setResourceAttachmentWriteTier(
  params: SetResourceAttachmentWriteTierParams,
): Promise<ResourceAttachmentModel> {
  const attachment = await loadAttachment(params.organizationId, params.attachmentId);
  if (attachment.resource_kind !== 'credential') {
    throw new AttachmentNotCredentialError();
  }
  if (attachment.status !== 'approved') {
    throw new AttachmentNotApprovedError();
  }
  if (!isConnectionWriteTier(params.tier)) {
    throw new InvalidWriteTierError();
  }

  const before = attachment.write_tier;
  attachment.write_tier = params.tier;
  attachment.write_tier_updated_at = new Date().toISOString();
  attachment.write_tier_updated_by_user_id = params.actorId;
  await attachment.save();

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: attachment.project_id,
      actorType: 'user',
      actorId: params.actorId,
      action: 'resource_attachment.write_tier_change',
      targetType: 'resource_attachment',
      targetId: attachment.id,
      summary: `Set the connection's write tier to "${params.tier}"`,
      before: { tier: before },
      after: { tier: params.tier },
    });
  } catch {
    // Best-effort — see recordAuditLogEntry's own doc comment.
  }

  return attachment;
}
