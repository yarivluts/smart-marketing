import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Which component directories any route actually renders (KAN-178).
 *
 * `apps/web/components` holds **two parallel implementations of the same UI**.
 * The live one is `components/orgs` (~17.5k lines, imported by pages all over
 * `app/`). The other arrived in one bulk commit — "complete comprehensive UI/UX
 * overhaul across all 54 routes" — and is spread across nine directories that
 * **no page imports at all**.
 *
 * Nothing in the repo says so. The two trees are indistinguishable when reading
 * files, and the unmounted one is the more modern-looking of the pair, so it
 * reads as the current direction. `components/shell/nav-shell.tsx` and
 * `components/orgs/app-shell.tsx` both look like the app shell; only the second
 * is rendered.
 *
 * That has already cost real review time twice in one cycle — once finding a
 * settings card promising notifications nothing delivers (KAN-177), once
 * tracing 183 hard-coded strings (KAN-176) that turned out to be almost
 * entirely in code no user can reach. Both investigations began by assuming
 * live code.
 *
 * ## What this test is for
 *
 * Not to forbid either tree. The unmounted one is plausibly an in-progress
 * migration, and deleting someone's unfinished work to tidy the repo is not an
 * improvement. This records the split so it is **visible rather than
 * rediscovered**, and so changing it has to be deliberate:
 *
 *  - Mount one of these directories and the test fails, which is the moment to
 *    ask whether it is finished. For `settings` specifically that means asking
 *    whether notification delivery exists yet — it does not (KAN-177).
 *  - Let a mounted directory fall out of use and the test fails too, which is
 *    how dead code gets noticed instead of accumulating.
 */

const COMPONENTS_ROOT = __dirname;
const APP_ROOT = path.resolve(__dirname, '..', 'app');

/** Rendered by at least one file under `app/`. */
const MOUNTED = ['auth', 'campaigns', 'orgs', 'tv', 'ui'];

/**
 * Imported by no page. Each is real, reviewed code — it is simply not reachable
 * by a user today.
 *
 * `shell` is the one worth pointing at: it duplicates `components/orgs/app-shell.tsx`,
 * which is the shell actually rendered by the project layout.
 */
const NOT_MOUNTED = ['ai', 'automation', 'billing', 'funnel', 'goals', 'members', 'reporting', 'settings', 'shell'];

function componentDirectories(): string[] {
  return readdirSync(COMPONENTS_ROOT)
    .filter((entry) => statSync(path.join(COMPONENTS_ROOT, entry)).isDirectory())
    .filter((entry) => {
      const files = collectTsx(path.join(COMPONENTS_ROOT, entry));
      return files.length > 0;
    })
    .sort();
}

function collectTsx(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectTsx(full, found);
    } else if (entry.endsWith('.tsx') && !entry.endsWith('.test.tsx')) {
      found.push(full);
    }
  }
  return found;
}

function readAllAppSources(dir: string, chunks: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      readAllAppSources(full, chunks);
    } else if (entry.endsWith('.tsx') || entry.endsWith('.ts')) {
      chunks.push(readFileSync(full, 'utf8'));
    }
  }
  return chunks;
}

function directoriesImportedByPages(): Set<string> {
  const appSource = readAllAppSources(APP_ROOT).join('\n');
  return new Set(componentDirectories().filter((dir) => appSource.includes(`components/${dir}`)));
}

describe('component directories: what any route actually renders (KAN-178)', () => {
  it('matches the recorded inventory, so mounting or abandoning a tree is a deliberate act', () => {
    const imported = directoriesImportedByPages();
    const actualMounted = componentDirectories().filter((dir) => imported.has(dir));
    const actualUnmounted = componentDirectories().filter((dir) => !imported.has(dir));

    expect({ mounted: actualMounted, notMounted: actualUnmounted }).toEqual({
      mounted: [...MOUNTED].sort(),
      notMounted: [...NOT_MOUNTED].sort(),
    });
  });

  /**
   * Guards the guard. If the scan stopped finding imports it would report every
   * directory as unmounted and this file would still need editing to pass — but
   * a scan that found *nothing* could otherwise be "fixed" by moving names into
   * NOT_MOUNTED, quietly turning a real inventory into a list of directories.
   */
  it('finds the live tree, so a broken scan cannot pass by declaring everything dead', () => {
    const imported = directoriesImportedByPages();
    expect(imported.has('orgs')).toBe(true);
    expect(componentDirectories().length).toBeGreaterThan(8);
  });
});
