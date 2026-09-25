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

  it('actually scans the project routes (a moved directory must not make this pass vacuously)', () => {
    expect(ROOTS.flatMap(sourceFiles).length).toBeGreaterThan(50);
  });
});
