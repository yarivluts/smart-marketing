import { describe, expect, it } from 'vitest';
import { groupManifestsByPluginId, hasActiveInstall, toPluginInstallView, toPluginManifestView, type PluginInstallView, type PluginManifestView } from './plugin-view';
import type { PluginInstallModel, PluginManifestModel } from '@growthos/firebase-orm-models';

function manifest(overrides: Partial<PluginManifestModel> & Pick<PluginManifestModel, 'id' | 'plugin_id' | 'version'>): PluginManifestModel {
  return {
    organization_id: 'org-1',
    type: 'source',
    display_name: 'Shopify Commerce Pack',
    scopes: ['ingest:write'],
    config_schema: {},
    registers: { entities: [], events: [], metrics: [] },
    endpoints: {},
    raw_manifest: '',
    registered_by: 'user-1',
    registered_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as PluginManifestModel;
}

function install(overrides: Partial<PluginInstallModel> & Pick<PluginInstallModel, 'id' | 'plugin_id' | 'status'>): PluginInstallModel {
  return {
    organization_id: 'org-1',
    project_id: 'project-1',
    version: '1.0.0',
    granted_scopes: ['ingest:write'],
    config: {},
    installed_by: 'user-1',
    installed_at: '2026-01-01T00:00:00.000Z',
    disabled_at: undefined,
    enabled_at: undefined,
    uninstalled_at: undefined,
    ...overrides,
  } as PluginInstallModel;
}

describe('toPluginManifestView', () => {
  it('maps every field', () => {
    const view = toPluginManifestView(manifest({ id: 'm1', plugin_id: 'com.example.shopify-pack', version: '1.0.0' }));
    expect(view).toEqual({
      id: 'm1',
      pluginId: 'com.example.shopify-pack',
      version: '1.0.0',
      type: 'source',
      displayName: 'Shopify Commerce Pack',
      scopes: ['ingest:write'],
      configSchema: {},
      registers: { entities: [], events: [], metrics: [] },
      registeredAt: '2026-01-01T00:00:00.000Z',
    });
  });
});

describe('groupManifestsByPluginId', () => {
  it('groups an already-sorted flat list by plugin id, keeping version order and the newest display name', () => {
    const views: PluginManifestView[] = [
      toPluginManifestView(manifest({ id: 'm1', plugin_id: 'com.example.shopify-pack', version: '1.0.0', display_name: 'Old Name' })),
      toPluginManifestView(manifest({ id: 'm2', plugin_id: 'com.example.shopify-pack', version: '1.1.0', display_name: 'New Name' })),
      toPluginManifestView(manifest({ id: 'm3', plugin_id: 'com.example.ads-pack', version: '1.0.0' })),
    ];

    const families = groupManifestsByPluginId(views);
    expect(families.map((f) => f.pluginId)).toEqual(['com.example.ads-pack', 'com.example.shopify-pack']);
    const shopify = families.find((f) => f.pluginId === 'com.example.shopify-pack')!;
    expect(shopify.versions.map((v) => v.version)).toEqual(['1.0.0', '1.1.0']);
    expect(shopify.displayName).toBe('New Name');
  });

  it('returns an empty list for no manifests', () => {
    expect(groupManifestsByPluginId([])).toEqual([]);
  });
});

describe('toPluginInstallView', () => {
  it('maps missing optional timestamps to null, not undefined', () => {
    const view = toPluginInstallView(install({ id: 'i1', plugin_id: 'com.example.shopify-pack', status: 'installed' }));
    expect(view.disabledAt).toBeNull();
    expect(view.enabledAt).toBeNull();
    expect(view.uninstalledAt).toBeNull();
  });

  it('maps defined optional timestamps through', () => {
    const view = toPluginInstallView(
      install({ id: 'i1', plugin_id: 'com.example.shopify-pack', status: 'disabled', disabled_at: '2026-01-02T00:00:00.000Z' }),
    );
    expect(view.disabledAt).toBe('2026-01-02T00:00:00.000Z');
  });
});

describe('hasActiveInstall', () => {
  const installs: PluginInstallView[] = [
    toPluginInstallView(install({ id: 'i1', plugin_id: 'com.example.shopify-pack', status: 'installed' })),
    toPluginInstallView(install({ id: 'i2', plugin_id: 'com.example.ads-pack', status: 'uninstalled', uninstalled_at: '2026-01-02T00:00:00.000Z' })),
  ];

  it('is true for a plugin with an installed or disabled install', () => {
    expect(hasActiveInstall(installs, 'com.example.shopify-pack')).toBe(true);
  });

  it('is false for a plugin whose only install is uninstalled', () => {
    expect(hasActiveInstall(installs, 'com.example.ads-pack')).toBe(false);
  });

  it('is false for a plugin id with no install at all', () => {
    expect(hasActiveInstall(installs, 'com.example.does-not-exist')).toBe(false);
  });
});
