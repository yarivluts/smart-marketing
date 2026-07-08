import type {
  PluginConfigFieldSchema,
  PluginInstallModel,
  PluginInstallStatus,
  PluginManifestModel,
  PluginManifestRegisters,
  PluginScope,
  PluginSourceRunModel,
  PluginSourceRunStatus,
  PluginType,
  SchemaDefKind,
} from '@growthos/firebase-orm-models';

/**
 * A plain, serializable projection of one registered manifest version
 * (KAN-46). Client components can only ever receive plain data across the
 * RSC boundary, never an `@arbel/firebase-orm` model instance — same
 * reasoning as `toOrchestrationRunView`.
 */
export interface PluginManifestView {
  id: string;
  pluginId: string;
  version: string;
  type: PluginType;
  displayName: string;
  scopes: PluginScope[];
  configSchema: Record<string, PluginConfigFieldSchema>;
  registers: PluginManifestRegisters;
  registeredAt: string;
}

export function toPluginManifestView(manifest: PluginManifestModel): PluginManifestView {
  return {
    id: manifest.id,
    pluginId: manifest.plugin_id,
    version: manifest.version,
    type: manifest.type,
    displayName: manifest.display_name,
    scopes: manifest.scopes,
    configSchema: manifest.config_schema,
    registers: manifest.registers,
    registeredAt: manifest.registered_at,
  };
}

export interface PluginFamilyView {
  pluginId: string;
  /** The newest registered version's own display name — a plugin's identity, not its per-version metadata, is what a browse view groups by. */
  displayName: string;
  /** Oldest to newest. */
  versions: PluginManifestView[];
}

/** Groups a flat, already-sorted (`listPluginManifestsForOrg`) list of versions by plugin id, for the registry browse view. */
export function groupManifestsByPluginId(manifests: readonly PluginManifestView[]): PluginFamilyView[] {
  const byPluginId = new Map<string, PluginManifestView[]>();
  for (const manifest of manifests) {
    const versions = byPluginId.get(manifest.pluginId) ?? [];
    versions.push(manifest);
    byPluginId.set(manifest.pluginId, versions);
  }
  return [...byPluginId.entries()]
    .map(([pluginId, versions]) => ({ pluginId, displayName: versions[versions.length - 1].displayName, versions }))
    .sort((a, b) => a.pluginId.localeCompare(b.pluginId));
}

export interface PluginInstallView {
  id: string;
  pluginId: string;
  version: string;
  status: PluginInstallStatus;
  grantedScopes: PluginScope[];
  config: Record<string, unknown>;
  installedAt: string;
  disabledAt: string | null;
  enabledAt: string | null;
  uninstalledAt: string | null;
}

export function toPluginInstallView(install: PluginInstallModel): PluginInstallView {
  return {
    id: install.id,
    pluginId: install.plugin_id,
    version: install.version,
    status: install.status,
    grantedScopes: install.granted_scopes,
    config: install.config,
    installedAt: install.installed_at,
    disabledAt: install.disabled_at ?? null,
    enabledAt: install.enabled_at ?? null,
    uninstalledAt: install.uninstalled_at ?? null,
  };
}

/** Whether a project's install list already has an active (`installed`/`disabled`) entry for a given plugin id — the install form uses this to decide whether to offer "install" for that plugin. */
export function hasActiveInstall(installs: readonly PluginInstallView[], pluginId: string): boolean {
  return installs.some((install) => install.pluginId === pluginId && install.status !== 'uninstalled');
}

/**
 * The manifest `type` for one install, resolved by matching its own
 * `pluginId`+`version` against the org's registered manifests (KAN-47's
 * "only a source-type install has a runnable sync" section needs this —
 * `PluginInstallView` itself doesn't carry `type`, only the manifest it was
 * installed from does). `undefined` if the manifest version was somehow
 * deregistered out from under an existing install (shouldn't happen —
 * manifests are immutable/append-only — but a view helper shouldn't assume).
 */
export function pluginTypeForInstall(install: PluginInstallView, manifests: readonly PluginManifestView[]): PluginType | undefined {
  return manifests.find((manifest) => manifest.pluginId === install.pluginId && manifest.version === install.version)?.type;
}

export interface PluginSourceRunView {
  id: string;
  status: PluginSourceRunStatus;
  startedAt: string;
  finishedAt: string | null;
  attempts: number;
  cursorBefore: string | null;
  cursorAfter: string | null;
  recordKind: SchemaDefKind | null;
  recordsFetched: number | null;
  recordsAccepted: number | null;
  recordsQuarantined: number | null;
  recordsDuplicate: number | null;
  /** Present only for a `failed` run. */
  errorMessage: string | null;
}

export function toSourcePluginRunView(run: PluginSourceRunModel): PluginSourceRunView {
  return {
    id: run.id,
    status: run.status,
    startedAt: run.started_at,
    finishedAt: run.finished_at ?? null,
    attempts: run.attempts,
    cursorBefore: run.cursor_before,
    cursorAfter: run.cursor_after ?? null,
    recordKind: run.record_kind ?? null,
    recordsFetched: run.records_fetched ?? null,
    recordsAccepted: run.records_accepted ?? null,
    recordsQuarantined: run.records_quarantined ?? null,
    recordsDuplicate: run.records_duplicate ?? null,
    errorMessage: run.error_message ?? null,
  };
}

const SOURCE_RUN_STATUS_LABEL_KEYS: Record<PluginSourceRunStatus, 'sourceRunStatusRunning' | 'sourceRunStatusSucceeded' | 'sourceRunStatusFailed'> = {
  running: 'sourceRunStatusRunning',
  succeeded: 'sourceRunStatusSucceeded',
  failed: 'sourceRunStatusFailed',
};

export function sourceRunStatusLabelKey(
  status: PluginSourceRunStatus,
): 'sourceRunStatusRunning' | 'sourceRunStatusSucceeded' | 'sourceRunStatusFailed' {
  return SOURCE_RUN_STATUS_LABEL_KEYS[status];
}
