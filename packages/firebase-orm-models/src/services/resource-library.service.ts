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

export class ResourceArchivedError extends Error {
  constructor() {
    super('This resource has been archived and can no longer be attached to a project.');
    this.name = 'ResourceArchivedError';
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

/** Loads one org shared credential and confirms it actually belongs to `organizationId` (never trust a caller-supplied id blindly). Shared by {@link requireResourceInOrg} and {@link updateSharedCredential}, mirroring {@link loadOrgPerson}/{@link loadResourceTemplate}. */
async function loadSharedCredential(organizationId: string, credentialId: string): Promise<SharedCredentialModel> {
  const credential = await SharedCredentialModel.init(credentialId, { organization_id: organizationId });
  if (!credential || credential.organization_id !== organizationId) {
    throw new ResourceNotFoundError();
  }
  return credential;
}

export interface UpdateSharedCredentialParams {
  organizationId: string;
  credentialId: string;
  name: string;
  /** Always a full replace of the credential's whole scope slice, not a sparse patch — same posture `updateOrgPerson`/`updateResourceTemplate` use for their own optional fields, but required here (never omitted) since `available_scopes` is itself always an array (possibly empty), never absent, from `createSharedCredential` onward. */
  availableScopes: readonly string[];
  actorId: string;
}

/**
 * Corrects an existing shared credential's own name/available-scope slice.
 * Unlike `createOrgPerson`/`createResourceTemplate` (both closed by
 * KAN-100/KAN-117), `createSharedCredential`/`listSharedCredentials` had
 * create + list only, the same "everything user-manageable gets an admin
 * surface" gap — a credential's name (e.g. fixing a typo) or its
 * `available_scopes` slice (e.g. a new ad account becomes available under
 * the same Google Ads MCC login) could never be changed once registered,
 * only replaced by delete-and-recreate, which would orphan any project's
 * already-approved {@link ResourceAttachmentModel} pointing at the old
 * credential id. `provider` is deliberately not editable here, the same way
 * `updateResourceTemplate` leaves `ResourceTemplateModel.type` immutable —
 * changing what a credential authenticates against isn't a correction, it's
 * a different credential. Narrowing `available_scopes` never retroactively
 * invalidates an already-approved attachment's own `scope_selection` copy —
 * same "the attachment keeps whatever it was granted" posture
 * `updateResourceTemplate`'s own doc comment documents for `resource_version`.
 * The credential's secret is untouched here; it's set separately via
 * `vault.service.ts`'s `setSharedCredentialSecret` (KAN-29).
 */
export async function updateSharedCredential(params: UpdateSharedCredentialParams): Promise<SharedCredentialModel> {
  const credential = await loadSharedCredential(params.organizationId, params.credentialId);

  const before = { name: credential.name, availableScopes: credential.available_scopes ?? [] };

  credential.name = params.name;
  credential.available_scopes = [...params.availableScopes];
  await credential.save();

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      actorType: 'user',
      actorId: params.actorId,
      action: 'shared_credential.update',
      targetType: 'shared_credential',
      targetId: credential.id,
      summary: `Updated credential "${credential.name}"`,
      before,
      after: { name: credential.name, availableScopes: credential.available_scopes ?? [] },
    });
  } catch {
    // Best-effort — see recordAuditLogEntry's own doc comment.
  }

  return credential;
}

export interface ArchiveSharedCredentialParams {
  organizationId: string;
  credentialId: string;
  archivedByUserId: string;
}

/**
 * Retires a shared credential from the library (KAN-129 — `createSharedCredential`/
 * `listSharedCredentials`/`updateSharedCredential` had no removal path at all; a credential no
 * longer in use stayed visible forever in every attach picker with no way to retire it, the same
 * "everything user-manageable gets an admin surface" gap `disableHookEndpoint` closed for hook
 * endpoints). A hard delete would orphan any project's already-approved
 * {@link ResourceAttachmentModel} still pointing at this credential's id, so this only hides it from
 * future attach requests/pushes ({@link validateAttachmentTarget}) — an already-approved attachment
 * keeps working. Idempotent — re-archiving an already-archived credential just refreshes
 * `archived_at`/`archived_by`, the same "safe to retry" posture `disableHookEndpoint` establishes.
 */
export async function archiveSharedCredential(params: ArchiveSharedCredentialParams): Promise<SharedCredentialModel> {
  const credential = await loadSharedCredential(params.organizationId, params.credentialId);
  credential.archived_at = new Date().toISOString();
  credential.archived_by = params.archivedByUserId;
  await credential.save();

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      actorType: 'user',
      actorId: params.archivedByUserId,
      action: 'shared_credential.archive',
      targetType: 'shared_credential',
      targetId: credential.id,
      summary: `Archived credential "${credential.name}"`,
    });
  } catch {
    // Best-effort — see recordAuditLogEntry's own doc comment.
  }

  return credential;
}

export interface UnarchiveSharedCredentialParams {
  organizationId: string;
  credentialId: string;
  unarchivedByUserId: string;
}

/** Resumes an archived credential's pickability (the counterpart {@link archiveSharedCredential} never got — see `enableHookEndpoint`'s own doc comment for why that gap matters). Idempotent, same posture as `archiveSharedCredential`. */
export async function unarchiveSharedCredential(
  params: UnarchiveSharedCredentialParams,
): Promise<SharedCredentialModel> {
  const credential = await loadSharedCredential(params.organizationId, params.credentialId);
  credential.archived_at = null;
  credential.archived_by = null;
  await credential.save();

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      actorType: 'user',
      actorId: params.unarchivedByUserId,
      action: 'shared_credential.unarchive',
      targetType: 'shared_credential',
      targetId: credential.id,
      summary: `Unarchived credential "${credential.name}"`,
    });
  } catch {
    // Best-effort — see recordAuditLogEntry's own doc comment.
  }

  return credential;
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

/** Loads one org resource template and confirms it actually belongs to `organizationId` (never trust a caller-supplied id blindly). Shared by {@link updateResourceTemplate}, mirroring {@link loadOrgPerson}. */
async function loadResourceTemplate(organizationId: string, templateId: string): Promise<ResourceTemplateModel> {
  const template = await ResourceTemplateModel.init(templateId, { organization_id: organizationId });
  if (!template || template.organization_id !== organizationId) {
    throw new ResourceNotFoundError();
  }
  return template;
}

export interface UpdateResourceTemplateParams {
  organizationId: string;
  templateId: string;
  name: string;
  /** Omit (or pass `undefined`) to clear the template's config — a full replace of the editable fields, the same "not a sparse patch" posture {@link updateOrgPerson} establishes. */
  config?: Record<string, unknown>;
  actorId: string;
}

/**
 * Edits an existing org-standard template's name/config, bumping `version` —
 * `ResourceTemplateModel`'s own doc comment ("`version` increments only
 * when the org resource owner edits the template here") describes exactly
 * this function, but until now nothing implemented it: `createResourceTemplate`/
 * `listResourceTemplates` had create + list only, the same gap
 * `updateOrgPerson` (KAN-100) closed for the people registry. A project's
 * already-approved attachment keeps whatever `resource_version` it was
 * granted at (`ResourceAttachmentModel.resource_version`) — "copy-with-link
 * + version pin" per plan 08 §1.2 — so bumping the template here never
 * silently changes what an already-approved project sees; a project only
 * picks up the new version by requesting/being pushed a fresh attachment.
 */
export async function updateResourceTemplate(params: UpdateResourceTemplateParams): Promise<ResourceTemplateModel> {
  const template = await loadResourceTemplate(params.organizationId, params.templateId);

  const before = { name: template.name, version: template.version, config: template.config ?? null };

  template.name = params.name;
  // `?? null` (never a bare `undefined`) — see `ResourceTemplateModel.config`'s own doc comment:
  // `updateDoc()` drops an `undefined` field entirely instead of clearing it, so omitting `config`
  // here would silently leave the template's previous config in place.
  template.config = params.config ?? null;
  template.version += 1;
  await template.save();

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      actorType: 'user',
      actorId: params.actorId,
      action: 'resource_template.update',
      targetType: 'resource_template',
      targetId: template.id,
      summary: `Updated template "${template.name}" to v${template.version}`,
      before,
      after: { name: template.name, version: template.version, config: template.config ?? null },
    });
  } catch {
    // Best-effort — see recordAuditLogEntry's own doc comment.
  }

  return template;
}

export interface ArchiveResourceTemplateParams {
  organizationId: string;
  templateId: string;
  archivedByUserId: string;
}

/**
 * Retires an org-standard template from the library (KAN-129 — same "create + list + update but no
 * removal path" gap {@link archiveSharedCredential}'s own doc comment describes for credentials). A
 * project's already-approved attachment keeps whatever `resource_version` it was granted at
 * regardless (per `updateResourceTemplate`'s own doc comment); archiving only hides the template
 * from future attach requests/pushes ({@link validateAttachmentTarget}). Idempotent, same posture as
 * `disableHookEndpoint`.
 */
export async function archiveResourceTemplate(params: ArchiveResourceTemplateParams): Promise<ResourceTemplateModel> {
  const template = await loadResourceTemplate(params.organizationId, params.templateId);
  template.archived_at = new Date().toISOString();
  template.archived_by = params.archivedByUserId;
  await template.save();

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      actorType: 'user',
      actorId: params.archivedByUserId,
      action: 'resource_template.archive',
      targetType: 'resource_template',
      targetId: template.id,
      summary: `Archived template "${template.name}"`,
    });
  } catch {
    // Best-effort — see recordAuditLogEntry's own doc comment.
  }

  return template;
}

export interface UnarchiveResourceTemplateParams {
  organizationId: string;
  templateId: string;
  unarchivedByUserId: string;
}

/** Resumes an archived template's pickability. Idempotent, same posture as `archiveResourceTemplate`. */
export async function unarchiveResourceTemplate(
  params: UnarchiveResourceTemplateParams,
): Promise<ResourceTemplateModel> {
  const template = await loadResourceTemplate(params.organizationId, params.templateId);
  template.archived_at = null;
  template.archived_by = null;
  await template.save();

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      actorType: 'user',
      actorId: params.unarchivedByUserId,
      action: 'resource_template.unarchive',
      targetType: 'resource_template',
      targetId: template.id,
      summary: `Unarchived template "${template.name}"`,
    });
  } catch {
    // Best-effort — see recordAuditLogEntry's own doc comment.
  }

  return template;
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

/** Loads one org person and confirms it actually belongs to `organizationId` (never trust a caller-supplied id blindly). Shared by {@link requireResourceInOrg} and {@link updateOrgPerson}. */
async function loadOrgPerson(organizationId: string, personId: string): Promise<OrgPersonModel> {
  const person = await OrgPersonModel.init(personId, { organization_id: organizationId });
  if (!person || person.organization_id !== organizationId) {
    throw new ResourceNotFoundError();
  }
  return person;
}

export interface UpdateOrgPersonParams {
  organizationId: string;
  personId: string;
  name: string;
  /** Omit (or pass `undefined`) to clear the field — this is a full replace of the editable fields, not a sparse patch, matching `createOrgPerson`'s own optional-field posture. */
  email?: string;
  title?: string;
  photoUrl?: string;
  actorId: string;
}

/**
 * Corrects an existing person's own registry entry. Unlike every other
 * library resource this service manages, `createOrgPerson`/`listOrgPeople`
 * had create + list but no way to fix a typo'd name or a stale
 * email/title/photo once a person was registered — a real gap against this
 * codebase's own "everything user-manageable gets an admin surface" rule,
 * since a person here (KAN-27's `dim_team_member` registry) is referenced
 * by id from goals, segments, and rep-collection entries (KAN-64/76/88), so
 * a rename must update the one shared document those references already
 * point at rather than requiring a delete-and-recreate that would orphan
 * them.
 */
export async function updateOrgPerson(params: UpdateOrgPersonParams): Promise<OrgPersonModel> {
  const person = await loadOrgPerson(params.organizationId, params.personId);

  const before = {
    name: person.name,
    email: person.email ?? null,
    title: person.title ?? null,
    photoUrl: person.photo_url ?? null,
  };

  person.name = params.name;
  person.email = params.email;
  person.title = params.title;
  person.photo_url = params.photoUrl;
  await person.save();

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      actorType: 'user',
      actorId: params.actorId,
      action: 'org_person.update',
      targetType: 'org_person',
      targetId: person.id,
      summary: `Updated person "${person.name}"`,
      before,
      after: { name: person.name, email: person.email ?? null, title: person.title ?? null, photoUrl: person.photo_url ?? null },
    });
  } catch {
    // Best-effort — see recordAuditLogEntry's own doc comment.
  }

  return person;
}

export interface ArchiveOrgPersonParams {
  organizationId: string;
  personId: string;
  archivedByUserId: string;
}

/**
 * Retires a person from the org's people registry (KAN-129 — same "create + list + update but no
 * removal path" gap {@link archiveSharedCredential}'s own doc comment describes for credentials).
 * Never deletes the document — a goal/segment/rep-collection entry may still reference this id
 * (per `updateOrgPerson`'s own doc comment), so a rename/lookup keeps resolving normally; archiving
 * only hides the person from future attach requests/pushes ({@link validateAttachmentTarget}) and
 * from create-time owner/rep pickers elsewhere in the app. Idempotent, same posture as
 * `disableHookEndpoint`.
 */
export async function archiveOrgPerson(params: ArchiveOrgPersonParams): Promise<OrgPersonModel> {
  const person = await loadOrgPerson(params.organizationId, params.personId);
  person.archived_at = new Date().toISOString();
  person.archived_by = params.archivedByUserId;
  await person.save();

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      actorType: 'user',
      actorId: params.archivedByUserId,
      action: 'org_person.archive',
      targetType: 'org_person',
      targetId: person.id,
      summary: `Archived person "${person.name}"`,
    });
  } catch {
    // Best-effort — see recordAuditLogEntry's own doc comment.
  }

  return person;
}

export interface UnarchiveOrgPersonParams {
  organizationId: string;
  personId: string;
  unarchivedByUserId: string;
}

/** Resumes an archived person's pickability. Idempotent, same posture as `archiveOrgPerson`. */
export async function unarchiveOrgPerson(params: UnarchiveOrgPersonParams): Promise<OrgPersonModel> {
  const person = await loadOrgPerson(params.organizationId, params.personId);
  person.archived_at = null;
  person.archived_by = null;
  await person.save();

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      actorType: 'user',
      actorId: params.unarchivedByUserId,
      action: 'org_person.unarchive',
      targetType: 'org_person',
      targetId: person.id,
      summary: `Unarchived person "${person.name}"`,
    });
  } catch {
    // Best-effort — see recordAuditLogEntry's own doc comment.
  }

  return person;
}

/** Loads the named resource by kind and confirms it actually belongs to `organizationId` (never trust a caller-supplied id blindly). */
async function requireResourceInOrg(
  organizationId: string,
  resourceKind: ResourceKind,
  resourceId: string,
): Promise<SharedCredentialModel | ResourceTemplateModel | OrgPersonModel> {
  if (resourceKind === 'person') {
    return loadOrgPerson(organizationId, resourceId);
  }
  if (resourceKind === 'credential') {
    return loadSharedCredential(organizationId, resourceId);
  }
  return loadResourceTemplate(organizationId, resourceId);
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

/** Shared by {@link requestResourceAttachment} and {@link pushResourceAttachment}: confirms the project/resource both belong to the org, and (for a credential) that the requested scope slice is a non-empty subset of what the credential actually offers. */
async function validateAttachmentTarget(
  organizationId: string,
  projectId: string,
  resourceKind: ResourceKind,
  resourceId: string,
  scopeSelection: readonly string[] | undefined,
): Promise<SharedCredentialModel | ResourceTemplateModel | OrgPersonModel> {
  await requireProjectInOrg(organizationId, projectId);
  const resource = await requireResourceInOrg(organizationId, resourceKind, resourceId);

  // An archived resource stays valid for an already-approved attachment (see `archiveOrgPerson`'s
  // own doc comment) but can never start a *new* attachment — KAN-129.
  if (resource.archived_at) {
    throw new ResourceArchivedError();
  }

  if (resourceKind === 'credential') {
    const available = new Set((resource as SharedCredentialModel).available_scopes ?? []);
    const requested = scopeSelection ?? [];
    if (requested.length === 0 || !requested.every((scope) => available.has(scope))) {
      throw new InvalidScopeSelectionError();
    }
  }

  return resource;
}

/**
 * A project admin's request to attach a library resource — plan 08 §1.2
 * "project-admin initiated ... approved (or org-admin pushed)". Always lands
 * as `pending` — the org-admin-pushed half of that sentence is
 * {@link pushResourceAttachment}.
 */
export async function requestResourceAttachment(
  params: RequestResourceAttachmentParams,
): Promise<ResourceAttachmentModel> {
  const resource = await validateAttachmentTarget(
    params.organizationId,
    params.projectId,
    params.resourceKind,
    params.resourceId,
    params.scopeSelection,
  );

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

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      actorType: 'user',
      actorId: params.requestedByUserId,
      action: 'resource_attachment.request',
      targetType: 'resource_attachment',
      targetId: attachment.id,
      summary: `Requested to attach ${params.resourceKind} "${params.resourceId}" to the project`,
      after: {
        status: attachment.status,
        resourceKind: params.resourceKind,
        resourceId: params.resourceId,
        scopeSelection: attachment.scope_selection ?? null,
      },
    });
  } catch {
    // Best-effort — see recordAuditLogEntry's own doc comment.
  }

  return attachment;
}

export interface PushResourceAttachmentParams {
  organizationId: string;
  projectId: string;
  resourceKind: ResourceKind;
  resourceId: string;
  pushedByUserId: string;
  /** Required (and validated against the credential's `available_scopes`) only when `resourceKind === 'credential'`. */
  scopeSelection?: readonly string[];
}

/**
 * The org-admin-pushed half of plan 08 §1.2's "project-admin initiated ...
 * approved (or org-admin pushed)" — an org-resource-owner (`resources.manage`)
 * attaches a library resource straight to a project, skipping the
 * request/approve round trip {@link requestResourceAttachment} +
 * `decideResourceAttachment` requires. Lands directly as `approved`, with the
 * pushing admin recorded as both `requested_by` and `decided_by` (there was
 * never a separate requester) so every downstream read — active-attachment
 * lookups, the audit trail — treats it exactly like an already-decided
 * request, no special-casing needed.
 */
export async function pushResourceAttachment(params: PushResourceAttachmentParams): Promise<ResourceAttachmentModel> {
  const resource = await validateAttachmentTarget(
    params.organizationId,
    params.projectId,
    params.resourceKind,
    params.resourceId,
    params.scopeSelection,
  );

  const now = new Date().toISOString();
  const attachment = new ResourceAttachmentModel();
  attachment.organization_id = params.organizationId;
  attachment.project_id = params.projectId;
  attachment.resource_kind = params.resourceKind;
  attachment.resource_id = params.resourceId;
  attachment.status = 'approved';
  attachment.scope_selection = params.resourceKind === 'credential' ? [...(params.scopeSelection ?? [])] : undefined;
  attachment.resource_version = params.resourceKind === 'template' ? (resource as ResourceTemplateModel).version : undefined;
  attachment.write_tier = 'read';
  attachment.requested_by = params.pushedByUserId;
  attachment.requested_at = now;
  attachment.decided_by = params.pushedByUserId;
  attachment.decided_at = now;
  attachment.setPathParams({ organization_id: params.organizationId });
  await attachment.save();

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      actorType: 'user',
      actorId: params.pushedByUserId,
      action: 'resource_attachment.push',
      targetType: 'resource_attachment',
      targetId: attachment.id,
      summary: `Pushed ${params.resourceKind} "${params.resourceId}" to the project`,
      after: {
        status: attachment.status,
        resourceKind: params.resourceKind,
        resourceId: params.resourceId,
        scopeSelection: attachment.scope_selection ?? null,
      },
    });
  } catch {
    // Best-effort — see recordAuditLogEntry's own doc comment.
  }

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

  // Captured before the mutation, not hardcoded to the guard's `'pending'`
  // literal: the audit entry's `before` is hash-committed (see
  // `recordAuditLogEntry`'s doc comment) into an append-only chain, so it
  // must reflect what the status actually *was* — never an assumption that
  // happens to hold only because of the guard above.
  const statusBeforeDecision = attachment.status;
  attachment.status = params.approve ? 'approved' : 'rejected';
  attachment.decided_by = params.decidedByUserId;
  attachment.decided_at = new Date().toISOString();
  await attachment.save();

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: attachment.project_id,
      actorType: 'user',
      actorId: params.decidedByUserId,
      action: params.approve ? 'resource_attachment.approve' : 'resource_attachment.reject',
      targetType: 'resource_attachment',
      targetId: attachment.id,
      summary: params.approve
        ? `Approved attaching ${attachment.resource_kind} "${attachment.resource_id}" to the project`
        : `Rejected attaching ${attachment.resource_kind} "${attachment.resource_id}" to the project`,
      before: { status: statusBeforeDecision },
      after: { status: attachment.status, scopeSelection: attachment.scope_selection ?? null },
    });
  } catch {
    // Best-effort — see recordAuditLogEntry's own doc comment.
  }

  return attachment;
}

export interface DetachResourceParams {
  organizationId: string;
  attachmentId: string;
  /** The acting admin, recorded on the org's audit-log chain (KAN-44). */
  actorId: string;
}

/** Revokes an approved attachment immediately (plan 08 §1.2). Kept as a `detached` row rather than deleted, for the per-project usage audit trail the plan calls for. */
export async function detachResource(params: DetachResourceParams): Promise<ResourceAttachmentModel> {
  const attachment = await loadAttachment(params.organizationId, params.attachmentId);
  if (attachment.status !== 'approved') {
    throw new AttachmentNotApprovedError();
  }

  // See decideResourceAttachment's own comment on why this is captured, not hardcoded.
  const statusBeforeDetach = attachment.status;
  const scopeSelectionBeforeDetach = attachment.scope_selection ?? null;
  attachment.status = 'detached';
  attachment.detached_at = new Date().toISOString();
  await attachment.save();

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: attachment.project_id,
      actorType: 'user',
      actorId: params.actorId,
      action: 'resource_attachment.detach',
      targetType: 'resource_attachment',
      targetId: attachment.id,
      summary: `Detached ${attachment.resource_kind} "${attachment.resource_id}" from the project`,
      before: { status: statusBeforeDetach, scopeSelection: scopeSelectionBeforeDetach },
      after: { status: attachment.status },
    });
  } catch {
    // Best-effort — see recordAuditLogEntry's own doc comment.
  }

  return attachment;
}

/** Every attachment (any status) for one project — the admin-facing view of what a project has requested/holds. */
export async function listAttachmentsForProject(
  organizationId: string,
  projectId: string,
): Promise<ResourceAttachmentModel[]> {
  await requireProjectInOrg(organizationId, projectId);
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
