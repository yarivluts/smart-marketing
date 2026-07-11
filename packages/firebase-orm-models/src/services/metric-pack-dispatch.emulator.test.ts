import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  ENGAGEMENT_PACK_MANIFEST_YAML,
  ENGAGEMENT_PACK_PLUGIN_ID,
  installPluginAndProvisionBuiltins,
  listBoardsForProject,
  listMetricDefinitionsForProject,
  PluginScopeConsentMismatchError,
  registerPluginManifest,
  SAAS_METRIC_PACK_MANIFEST_YAML,
  SAAS_METRIC_PACK_PLUGIN_ID,
  uninstallPlugin,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

/** Emulator-backed tests for KAN-59's install-time dispatch: `installPluginAndProvisionBuiltins`. */

beforeAll(async () => {
  await connectToFirestoreEmulator('metric-pack-dispatch-tests');
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

const OTHER_MANIFEST_YAML = `
id: com.example.unrelated-pack
version: 1.0.0
type: source
display_name: Unrelated Pack
scopes: [ingest:write]
`;

describe('installPluginAndProvisionBuiltins', () => {
  it('installing the built-in SaaS metric pack registers all of its metrics and seeds its default boards (KAN-61)', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Dispatch Metric Pack Org');
    await registerPluginManifest({ organizationId: organization.id, manifestYaml: SAAS_METRIC_PACK_MANIFEST_YAML, registeredByUserId: owner.id });

    const install = await installPluginAndProvisionBuiltins({
      organizationId: organization.id,
      projectId: project.id,
      pluginId: SAAS_METRIC_PACK_PLUGIN_ID,
      version: '1.0.0',
      consentedScopes: ['metrics:write'],
      config: {},
      installedByUserId: owner.id,
    });

    expect(install.status).toBe('installed');
    const defs = await listMetricDefinitionsForProject(organization.id, project.id);
    expect(defs.map((def) => def.name)).toContain('ad_spend');
    expect(defs.map((def) => def.name)).toContain('troi');
    expect(defs).toHaveLength(22);

    const boards = await listBoardsForProject(organization.id, project.id);
    expect(boards.map((board) => board.name).sort()).toEqual(['Funnel', 'Marketing', 'Revenue / MRR']);
    expect(boards.every((board) => board.tiles.length > 0)).toBe(true);
  }, 60_000); // twenty-two sequential metric registrations — see saas-metric-pack.emulator.test.ts's own timeout note

  it('installing an unrelated plugin registers no metrics and seeds no boards, behaving exactly like the generic installPlugin', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Dispatch Unrelated Org');
    await registerPluginManifest({ organizationId: organization.id, manifestYaml: OTHER_MANIFEST_YAML, registeredByUserId: owner.id });

    const install = await installPluginAndProvisionBuiltins({
      organizationId: organization.id,
      projectId: project.id,
      pluginId: 'com.example.unrelated-pack',
      version: '1.0.0',
      consentedScopes: ['ingest:write'],
      config: {},
      installedByUserId: owner.id,
    });

    expect(install.status).toBe('installed');
    const defs = await listMetricDefinitionsForProject(organization.id, project.id);
    expect(defs).toHaveLength(0);
    const boards = await listBoardsForProject(organization.id, project.id);
    expect(boards).toHaveLength(0);
  });

  it('re-installing the metric pack after an uninstall does not duplicate metric versions or boards', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Dispatch Reinstall Org');
    await registerPluginManifest({ organizationId: organization.id, manifestYaml: SAAS_METRIC_PACK_MANIFEST_YAML, registeredByUserId: owner.id });

    const firstInstall = await installPluginAndProvisionBuiltins({
      organizationId: organization.id,
      projectId: project.id,
      pluginId: SAAS_METRIC_PACK_PLUGIN_ID,
      version: '1.0.0',
      consentedScopes: ['metrics:write'],
      config: {},
      installedByUserId: owner.id,
    });
    await uninstallPlugin({ organizationId: organization.id, projectId: project.id, installId: firstInstall.id, performedByUserId: owner.id });

    await installPluginAndProvisionBuiltins({
      organizationId: organization.id,
      projectId: project.id,
      pluginId: SAAS_METRIC_PACK_PLUGIN_ID,
      version: '1.0.0',
      consentedScopes: ['metrics:write'],
      config: {},
      installedByUserId: owner.id,
    });

    const defs = await listMetricDefinitionsForProject(organization.id, project.id);
    expect(defs).toHaveLength(22);
    expect(defs.every((def) => def.version === 1)).toBe(true);

    const boards = await listBoardsForProject(organization.id, project.id);
    expect(boards).toHaveLength(3);
  }, 60_000); // two full twenty-two-metric passes (install + reinstall)

  it('registers no metrics and seeds no boards when the install itself is rejected (scope consent mismatch)', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Dispatch Rejected Install Org');
    await registerPluginManifest({ organizationId: organization.id, manifestYaml: SAAS_METRIC_PACK_MANIFEST_YAML, registeredByUserId: owner.id });

    await expect(
      installPluginAndProvisionBuiltins({
        organizationId: organization.id,
        projectId: project.id,
        pluginId: SAAS_METRIC_PACK_PLUGIN_ID,
        version: '1.0.0',
        consentedScopes: [], // doesn't match the manifest's declared `[metrics:write]`
        config: {},
        installedByUserId: owner.id,
      }),
    ).rejects.toThrow(PluginScopeConsentMismatchError);

    const defs = await listMetricDefinitionsForProject(organization.id, project.id);
    expect(defs).toHaveLength(0);
    const boards = await listBoardsForProject(organization.id, project.id);
    expect(boards).toHaveLength(0);
  });

  it('installing the built-in Engagement pack registers all five of its metrics and seeds no boards (KAN-63)', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Dispatch Engagement Pack Org');
    await registerPluginManifest({ organizationId: organization.id, manifestYaml: ENGAGEMENT_PACK_MANIFEST_YAML, registeredByUserId: owner.id });

    const install = await installPluginAndProvisionBuiltins({
      organizationId: organization.id,
      projectId: project.id,
      pluginId: ENGAGEMENT_PACK_PLUGIN_ID,
      version: '1.0.0',
      consentedScopes: ['metrics:write'],
      config: {},
      installedByUserId: owner.id,
    });

    expect(install.status).toBe('installed');
    const defs = await listMetricDefinitionsForProject(organization.id, project.id);
    expect(defs.map((def) => def.name).sort()).toEqual(['dau', 'dau_mau_ratio', 'engagement_depth_histogram', 'mau', 'wau']);

    // No default-boards story exists for this pack (unlike KAN-61's SaaS-pack boards).
    const boards = await listBoardsForProject(organization.id, project.id);
    expect(boards).toHaveLength(0);
  });
});
