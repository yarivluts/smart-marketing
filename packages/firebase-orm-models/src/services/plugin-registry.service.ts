import { parsePluginManifest, type PluginConfigFieldSchema } from '@growthos/shared';
import { ProjectModel } from '../models/project.model';
import { PluginManifestModel } from '../models/plugin-manifest.model';
import { PluginInstallModel, type PluginInstallStatus } from '../models/plugin-install.model';
import { ProjectNotFoundError } from './resource-library.service';
import { recordAuditLogEntry } from './audit-log.service';

export class DuplicatePluginManifestError extends Error {
  constructor() {
    super('This plugin id + version is already registered in this organization. Publish a new version instead.');
    this.name = 'DuplicatePluginManifestError';
  }
}

export class PluginManifestNotFoundError extends Error {
  constructor() {
    super('No matching plugin manifest version is registered in this organization.');
    this.name = 'PluginManifestNotFoundError';
  }
}

export class PluginInstallNotFoundError extends Error {
  constructor() {
    super('Plugin install not found in this project.');
    this.name = 'PluginInstallNotFoundError';
  }
}

export class PluginAlreadyInstalledError extends Error {
  constructor() {
    super('This plugin is already installed in this project. Uninstall it first to install a different version.');
    this.name = 'PluginAlreadyInstalledError';
  }
}

export class InvalidPluginInstallStateError extends Error {
  constructor(action: string, currentStatus: PluginInstallStatus) {
    super(`Cannot ${action} a plugin install that is currently "${currentStatus}".`);
    this.name = 'InvalidPluginInstallStateError';
  }
}

export class PluginScopeConsentMismatchError extends Error {
  constructor(
    public readonly missing: readonly string[],
    public readonly unexpected: readonly string[],
  ) {
    super(
      'The consented scopes must exactly match the manifest\'s declared scopes.' +
        (missing.length > 0 ? ` Missing: ${missing.join(', ')}.` : '') +
        (unexpected.length > 0 ? ` Unexpected: ${unexpected.join(', ')}.` : ''),
    );
    this.name = 'PluginScopeConsentMismatchError';
  }
}

export class InvalidPluginConfigError extends Error {
  constructor(public readonly reasons: readonly string[]) {
    super(`Invalid plugin config: ${reasons.join('; ')}`);
    this.name = 'InvalidPluginConfigError';
  }
}

async function requireProjectInOrg(organizationId: string, projectId: string): Promise<ProjectModel> {
  const project = await ProjectModel.init(projectId, { organization_id: organizationId });
  if (!project || project.organization_id !== organizationId) {
    throw new ProjectNotFoundError();
  }
  return project;
}

/** Ascending numeric compare of two `major.minor.patch` strings — `parsePluginManifest` already guarantees this shape, so no fallback for a malformed string is needed here. */
function compareSemver(a: string, b: string): number {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (partsA[i] !== partsB[i]) {
      return partsA[i] - partsB[i];
    }
  }
  return 0;
}

/** Cheap existence check for `registerPluginManifest` — a `.limit(1)` query instead of fetching every version just to check `.length > 0`. */
async function pluginVersionExists(organizationId: string, pluginId: string, version: string): Promise<boolean> {
  const matches = await PluginManifestModel.initPath({ organization_id: organizationId })
    .where('plugin_id', '==', pluginId)
    .where('version', '==', version)
    .limit(1)
    .get();
  return matches.length > 0;
}

export interface RegisterPluginManifestParams {
  organizationId: string;
  manifestYaml: string;
  registeredByUserId: string;
}

/**
 * Parses and registers one immutable `(plugin_id, version)` catalog entry
 * (KAN-46 AC: "registry storage"). Not transactional — the same documented,
 * deliberately-deferred tradeoff `registerSchemaDefinition` accepts for the
 * same reason (raw Firestore SDK/transaction access is reserved to
 * `firestore-connection.ts`): two concurrent registrations of the same
 * brand-new `(plugin_id, version)` can both pass the existence check before
 * either writes.
 */
export async function registerPluginManifest(params: RegisterPluginManifestParams): Promise<PluginManifestModel> {
  const manifest = parsePluginManifest(params.manifestYaml);

  const alreadyExists = await pluginVersionExists(params.organizationId, manifest.id, manifest.version);
  if (alreadyExists) {
    throw new DuplicatePluginManifestError();
  }

  const record = new PluginManifestModel();
  record.organization_id = params.organizationId;
  record.plugin_id = manifest.id;
  record.version = manifest.version;
  record.type = manifest.type;
  record.display_name = manifest.displayName;
  record.scopes = [...manifest.scopes];
  record.config_schema = manifest.configSchema;
  record.registers = manifest.registers;
  record.endpoints = manifest.endpoints;
  record.raw_manifest = params.manifestYaml;
  record.registered_by = params.registeredByUserId;
  record.registered_at = new Date().toISOString();
  record.setPathParams({ organization_id: params.organizationId });
  await record.save();

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      actorType: 'user',
      actorId: params.registeredByUserId,
      action: 'plugin_manifest.register',
      targetType: 'plugin_manifest',
      targetId: record.id,
      summary: `Registered plugin manifest "${record.plugin_id}" v${record.version}`,
      after: { type: record.type, scopes: record.scopes },
    });
  } catch {
    // Best-effort — audit logging must never turn a successful registration into a failure for the caller.
  }

  return record;
}

/** Every registered version of every plugin in an org, sorted by plugin id then semver ascending — the admin browse view groups by plugin id client-side. */
export async function listPluginManifestsForOrg(organizationId: string): Promise<PluginManifestModel[]> {
  const manifests = await PluginManifestModel.initPath({ organization_id: organizationId }).query().get();
  return manifests.sort(
    (a: PluginManifestModel, b: PluginManifestModel) => a.plugin_id.localeCompare(b.plugin_id) || compareSemver(a.version, b.version),
  );
}

/** One exact registered version, or `null` if it's never been registered. */
export async function getPluginManifestVersion(
  organizationId: string,
  pluginId: string,
  version: string,
): Promise<PluginManifestModel | null> {
  const matches = await PluginManifestModel.initPath({ organization_id: organizationId })
    .where('plugin_id', '==', pluginId)
    .where('version', '==', version)
    .limit(1)
    .get();
  return matches[0] ?? null;
}

/** The highest-semver registered version of one plugin, or `null` if it's never been registered. */
export async function getLatestPluginManifestVersion(
  organizationId: string,
  pluginId: string,
): Promise<PluginManifestModel | null> {
  const versions = await PluginManifestModel.initPath({ organization_id: organizationId })
    .where('plugin_id', '==', pluginId)
    .get();
  if (versions.length === 0) {
    return null;
  }
  return versions.reduce((latest, candidate) => (compareSemver(candidate.version, latest.version) > 0 ? candidate : latest));
}

function validatePluginConfig(configSchema: Record<string, PluginConfigFieldSchema>, config: Record<string, unknown>): string[] {
  const reasons: string[] = [];
  for (const [name, field] of Object.entries(configSchema)) {
    const value = config[name];
    if (value === undefined) {
      if (field.required) {
        reasons.push(`Config field "${name}" is required.`);
      }
      continue;
    }
    if (typeof value !== field.type) {
      reasons.push(`Config field "${name}" must be of type "${field.type}".`);
    }
  }
  return reasons;
}

/**
 * Cheap existence check for `installPlugin` — an install is "active" while
 * `installed` or `disabled`; only `uninstalled` (terminal) permits a fresh
 * install. Filters `status` in code rather than as a second Firestore
 * equality/`in` clause: a project only ever has a handful of install
 * documents (historical + active) per plugin id, so reading all of them and
 * filtering here is cheaper than risking an unsupported/composite-index-
 * requiring query shape for a check this small.
 */
async function findActiveInstall(organizationId: string, projectId: string, pluginId: string): Promise<PluginInstallModel | undefined> {
  const matches = await PluginInstallModel.initPath({ organization_id: organizationId, project_id: projectId })
    .where('plugin_id', '==', pluginId)
    .get();
  return matches.find((install) => install.status === 'installed' || install.status === 'disabled');
}

export interface InstallPluginParams {
  organizationId: string;
  projectId: string;
  pluginId: string;
  version: string;
  /** Must exactly match the manifest version's own `scopes` — the scope-consent screen's whole point (plan `12 §5`). */
  consentedScopes: readonly string[];
  config: Record<string, unknown>;
  installedByUserId: string;
}

/**
 * Installs one plugin version into a project (KAN-46 AC: "install-per-
 * project flow (scope consent screen)"). Requires the caller's consented
 * scopes to exactly match the manifest's declared scopes — a partial
 * consent would mean the plugin can't actually do what it says, and an
 * inflated one would mean the admin approved more than the screen actually
 * showed them.
 */
export async function installPlugin(params: InstallPluginParams): Promise<PluginInstallModel> {
  await requireProjectInOrg(params.organizationId, params.projectId);

  const manifest = await getPluginManifestVersion(params.organizationId, params.pluginId, params.version);
  if (!manifest) {
    throw new PluginManifestNotFoundError();
  }

  const declared = new Set<string>(manifest.scopes);
  const consented = new Set<string>(params.consentedScopes);
  const missing = [...declared].filter((scope) => !consented.has(scope));
  const unexpected = [...consented].filter((scope) => !declared.has(scope));
  if (missing.length > 0 || unexpected.length > 0) {
    throw new PluginScopeConsentMismatchError(missing, unexpected);
  }

  const configReasons = validatePluginConfig(manifest.config_schema, params.config);
  if (configReasons.length > 0) {
    throw new InvalidPluginConfigError(configReasons);
  }

  const existingActive = await findActiveInstall(params.organizationId, params.projectId, params.pluginId);
  if (existingActive) {
    throw new PluginAlreadyInstalledError();
  }

  const install = new PluginInstallModel();
  install.organization_id = params.organizationId;
  install.project_id = params.projectId;
  install.plugin_id = params.pluginId;
  install.version = params.version;
  install.status = 'installed';
  install.granted_scopes = [...manifest.scopes];
  install.config = params.config;
  install.installed_by = params.installedByUserId;
  install.installed_at = new Date().toISOString();
  install.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
  await install.save();

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      actorType: 'user',
      actorId: params.installedByUserId,
      action: 'plugin.install',
      targetType: 'plugin_install',
      targetId: install.id,
      summary: `Installed plugin "${params.pluginId}" v${params.version}`,
      after: { scopes: install.granted_scopes },
    });
  } catch {
    // Best-effort — see registerPluginManifest's own comment above.
  }

  return install;
}

/** Every install (any status) in a project, newest first — the admin surface needs to show disabled/uninstalled history alongside active installs. */
export async function listPluginInstallsForProject(organizationId: string, projectId: string): Promise<PluginInstallModel[]> {
  await requireProjectInOrg(organizationId, projectId);
  const installs = await PluginInstallModel.initPath({ organization_id: organizationId, project_id: projectId }).query().get();
  return installs.sort((a: PluginInstallModel, b: PluginInstallModel) => b.installed_at.localeCompare(a.installed_at));
}

async function requireInstallInProject(organizationId: string, projectId: string, installId: string): Promise<PluginInstallModel> {
  const install = await PluginInstallModel.init(installId, { organization_id: organizationId, project_id: projectId });
  if (!install || install.organization_id !== organizationId || install.project_id !== projectId) {
    throw new PluginInstallNotFoundError();
  }
  return install;
}

/** Single-install lookup, `null` (not a thrown 404) when it doesn't resolve in this project — for a caller (KAN-49's "Run now" route) that needs to branch on an install's own `plugin_id` before deciding how to run it, not one that treats "missing" as an error in its own right. */
export async function getPluginInstall(organizationId: string, projectId: string, installId: string): Promise<PluginInstallModel | null> {
  const install = await PluginInstallModel.init(installId, { organization_id: organizationId, project_id: projectId });
  if (!install || install.organization_id !== organizationId || install.project_id !== projectId) {
    return null;
  }
  return install;
}

interface PluginInstallLifecycleParams {
  organizationId: string;
  projectId: string;
  installId: string;
  performedByUserId: string;
}

/** Pauses an active install without losing its config/consent (KAN-46 AC: "disable" lifecycle). */
export async function disablePlugin(params: PluginInstallLifecycleParams): Promise<PluginInstallModel> {
  const install = await requireInstallInProject(params.organizationId, params.projectId, params.installId);
  if (install.status !== 'installed') {
    throw new InvalidPluginInstallStateError('disable', install.status);
  }
  install.status = 'disabled';
  install.disabled_at = new Date().toISOString();
  await install.save();
  await auditPluginInstallLifecycle(params, 'plugin.disable', `Disabled plugin "${install.plugin_id}"`);
  return install;
}

/** Resumes a disabled install — re-enabling doesn't re-prompt scope consent, since `granted_scopes` never changed while disabled. */
export async function enablePlugin(params: PluginInstallLifecycleParams): Promise<PluginInstallModel> {
  const install = await requireInstallInProject(params.organizationId, params.projectId, params.installId);
  if (install.status !== 'disabled') {
    throw new InvalidPluginInstallStateError('enable', install.status);
  }
  install.status = 'installed';
  install.enabled_at = new Date().toISOString();
  await install.save();
  await auditPluginInstallLifecycle(params, 'plugin.enable', `Enabled plugin "${install.plugin_id}"`);
  return install;
}

/** Terminally removes an install (KAN-46 AC: "uninstall" lifecycle) — kept as a document, not deleted, per `PluginInstallModel`'s own doc comment. */
export async function uninstallPlugin(params: PluginInstallLifecycleParams): Promise<PluginInstallModel> {
  const install = await requireInstallInProject(params.organizationId, params.projectId, params.installId);
  if (install.status === 'uninstalled') {
    throw new InvalidPluginInstallStateError('uninstall', install.status);
  }
  install.status = 'uninstalled';
  install.uninstalled_at = new Date().toISOString();
  await install.save();
  await auditPluginInstallLifecycle(params, 'plugin.uninstall', `Uninstalled plugin "${install.plugin_id}"`);
  return install;
}

async function auditPluginInstallLifecycle(params: PluginInstallLifecycleParams, action: string, summary: string): Promise<void> {
  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      actorType: 'user',
      actorId: params.performedByUserId,
      action,
      targetType: 'plugin_install',
      targetId: params.installId,
      summary,
    });
  } catch {
    // Best-effort — see registerPluginManifest's own comment above.
  }
}
