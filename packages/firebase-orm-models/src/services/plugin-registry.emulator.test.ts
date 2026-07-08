import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createOrganizationWithOwner,
  createProject,
  disablePlugin,
  DuplicatePluginManifestError,
  enablePlugin,
  ensureUserForFirebaseSession,
  getLatestPluginManifestVersion,
  getPluginManifestVersion,
  installPlugin,
  InvalidPluginConfigError,
  InvalidPluginInstallStateError,
  listAuditLogEntriesForOrg,
  listPluginInstallsForProject,
  listPluginManifestsForOrg,
  PluginAlreadyInstalledError,
  PluginInstallNotFoundError,
  PluginManifestNotFoundError,
  PluginManifestValidationError,
  PluginScopeConsentMismatchError,
  ProjectNotFoundError,
  registerPluginManifest,
  uninstallPlugin,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

/**
 * Emulator-backed tests for KAN-46: `registerPluginManifest`/
 * `listPluginManifestsForOrg`/`getPluginManifestVersion`/
 * `getLatestPluginManifestVersion` (the manifest registry) and
 * `installPlugin`/`listPluginInstallsForProject`/`disablePlugin`/
 * `enablePlugin`/`uninstallPlugin` (the per-project install lifecycle).
 */

beforeAll(async () => {
  await connectToFirestoreEmulator('plugin-registry-tests');
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function uniqueEmail(prefix: string): string {
  return `${unique(prefix)}@example.com`;
}

async function setupOrgWithProject(orgName: string) {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('owner') });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  return { owner, organization, project };
}

function manifestYaml(overrides: { id?: string; version?: string; scopes?: string } = {}): string {
  const id = overrides.id ?? 'com.example.shopify-pack';
  const version = overrides.version ?? '1.0.0';
  const scopes = overrides.scopes ?? '[ingest:write, schema:write]';
  return `
id: ${id}
version: ${version}
type: source
display_name: Shopify Commerce Pack
scopes: ${scopes}
config_schema:
  shop_domain: { type: string, required: true }
registers:
  entities: [product, order]
  events: [order_completed]
`;
}

describe('registerPluginManifest / listPluginManifestsForOrg / getPluginManifestVersion', () => {
  it('registers a manifest and reads it back', async () => {
    const { owner, organization } = await setupOrgWithProject('Plugin Registry Org');
    const registered = await registerPluginManifest({
      organizationId: organization.id,
      manifestYaml: manifestYaml(),
      registeredByUserId: owner.id,
    });

    expect(registered.plugin_id).toBe('com.example.shopify-pack');
    expect(registered.version).toBe('1.0.0');
    expect(registered.scopes).toEqual(['ingest:write', 'schema:write']);

    const fetched = await getPluginManifestVersion(organization.id, 'com.example.shopify-pack', '1.0.0');
    expect(fetched?.id).toBe(registered.id);
    expect(fetched?.raw_manifest).toContain('com.example.shopify-pack');
  });

  it('rejects an invalid manifest', async () => {
    const { owner, organization } = await setupOrgWithProject('Plugin Registry Invalid Org');
    await expect(
      registerPluginManifest({ organizationId: organization.id, manifestYaml: 'not: [valid', registeredByUserId: owner.id }),
    ).rejects.toThrow(PluginManifestValidationError);
  });

  it('rejects registering the same plugin id + version twice', async () => {
    const { owner, organization } = await setupOrgWithProject('Plugin Registry Duplicate Org');
    await registerPluginManifest({ organizationId: organization.id, manifestYaml: manifestYaml(), registeredByUserId: owner.id });
    await expect(
      registerPluginManifest({ organizationId: organization.id, manifestYaml: manifestYaml(), registeredByUserId: owner.id }),
    ).rejects.toThrow(DuplicatePluginManifestError);
  });

  it('allows registering a second version of the same plugin id', async () => {
    const { owner, organization } = await setupOrgWithProject('Plugin Registry Second Version Org');
    await registerPluginManifest({ organizationId: organization.id, manifestYaml: manifestYaml({ version: '1.0.0' }), registeredByUserId: owner.id });
    await registerPluginManifest({ organizationId: organization.id, manifestYaml: manifestYaml({ version: '1.1.0' }), registeredByUserId: owner.id });

    const versions = await listPluginManifestsForOrg(organization.id);
    expect(versions.map((v) => v.version)).toEqual(['1.0.0', '1.1.0']);

    const latest = await getLatestPluginManifestVersion(organization.id, 'com.example.shopify-pack');
    expect(latest?.version).toBe('1.1.0');
  });

  it('does not leak a sibling org’s manifests', async () => {
    const { owner, organization } = await setupOrgWithProject('Plugin Registry Isolation Org A');
    const other = await setupOrgWithProject('Plugin Registry Isolation Org B');
    await registerPluginManifest({ organizationId: organization.id, manifestYaml: manifestYaml(), registeredByUserId: owner.id });
    await registerPluginManifest({ organizationId: other.organization.id, manifestYaml: manifestYaml(), registeredByUserId: other.owner.id });

    const versions = await listPluginManifestsForOrg(organization.id);
    expect(versions).toHaveLength(1);
    expect(versions[0].organization_id).toBe(organization.id);
  });

  it('records an audit log entry when a manifest is registered', async () => {
    const { owner, organization } = await setupOrgWithProject('Plugin Registry Audit Org');
    await registerPluginManifest({ organizationId: organization.id, manifestYaml: manifestYaml(), registeredByUserId: owner.id });

    const entries = await listAuditLogEntriesForOrg(organization.id);
    const entry = entries.find((candidate) => candidate.action === 'plugin_manifest.register');
    expect(entry).toBeDefined();
    expect(entry?.actor_id).toBe(owner.id);
  });

  it('getLatestPluginManifestVersion returns null for an unregistered plugin id', async () => {
    const { organization } = await setupOrgWithProject('Plugin Registry Missing Latest Org');
    expect(await getLatestPluginManifestVersion(organization.id, 'com.example.does-not-exist')).toBeNull();
  });
});

describe('installPlugin', () => {
  async function registerAndGet(organizationId: string, ownerId: string, overrides: Parameters<typeof manifestYaml>[0] = {}) {
    await registerPluginManifest({ organizationId, manifestYaml: manifestYaml(overrides), registeredByUserId: ownerId });
  }

  it('installs a plugin with exactly the manifest’s consented scopes and valid config', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Plugin Install Org');
    await registerAndGet(organization.id, owner.id);

    const install = await installPlugin({
      organizationId: organization.id,
      projectId: project.id,
      pluginId: 'com.example.shopify-pack',
      version: '1.0.0',
      consentedScopes: ['ingest:write', 'schema:write'],
      config: { shop_domain: 'my-shop.myshopify.com' },
      installedByUserId: owner.id,
    });

    expect(install.status).toBe('installed');
    expect(install.granted_scopes).toEqual(['ingest:write', 'schema:write']);
    expect(install.config).toEqual({ shop_domain: 'my-shop.myshopify.com' });

    const entries = await listAuditLogEntriesForOrg(organization.id);
    expect(entries.some((entry) => entry.action === 'plugin.install')).toBe(true);
  });

  it('rejects installing a manifest version that was never registered', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Plugin Install Missing Manifest Org');
    await expect(
      installPlugin({
        organizationId: organization.id,
        projectId: project.id,
        pluginId: 'com.example.does-not-exist',
        version: '1.0.0',
        consentedScopes: [],
        config: {},
        installedByUserId: owner.id,
      }),
    ).rejects.toThrow(PluginManifestNotFoundError);
  });

  it('rejects a project id that does not belong to this org (KAN-26 non-enumeration)', async () => {
    const { owner, organization } = await setupOrgWithProject('Plugin Install Wrong Project Org A');
    const other = await setupOrgWithProject('Plugin Install Wrong Project Org B');
    await registerAndGet(organization.id, owner.id);
    await expect(
      installPlugin({
        organizationId: organization.id,
        projectId: other.project.id,
        pluginId: 'com.example.shopify-pack',
        version: '1.0.0',
        consentedScopes: ['ingest:write', 'schema:write'],
        config: { shop_domain: 'x' },
        installedByUserId: owner.id,
      }),
    ).rejects.toThrow(ProjectNotFoundError);
  });

  it('rejects consenting to fewer scopes than the manifest declares', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Plugin Install Partial Consent Org');
    await registerAndGet(organization.id, owner.id);
    await expect(
      installPlugin({
        organizationId: organization.id,
        projectId: project.id,
        pluginId: 'com.example.shopify-pack',
        version: '1.0.0',
        consentedScopes: ['ingest:write'],
        config: { shop_domain: 'x' },
        installedByUserId: owner.id,
      }),
    ).rejects.toThrow(PluginScopeConsentMismatchError);
  });

  it('rejects consenting to a scope the manifest does not declare', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Plugin Install Extra Consent Org');
    await registerAndGet(organization.id, owner.id);
    await expect(
      installPlugin({
        organizationId: organization.id,
        projectId: project.id,
        pluginId: 'com.example.shopify-pack',
        version: '1.0.0',
        consentedScopes: ['ingest:write', 'schema:write', 'ai:tool'],
        config: { shop_domain: 'x' },
        installedByUserId: owner.id,
      }),
    ).rejects.toThrow(PluginScopeConsentMismatchError);
  });

  it('rejects config missing a required field, and config with the wrong type', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Plugin Install Bad Config Org');
    await registerAndGet(organization.id, owner.id);

    await expect(
      installPlugin({
        organizationId: organization.id,
        projectId: project.id,
        pluginId: 'com.example.shopify-pack',
        version: '1.0.0',
        consentedScopes: ['ingest:write', 'schema:write'],
        config: {},
        installedByUserId: owner.id,
      }),
    ).rejects.toThrow(InvalidPluginConfigError);

    await expect(
      installPlugin({
        organizationId: organization.id,
        projectId: project.id,
        pluginId: 'com.example.shopify-pack',
        version: '1.0.0',
        consentedScopes: ['ingest:write', 'schema:write'],
        config: { shop_domain: 123 },
        installedByUserId: owner.id,
      }),
    ).rejects.toThrow(InvalidPluginConfigError);
  });

  it('rejects installing the same plugin twice into the same project while an install is active', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Plugin Install Duplicate Org');
    await registerAndGet(organization.id, owner.id);
    const install = async () =>
      installPlugin({
        organizationId: organization.id,
        projectId: project.id,
        pluginId: 'com.example.shopify-pack',
        version: '1.0.0',
        consentedScopes: ['ingest:write', 'schema:write'],
        config: { shop_domain: 'x' },
        installedByUserId: owner.id,
      });

    await install();
    await expect(install()).rejects.toThrow(PluginAlreadyInstalledError);
  });

  it('allows a fresh install after the previous one was uninstalled', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Plugin Install Reinstall Org');
    await registerAndGet(organization.id, owner.id);
    const params = {
      organizationId: organization.id,
      projectId: project.id,
      pluginId: 'com.example.shopify-pack',
      version: '1.0.0',
      consentedScopes: ['ingest:write', 'schema:write'],
      config: { shop_domain: 'x' },
      installedByUserId: owner.id,
    };

    const first = await installPlugin(params);
    await uninstallPlugin({ organizationId: organization.id, projectId: project.id, installId: first.id, performedByUserId: owner.id });

    const second = await installPlugin(params);
    expect(second.id).not.toBe(first.id);
    expect(second.status).toBe('installed');

    const installs = await listPluginInstallsForProject(organization.id, project.id);
    expect(installs).toHaveLength(2);
  });
});

describe('disablePlugin / enablePlugin / uninstallPlugin', () => {
  async function installedPlugin(orgName: string) {
    const { owner, organization, project } = await setupOrgWithProject(orgName);
    await registerPluginManifest({ organizationId: organization.id, manifestYaml: manifestYaml(), registeredByUserId: owner.id });
    const install = await installPlugin({
      organizationId: organization.id,
      projectId: project.id,
      pluginId: 'com.example.shopify-pack',
      version: '1.0.0',
      consentedScopes: ['ingest:write', 'schema:write'],
      config: { shop_domain: 'x' },
      installedByUserId: owner.id,
    });
    return { owner, organization, project, install };
  }

  it('disables then re-enables an install', async () => {
    const { owner, organization, project, install } = await installedPlugin('Plugin Lifecycle Disable Org');

    const disabled = await disablePlugin({ organizationId: organization.id, projectId: project.id, installId: install.id, performedByUserId: owner.id });
    expect(disabled.status).toBe('disabled');
    expect(disabled.disabled_at).toBeTruthy();

    const enabled = await enablePlugin({ organizationId: organization.id, projectId: project.id, installId: install.id, performedByUserId: owner.id });
    expect(enabled.status).toBe('installed');
    expect(enabled.enabled_at).toBeTruthy();
  });

  it('rejects disabling an install that is not currently installed', async () => {
    const { owner, organization, project, install } = await installedPlugin('Plugin Lifecycle Double Disable Org');
    await disablePlugin({ organizationId: organization.id, projectId: project.id, installId: install.id, performedByUserId: owner.id });
    await expect(
      disablePlugin({ organizationId: organization.id, projectId: project.id, installId: install.id, performedByUserId: owner.id }),
    ).rejects.toThrow(InvalidPluginInstallStateError);
  });

  it('rejects enabling an install that is not currently disabled', async () => {
    const { owner, organization, project, install } = await installedPlugin('Plugin Lifecycle Enable Not Disabled Org');
    await expect(
      enablePlugin({ organizationId: organization.id, projectId: project.id, installId: install.id, performedByUserId: owner.id }),
    ).rejects.toThrow(InvalidPluginInstallStateError);
  });

  it('uninstalls an install and rejects uninstalling it again', async () => {
    const { owner, organization, project, install } = await installedPlugin('Plugin Lifecycle Uninstall Org');
    const uninstalled = await uninstallPlugin({ organizationId: organization.id, projectId: project.id, installId: install.id, performedByUserId: owner.id });
    expect(uninstalled.status).toBe('uninstalled');
    expect(uninstalled.uninstalled_at).toBeTruthy();

    await expect(
      uninstallPlugin({ organizationId: organization.id, projectId: project.id, installId: install.id, performedByUserId: owner.id }),
    ).rejects.toThrow(InvalidPluginInstallStateError);
  });

  it('can uninstall directly from disabled', async () => {
    const { owner, organization, project, install } = await installedPlugin('Plugin Lifecycle Disabled Uninstall Org');
    await disablePlugin({ organizationId: organization.id, projectId: project.id, installId: install.id, performedByUserId: owner.id });
    const uninstalled = await uninstallPlugin({ organizationId: organization.id, projectId: project.id, installId: install.id, performedByUserId: owner.id });
    expect(uninstalled.status).toBe('uninstalled');
  });

  it('rejects an install id from a different project (KAN-26 non-enumeration)', async () => {
    const { organization, install } = await installedPlugin('Plugin Lifecycle Cross Project Org A');
    const other = await setupOrgWithProject('Plugin Lifecycle Cross Project Org B');
    await expect(
      disablePlugin({ organizationId: organization.id, projectId: other.project.id, installId: install.id, performedByUserId: other.owner.id }),
    ).rejects.toThrow(PluginInstallNotFoundError);
  });

  it('lists installs newest-first and does not leak a sibling project’s installs', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Plugin Lifecycle List Org');
    const other = await setupOrgWithProject('Plugin Lifecycle List Org B');
    await registerPluginManifest({ organizationId: organization.id, manifestYaml: manifestYaml(), registeredByUserId: owner.id });
    await registerPluginManifest({ organizationId: other.organization.id, manifestYaml: manifestYaml(), registeredByUserId: other.owner.id });

    await installPlugin({
      organizationId: other.organization.id,
      projectId: other.project.id,
      pluginId: 'com.example.shopify-pack',
      version: '1.0.0',
      consentedScopes: ['ingest:write', 'schema:write'],
      config: { shop_domain: 'x' },
      installedByUserId: other.owner.id,
    });

    const installs = await listPluginInstallsForProject(organization.id, project.id);
    expect(installs).toHaveLength(0);
  });
});
