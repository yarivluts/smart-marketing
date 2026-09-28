import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * KAN-234: a page has exactly one `main` landmark. The project layout's `AppShell` renders it, so
 * every project page used to add a second, nested one - screen readers announced two "main"
 * regions and "skip to main content" landed on the outer shell. Pages and the components they
 * render use a plain container; only top-level shells and full-screen views own `<main>`.
 */

const WEB_ROOT = path.resolve(__dirname, '..');
const MAIN_TAG = /<main[\s>]/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx$/.test(entry) && !/\.test\.tsx$/.test(entry) ? [full] : [];
  });
}

function relative(file: string): string {
  return path.relative(WEB_ROOT, file).split(path.sep).join('/');
}

/** Components that are the one landmark of the view they render (a shell, or a whole screen outside any shell). */
const COMPONENTS_OWNING_MAIN = new Set([
  'components/orgs/app-shell.tsx',
  'components/shell/nav-shell.tsx',
  'components/auth/dashboard-content.tsx',
  'components/tv/tv-app.tsx',
  'components/tv/tv-pairing-screen.tsx',
  'components/tv/tv-rotation-screen.tsx',
]);

describe('one main landmark per page (KAN-234)', () => {
  it('the project layout renders AppShell, which owns the main landmark', () => {
    const layout = readFileSync(path.join(WEB_ROOT, 'app/[locale]/orgs/[orgId]/projects/[projectId]/layout.tsx'), 'utf8');
    expect(layout).toContain('<AppShell');
    const shell = readFileSync(path.join(WEB_ROOT, 'components/orgs/app-shell.tsx'), 'utf8');
    expect(shell.match(/<main[\s>]/g)).toHaveLength(1);
  });

  it('no project page renders its own <main> inside the shell', () => {
    const projectRoutes = path.join(WEB_ROOT, 'app/[locale]/orgs/[orgId]/projects/[projectId]');
    const offenders = sourceFiles(projectRoutes)
      .filter((file) => !file.endsWith(`${path.sep}layout.tsx`))
      .filter((file) => MAIN_TAG.test(readFileSync(file, 'utf8')))
      .map(relative);
    expect(offenders).toEqual([]);
  });

  it('only shells and full-screen views among the shared components render <main>', () => {
    const owners = sourceFiles(path.join(WEB_ROOT, 'components'))
      .filter((file) => MAIN_TAG.test(readFileSync(file, 'utf8')))
      .map(relative)
      .filter((file) => !COMPONENTS_OWNING_MAIN.has(file));
    expect(owners).toEqual([]);
  });
});
