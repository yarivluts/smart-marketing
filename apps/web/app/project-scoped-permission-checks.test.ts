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
});
