import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { allSetupRecommendations, SETUP_REQUIREMENTS, type SetupRecommendation } from '@growthos/shared';

/**
 * KAN-197 B2: the setup tools may only recommend things that exist.
 *
 * The unmerged predecessor of these tools told integrators to `npm install @growthos/tracking-sdk`
 * (a private workspace package, never published), to load `cdn.growthos.io/sdk/v2/sdk.min.js`, to
 * point Stripe at `growthos.io/api/.../plugins/stripe-webhook` and to `PUT /api/projects/{id}/
 * cost-guardrails` - none of which existed. An integrator (EasySign) followed them into dead ends.
 *
 * So every recommendation is structured, and this resolves each one against the code itself:
 * a web page against the Next.js `apps/web/app` route tree (it must end at a `page.tsx`), an API
 * endpoint against the Nest controllers' own decorators and the global prefix, an MCP tool against
 * the tools the server registers. Package names and URLs may not appear in the prose at all: an
 * installable package would have to be a public workspace package, and there is none.
 */

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const WEB_APP_DIR = path.join(REPO_ROOT, 'apps/web/app');
const API_SRC_DIR = path.join(REPO_ROOT, 'apps/api/src');
const MCP_DIR = __dirname;
const TOOL_FILES = ['mcp-tools.ts', 'mcp-act-tools.ts', 'mcp-admin-tools.ts', 'mcp-setup-tools.ts'];

function childDirectories(dir: string): string[] {
  return readdirSync(dir).filter((entry) => statSync(path.join(dir, entry)).isDirectory());
}

/** Whether `segments` (with `:param` placeholders) reaches a `page.tsx` under `dir`, stepping through `(group)` folders. */
function resolvesToPage(dir: string, segments: readonly string[]): boolean {
  if (segments.length === 0) {
    if (existsSync(path.join(dir, 'page.tsx')) || existsSync(path.join(dir, 'page.ts'))) return true;
    return childDirectories(dir).some((child) => child.startsWith('(') && resolvesToPage(path.join(dir, child), segments));
  }
  const [head, ...rest] = segments;
  return childDirectories(dir).some((child) => {
    if (child.startsWith('(')) return resolvesToPage(path.join(dir, child), segments);
    const isDynamic = child.startsWith('[') && !child.startsWith('[...') && !child.startsWith('[[');
    const matches = head.startsWith(':') ? isDynamic : child === head;
    return matches && resolvesToPage(path.join(dir, child), rest);
  });
}

/** A locale-relative web path (`/orgs/:orgId/...`), resolved under the app's `[locale]` segment. */
function webPageExists(pagePath: string): boolean {
  const segments = pagePath.split('/').filter((segment) => segment.length > 0);
  return resolvesToPage(path.join(WEB_APP_DIR, '[locale]'), segments);
}

function collectControllerFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) collectControllerFiles(full, found);
    else if (entry.endsWith('.controller.ts')) found.push(full);
  }
  return found;
}

function normalizeRoute(route: string): string {
  const segments = route.split('/').filter((segment) => segment.length > 0).map((segment) => (segment.startsWith(':') ? ':param' : segment));
  return `/${segments.join('/')}`;
}

/** Every `METHOD /path` the Nest app serves, read from `@Controller`/`@Get`/`@Post`/... decorators and `setGlobalPrefix`. */
function servedApiRoutes(): Set<string> {
  const mainSource = readFileSync(path.join(API_SRC_DIR, 'main.ts'), 'utf8');
  const prefix = /setGlobalPrefix\(\s*'([^']*)'/.exec(mainSource)?.[1] ?? '';
  const routes = new Set<string>();
  for (const file of collectControllerFiles(API_SRC_DIR)) {
    const source = readFileSync(file, 'utf8');
    const controllerPath = /@Controller\(\s*(?:'([^']*)')?\s*\)/.exec(source)?.[1] ?? '';
    for (const match of source.matchAll(/@(Get|Post|Put|Patch|Delete)\(\s*(?:'([^']*)')?\s*\)/g)) {
      routes.add(`${match[1].toUpperCase()} ${normalizeRoute(`${prefix}/${controllerPath}/${match[2] ?? ''}`)}`);
    }
  }
  return routes;
}

function registeredMcpTools(): Set<string> {
  const names = new Set<string>();
  for (const file of TOOL_FILES) {
    for (const match of readFileSync(path.join(MCP_DIR, file), 'utf8').matchAll(/server\.registerTool\(\s*'([^']+)'/g)) {
      names.add(match[1]);
    }
  }
  return names;
}

/** Workspace packages someone outside this repo could actually install (i.e. not `private`). */
function publicWorkspacePackages(): Set<string> {
  const names = new Set<string>();
  for (const group of ['apps', 'packages']) {
    const groupDir = path.join(REPO_ROOT, group);
    for (const child of childDirectories(groupDir)) {
      const manifestPath = path.join(groupDir, child, 'package.json');
      if (!existsSync(manifestPath)) continue;
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { name?: string; private?: boolean };
      if (manifest.name && manifest.private !== true) names.add(manifest.name);
    }
  }
  return names;
}

const apiRoutes = servedApiRoutes();
const mcpTools = registeredMcpTools();

function artifactExists(recommendation: SetupRecommendation): boolean {
  if (recommendation.kind === 'web_page') return webPageExists(recommendation.path);
  if (recommendation.kind === 'api_endpoint') return apiRoutes.has(`${recommendation.method} ${normalizeRoute(recommendation.path)}`);
  return mcpTools.has(recommendation.tool);
}

describe('KAN-197 B2: every setup recommendation points at something that exists', () => {
  const recommendations = allSetupRecommendations();

  it('covers a non-trivial set, of every kind, so a broken collector cannot make this vacuous', () => {
    expect(recommendations.length).toBeGreaterThan(10);
    expect(new Set(recommendations.map((recommendation) => recommendation.kind))).toEqual(new Set(['web_page', 'api_endpoint', 'mcp_tool']));
    expect(apiRoutes.has('POST /v1/ingest/events')).toBe(true);
    expect(mcpTools.has('register_schema')).toBe(true);
  });

  it('resolves every web page, API endpoint and MCP tool against the real code', () => {
    const missing = recommendations.filter((recommendation) => !artifactExists(recommendation)).map((recommendation) => JSON.stringify(recommendation));
    expect({ recommendationsPointingAtNothing: missing }).toEqual({ recommendationsPointingAtNothing: [] });
  });

  it('names no package unless it is a public workspace package, and embeds no URL in prose', () => {
    const installable = publicWorkspacePackages();
    const prose = [...SETUP_REQUIREMENTS.flatMap((requirement) => [requirement.title, requirement.impact, requirement.satisfiedBy]), ...recommendations.map((recommendation) => recommendation.action)];
    for (const text of prose) {
      for (const match of text.matchAll(/@[a-z0-9-]+\/[a-z0-9-]+/g)) {
        expect({ text, package: match[0], installable: installable.has(match[0]) }).toEqual({ text, package: match[0], installable: true });
      }
      expect(text).not.toMatch(/https?:\/\/|npm install|cdn\./i);
    }
  });

  it("rejects each of the predecessor's dead links, so the resolvers above are not trivially true", () => {
    expect(artifactExists({ kind: 'api_endpoint', method: 'POST', path: '/api/projects/:projectId/cost-guardrails', action: '' })).toBe(false);
    expect(artifactExists({ kind: 'api_endpoint', method: 'POST', path: '/v1/ingest/event', action: '' })).toBe(false);
    expect(artifactExists({ kind: 'api_endpoint', method: 'GET', path: '/v1/ingest/events', action: '' })).toBe(false);
    expect(artifactExists({ kind: 'web_page', path: '/orgs/:orgId/projects/:projectId/plugins/stripe-webhook', action: '' })).toBe(false);
    expect(artifactExists({ kind: 'web_page', path: '/orgs/:orgId/projects/:projectId/setup-wizard', action: '' })).toBe(false);
    expect(artifactExists({ kind: 'mcp_tool', tool: 'verify_installation', action: '' })).toBe(false);
    expect(publicWorkspacePackages().has('@growthos/tracking-sdk')).toBe(false);
    // ...and accept real ones, including a dynamic segment.
    expect(artifactExists({ kind: 'web_page', path: '/orgs/:orgId/projects/:projectId/ingest-health', action: '' })).toBe(true);
    expect(artifactExists({ kind: 'api_endpoint', method: 'GET', path: '/v1/ingest/batches/:batchId', action: '' })).toBe(true);
  });
});
