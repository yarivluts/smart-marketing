import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = process.cwd();
const tvPairingRoot = path.join(webRoot, 'app/api/tv-pairing');

/**
 * The session-less counterpart to `route-isolation-guard.test.ts` (KAN-26),
 * scoped to `app/api/tv-pairing/*` — those routes live outside `app/api/orgs`
 * (see `tv-viewer-auth.ts`'s own doc comment for why), so KAN-26's own guard
 * never scans them. Without an equivalent guard here, a future route added
 * under this tree that forgets to authenticate its caller would go
 * completely unnoticed by CI, unlike the identical mistake under
 * `app/api/orgs`. Every route file must call `requireTvViewer` or
 * `extractTvDeviceToken` (the two device-token-checking entry points in
 * `tv-viewer-auth.ts`), or be a justified exemption below.
 */
const EXEMPT_ROUTES: Record<string, string> = {
  'app/api/tv-pairing/route.ts':
    'mints a brand-new, unclaimed pairing (KAN-67) — there is no token yet for an anonymous TV browser to present, the same "no existing target resource to enumerate" reasoning app/api/orgs/route.ts\'s own exemption gives for creating a brand-new org.',
};

function findRouteFiles(root: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      results.push(...findRouteFiles(full));
    } else if (entry.isFile() && entry.name === 'route.ts') {
      results.push(full);
    }
  }
  return results;
}

function toRepoRelative(file: string): string {
  return path.relative(webRoot, file).split(path.sep).join('/');
}

describe('session-less TV-pairing API routes register device-token auth coverage (KAN-67)', () => {
  it('every route.ts under app/api/tv-pairing checks the device token or is a justified exemption', () => {
    const files = findRouteFiles(tvPairingRoot);
    expect(files.length).toBeGreaterThan(0);

    const unguarded = files
      .map(toRepoRelative)
      .filter((relative, index) => {
        const source = readFileSync(files[index], 'utf8');
        const isGated = source.includes('requireTvViewer') || source.includes('extractTvDeviceToken');
        const isExempt = relative in EXEMPT_ROUTES;
        return !isGated && !isExempt;
      });

    expect(
      unguarded,
      `Found route(s) under app/api/tv-pairing with no requireTvViewer/extractTvDeviceToken check and no EXEMPT_ROUTES entry: ` +
        `${unguarded.join(', ')}. Wire in one of those two, or add a justified exemption to tv-viewer-route-guard.test.ts.`,
    ).toEqual([]);
  });

  it('every EXEMPT_ROUTES entry still points at a route file that actually exists', () => {
    const existing = new Set(findRouteFiles(tvPairingRoot).map(toRepoRelative));
    for (const relative of Object.keys(EXEMPT_ROUTES)) {
      expect(existing.has(relative), `stale EXEMPT_ROUTES entry: ${relative}`).toBe(true);
    }
  });
});
