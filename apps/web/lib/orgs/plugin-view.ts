import type {
  PluginConfigFieldSchema,
  PluginInstallModel,
  PluginInstallStatus,
  PluginManifestModel,
  PluginManifestRegisters,
  PluginScope,
  PluginType,
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
