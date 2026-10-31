import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every permission check under a project route must name the project.
 *
 * `can()` matches a project-scoped role binding only when the resource carries
 * `projectId` (`bindingCoversResource` in `packages/shared/src/policy/engine.ts`).
 * A check written as `{ orgId }` therefore passes for org-wide roles and fails
 * for everyone whose role is scoped to the one project the URL names - they get
 * a 404 on their own project. KAN-136 fixed exactly this for goals; 30 more
 * pages and routes still had it, found when a `project_admin` scoped to
 * EasySign Growth could not open that project's overview, funnel, Customer 360,
 * record feed or insights.
 *
 * Adding `projectId` is strictly widening for the intended people: an org-level
 * binding still matches on `orgId` alone.
 */
const ROOTS = [
  resolve(__dirname, '[locale]/orgs/[orgId]/projects/[projectId]'),
  resolve(__dirname, 'api/orgs/[orgId]/projects/[projectId]'),
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('permission checks under project routes', () => {
  it('always pass projectId, so a role scoped to that project is honoured', () => {
    const offenders = ROOTS.flatMap(sourceFiles).flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => /\bcan\(/.test(line) && /\{\s*orgId\s*\}\s*\)/.test(line))
        .map(({ index }) => `${relative(resolve(__dirname), file)}:${index + 1}`),
    );
    expect(offenders).toEqual([]);
  });

  it('never call org-only requireOrgPermission under api/orgs/[orgId]/projects/[projectId] (KAN-136..KAN-147)', () => {
    const apiProjectRoot = resolve(__dirname, 'api/orgs/[orgId]/projects/[projectId]');
    const offenders = sourceFiles(apiProjectRoot).flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => /\brequireOrgPermission\s*\(/.test(line))
        .map(({ index }) => `${relative(resolve(__dirname), file)}:${index + 1}`),
    );
    expect(offenders).toEqual([]);
  });

  it('actually scans the project routes (a moved directory must not make this pass vacuously)', () => {
    expect(ROOTS.flatMap(sourceFiles).length).toBeGreaterThan(50);
  });

  it('ProjectLayout gates automation, settings, and org-level nav links on matching permissions (KAN-148)', () => {
    const layout = readFileSync(
      resolve(__dirname, '[locale]/orgs/[orgId]/projects/[projectId]/layout.tsx'),
      'utf8',
    );
    expect(layout).toContain("can(bindings, principal, 'automation.execute', { orgId, projectId })");
    expect(layout).toContain("can(bindings, principal, 'audit.read', orgScope)");
    expect(layout).toContain("can(bindings, principal, 'plugin.install', orgScope)");
    expect(layout).toMatch(/canExecuteAutomation\s*\?\s*\[\s*\{\s*href:\s*`\$\{base\}\/automation`/);
    expect(layout).toMatch(/canManageProjects\s*\?\s*\[\{\s*href:\s*`\$\{base\}\/settings`/);
  });

  it('AutomationPage gates the org-wide kill switch on org-scoped automation.execute (KAN-148)', () => {
    const page = readFileSync(
      resolve(__dirname, '[locale]/orgs/[orgId]/projects/[projectId]/automation/page.tsx'),
      'utf8',
    );
    expect(page).toContain("const orgScope = { orgId };");
    expect(page).toContain("can(bindings, principal, 'automation.execute', orgScope)");
    expect(page).toContain('canManageKillSwitch={canManageKillSwitch}');
  });

  it('OrgDetailPage gates moduleLinks on matching project permissions and defaults to the caller project binding (KAN-149)', () => {
    const orgPage = readFileSync(resolve(__dirname, '[locale]/orgs/[orgId]/page.tsx'), 'utf8');
    expect(orgPage).toContain("can(bindings, principal, 'automation.execute', projectScope)");
    expect(orgPage).toContain('const canViewCockpit = canExecuteAutomation || canViewBoards;');
    expect(orgPage).toContain("binding.scopeLevel === 'project' && binding.scopeId === project.id");
    expect(orgPage).toMatch(/canExecuteAutomation\s*\?\s*\[\{\s*href:\s*'automation'/);
    expect(orgPage).toMatch(/canManageProjectSettings\s*\?\s*\[\{\s*href:\s*'settings'/);
  });

  it('FunnelPage passes distinct permissions for goals, onboarding, and ingest setup (KAN-150)', () => {
    const funnelPage = readFileSync(
      resolve(__dirname, '[locale]/orgs/[orgId]/projects/[projectId]/funnel/page.tsx'),
      'utf8',
    );
    expect(funnelPage).toContain("can(bindings, principal, 'project.manage', { orgId, projectId })");
    expect(funnelPage).toContain("can(bindings, principal, 'ingest.write', { orgId, projectId })");
    expect(funnelPage).toContain('canManageGoals={canWriteDashboards}');
    expect(funnelPage).toContain('canManageOnboarding={canManageOnboarding}');
    expect(funnelPage).toContain('canManageIngest={canManageIngest}');
  });

  it('CampaignsPage and CampaignDetailPage align view access with dashboards.read/write and gate mutations on automation.execute and plugin.install (KAN-151)', () => {
    const campaignsPage = readFileSync(
      resolve(__dirname, '[locale]/orgs/[orgId]/projects/[projectId]/campaigns/page.tsx'),
      'utf8',
    );
    expect(campaignsPage).toContain("can(bindings, principal, 'plugin.install', { orgId, projectId })");
    expect(campaignsPage).toContain('canManagePlugins={canManagePlugins}');

    const detailPage = readFileSync(
      resolve(__dirname, '[locale]/orgs/[orgId]/projects/[projectId]/campaigns/[targetId]/page.tsx'),
      'utf8',
    );
    expect(detailPage).toContain("can(bindings, principal, 'dashboards.read', { orgId, projectId })");
    expect(detailPage).toContain("can(bindings, principal, 'dashboards.write', { orgId, projectId })");
    expect(detailPage).toContain('!canExecute && !canReadDashboards && !canWriteDashboards');
    expect(detailPage).toContain('canExecute={canExecute}');
  });

  it('ProjectRootPage and GrowthPilotPage route by role permission and gate platform publish/activate approvals on automation.execute (KAN-152)', () => {
    const projectRootPage = readFileSync(
      resolve(__dirname, '[locale]/orgs/[orgId]/projects/[projectId]/page.tsx'),
      'utf8',
    );
    expect(projectRootPage).toContain("can(bindings, principal, 'ingest.write', scope)");
    expect(projectRootPage).toContain("can(bindings, principal, 'project.manage', scope)");
    expect(projectRootPage).toContain('redirect(`${base}/install`)');
    expect(projectRootPage).toContain('redirect(`${base}/resources`)');

    const growthPilotPage = readFileSync(
      resolve(__dirname, '[locale]/orgs/[orgId]/projects/[projectId]/growth-pilot/page.tsx'),
      'utf8',
    );
    expect(growthPilotPage).toContain("can(bindings, { type: 'user', id: user.id }, 'automation.execute', { orgId, projectId })");
    expect(growthPilotPage).toContain('canExecute={canExecute}');
  });

  it('gates built-in pack install CTAs, cross-page insight/win-rule links, and archived goal owners (KAN-153)', () => {
    const packPages = [
      'campaign-ops/page.tsx',
      'demos/page.tsx',
      'support/page.tsx',
      'feedback/page.tsx',
      'experiments/page.tsx',
      'churn-reasons/page.tsx',
      'firmographics/page.tsx',
      'intent-quality/page.tsx',
    ];
    for (const relPath of packPages) {
      const content = readFileSync(
        resolve(__dirname, `[locale]/orgs/[orgId]/projects/[projectId]/${relPath}`),
        'utf8',
      );
      expect(content, relPath).toContain("can(bindings, { type: 'user', id: user.id }, 'plugin.install', { orgId, projectId })");
      expect(content, relPath).toContain('canInstall={canInstallPlugins}');
    }

    const insightsPage = readFileSync(
      resolve(__dirname, '[locale]/orgs/[orgId]/projects/[projectId]/insights/page.tsx'),
      'utf8',
    );
    expect(insightsPage).toContain("tracking_alert: can(bindings, { type: 'user', id: user.id }, 'ingest.write', { orgId, projectId })");
    expect(insightsPage).toContain("metric_health: can(bindings, { type: 'user', id: user.id }, 'metrics.write', { orgId, projectId })");
    expect(insightsPage).toContain('canFollowUp[kind]');

    const winRulesPage = readFileSync(
      resolve(__dirname, '[locale]/orgs/[orgId]/projects/[projectId]/win-rules/page.tsx'),
      'utf8',
    );
    expect(winRulesPage).toContain("can(bindings, { type: 'user', id: user.id }, 'ingest.write', { orgId, projectId })");
    expect(winRulesPage).toContain('schemaHref: canReadRecordFeed');

    const goalDetailPage = readFileSync(
      resolve(__dirname, '[locale]/orgs/[orgId]/projects/[projectId]/goals/[goalId]/page.tsx'),
      'utf8',
    );
    expect(goalDetailPage).toContain('!person.archived_at || person.id === goal.owner_person_id');
  });

  it('gates cross-page schema, board, and org-plugin links on destination permissions (KAN-154)', () => {
    const customersPage = readFileSync(
      resolve(__dirname, '[locale]/orgs/[orgId]/projects/[projectId]/customers/page.tsx'),
      'utf8',
    );
    expect(customersPage).toContain("can(bindings, { type: 'user', id: user.id }, 'schema.write', { orgId, projectId })");
    expect(customersPage).toContain('canWriteSchemas ?');

    const ingestHealthPage = readFileSync(
      resolve(__dirname, '[locale]/orgs/[orgId]/projects/[projectId]/ingest-health/page.tsx'),
      'utf8',
    );
    expect(ingestHealthPage).toContain("can(bindings, { type: 'user', id: user.id }, 'dashboards.read', { orgId, projectId })");
    expect(ingestHealthPage).toContain("can(bindings, { type: 'user', id: user.id }, 'dashboards.write', { orgId, projectId })");
    expect(ingestHealthPage).toContain('href: canViewBoards ?');

    const metricDefsPage = readFileSync(
      resolve(__dirname, '[locale]/orgs/[orgId]/projects/[projectId]/metric-defs/page.tsx'),
      'utf8',
    );
    expect(metricDefsPage).toContain("can(bindings, { type: 'user', id: user.id }, 'schema.write', { orgId, projectId })");
    expect(metricDefsPage).toContain('href: canWriteSchemas ?');

    const fieldMappingsPage = readFileSync(
      resolve(__dirname, '[locale]/orgs/[orgId]/projects/[projectId]/field-mappings/page.tsx'),
      'utf8',
    );
    expect(fieldMappingsPage).toContain("can(bindings, { type: 'user', id: user.id }, 'schema.write', { orgId, projectId })");
    expect(fieldMappingsPage).toContain('href: canWriteSchemas ?');

    const onboardingPage = readFileSync(
      resolve(__dirname, '[locale]/orgs/[orgId]/projects/[projectId]/onboarding/page.tsx'),
      'utf8',
    );
    expect(onboardingPage).toContain("const orgScope = { orgId };");
    expect(onboardingPage).toContain("can(bindings, { type: 'user', id: user.id }, 'plugin.install', orgScope)");
    expect(onboardingPage).toContain('canManageOrgPlugins={canManageOrgPlugins}');
  });
});
