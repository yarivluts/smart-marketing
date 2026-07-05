import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = process.cwd();
const apiRoots = [path.join(webRoot, 'app/api/orgs'), path.join(webRoot, 'app/api/invites')];

/**
 * Every route under app/api/orgs and app/api/invites takes a path param
 * naming a specific org's (or org-scoped membership's) data. KAN-26 requires
 * each to gate on `requireOrgPermission` (404-not-403 non-enumeration, see
 * access.ts) or be explicitly listed below with a reason it's safe without
 * it. This repo has no per-route annotation system for apps/web the way
 * apps/api's `@RequirePermission` decorator does (see the
 * `growthos/require-permission-annotation` eslint rule there), so this test
 * is the equivalent guardrail: it fails CI the moment a new org-scoped route
 * file appears with neither a `requireOrgPermission` call nor an entry here.
 *
 * Add a new org-scoped route -> either call `requireOrgPermission` in it (no
 * change needed here), or add a one-line justified exemption below — and
 * either way, add a matching scenario to `isolation.test.ts` asserting it
 * returns identical responses for "real org I can't see" vs. "fake org id".
 */
const EXEMPT_ROUTES: Record<string, string> = {
  'app/api/orgs/route.ts': 'creates a brand-new org — there is no existing target resource to enumerate',
  'app/api/orgs/context/route.ts': "returns only the caller's own memberships/bindings, never another principal's",
  'app/api/invites/[orgId]/[membershipId]/accept/route.ts':
    'identity-scoped by design — a non-member must be able to accept their own invite — and does its own ' +
    'InviteNotFoundError -> 404 mapping instead of an org-membership check',
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

describe('org-scoped API routes register isolation coverage (KAN-26)', () => {
  it('every route.ts under app/api/orgs and app/api/invites gates on requireOrgPermission or is a justified exemption', () => {
    const files = apiRoots.flatMap(findRouteFiles);
    expect(files.length).toBeGreaterThan(0);

    const unguarded = files
      .map(toRepoRelative)
      .filter((relative, index) => {
        const source = readFileSync(files[index], 'utf8');
        const isGated = source.includes('requireOrgPermission');
        const isExempt = relative in EXEMPT_ROUTES;
        return !isGated && !isExempt;
      });

    expect(
      unguarded,
      `Found route(s) with no requireOrgPermission gate and no EXEMPT_ROUTES entry: ${unguarded.join(', ')}. ` +
        'Wire in requireOrgPermission, or add a justified exemption to route-isolation-guard.test.ts, and add an ' +
        'isolation.test.ts scenario for it.',
    ).toEqual([]);
  });

  it('every EXEMPT_ROUTES entry still points at a route file that actually exists', () => {
    const existing = new Set(apiRoots.flatMap(findRouteFiles).map(toRepoRelative));
    for (const relative of Object.keys(EXEMPT_ROUTES)) {
      expect(existing.has(relative), `stale EXEMPT_ROUTES entry: ${relative}`).toBe(true);
    }
  });
});
