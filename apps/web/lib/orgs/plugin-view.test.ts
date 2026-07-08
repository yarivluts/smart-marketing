import { describe, expect, it } from 'vitest';
import {
  groupManifestsByPluginId,
  hasActiveInstall,
  pluginTypeForInstall,
  sourceRunStatusLabelKey,
  toPluginInstallView,
  toPluginManifestView,
  toSourcePluginRunView,
  type PluginInstallView,
  type PluginManifestView,
} from './plugin-view';
import type { PluginInstallModel, PluginManifestModel, PluginSourceRunModel } from '@growthos/firebase-orm-models';

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

describe('pluginTypeForInstall', () => {
  const manifests: PluginManifestView[] = [
    toPluginManifestView(manifest({ id: 'm1', plugin_id: 'com.example.shopify-pack', version: '1.0.0', type: 'source' })),
    toPluginManifestView(manifest({ id: 'm2', plugin_id: 'com.example.shopify-pack', version: '2.0.0', type: 'source' })),
    toPluginManifestView(manifest({ id: 'm3', plugin_id: 'com.example.stripe-pack', version: '1.0.0', type: 'action' })),
  ];

  it("resolves an install's manifest type by matching plugin id and version", () => {
    const view = toPluginInstallView(install({ id: 'i1', plugin_id: 'com.example.stripe-pack', status: 'installed', version: '1.0.0' }));
    expect(pluginTypeForInstall(view, manifests)).toBe('action');
  });

  it('matches the exact pinned version, not just the newest one for that plugin id', () => {
    const view = toPluginInstallView(install({ id: 'i1', plugin_id: 'com.example.shopify-pack', status: 'installed', version: '1.0.0' }));
    expect(pluginTypeForInstall(view, manifests)).toBe('source');
  });

  it('is undefined when no manifest matches', () => {
    const view = toPluginInstallView(install({ id: 'i1', plugin_id: 'com.example.does-not-exist', status: 'installed', version: '9.9.9' }));
    expect(pluginTypeForInstall(view, manifests)).toBeUndefined();
  });
});

function sourceRun(overrides: Partial<PluginSourceRunModel> & Pick<PluginSourceRunModel, 'id' | 'status'>): PluginSourceRunModel {
  return {
    organization_id: 'org-1',
    project_id: 'project-1',
    plugin_install_id: 'install-1',
    environment_id: 'env-1',
    trigger: 'manual',
    started_at: '2026-01-01T00:00:00.000Z',
    attempts: 1,
    cursor_before: null,
    ...overrides,
  } as PluginSourceRunModel;
}

describe('toSourcePluginRunView', () => {
  it('maps missing optional fields to null, not undefined', () => {
    const view = toSourcePluginRunView(sourceRun({ id: 'r1', status: 'running' }));
    expect(view.finishedAt).toBeNull();
    expect(view.cursorAfter).toBeNull();
    expect(view.recordKind).toBeNull();
    expect(view.recordsFetched).toBeNull();
    expect(view.recordsAccepted).toBeNull();
    expect(view.recordsQuarantined).toBeNull();
    expect(view.recordsDuplicate).toBeNull();
    expect(view.errorMessage).toBeNull();
  });

  it('maps a succeeded run through in full', () => {
    const view = toSourcePluginRunView(
      sourceRun({
        id: 'r1',
        status: 'succeeded',
        finished_at: '2026-01-01T00:05:00.000Z',
        attempts: 2,
        cursor_before: '3',
        cursor_after: '6',
        record_kind: 'event',
        records_fetched: 3,
        records_accepted: 2,
        records_quarantined: 1,
        records_duplicate: 0,
      }),
    );
    expect(view).toEqual({
      id: 'r1',
      status: 'succeeded',
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: '2026-01-01T00:05:00.000Z',
      attempts: 2,
      cursorBefore: '3',
      cursorAfter: '6',
      recordKind: 'event',
      recordsFetched: 3,
      recordsAccepted: 2,
      recordsQuarantined: 1,
      recordsDuplicate: 0,
      errorMessage: null,
    });
  });

  it('carries an error message through for a failed run', () => {
    const view = toSourcePluginRunView(sourceRun({ id: 'r1', status: 'failed', error_message: 'boom' }));
    expect(view.errorMessage).toBe('boom');
  });
});

describe('sourceRunStatusLabelKey', () => {
  it('maps every status to its own translation key', () => {
    expect(sourceRunStatusLabelKey('running')).toBe('sourceRunStatusRunning');
    expect(sourceRunStatusLabelKey('succeeded')).toBe('sourceRunStatusSucceeded');
    expect(sourceRunStatusLabelKey('failed')).toBe('sourceRunStatusFailed');
  });
});
