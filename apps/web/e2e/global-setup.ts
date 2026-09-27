import type { FullConfig } from '@playwright/test';
import { SESSION_COOKIE_NAME } from '../lib/auth/constants';

/**
 * Compiles the routes the specs visit before any spec starts its clock.
 *
 * `next dev` compiles each route on its first request. Every spec signs up, lands on the dashboard,
 * creates an org and a project and opens a feature page, and asserts each navigation within the
 * 15s `expect` timeout - so whichever spec is first to reach a route pays its whole compile inside
 * that window. On a loaded CI runner that is what made random specs fail their first attempt (and
 * sometimes every retry). Requesting each route once here moves that cost outside every assertion.
 *
 * The middleware only checks that a session cookie is present, so a placeholder cookie is enough
 * for a protected page to be compiled; the page's own session check then rejects it and redirects,
 * which is fine - only the compile matters. Failures are logged, never fatal: warming is an
 * optimisation, and a spec that really needs a broken route still fails on its own.
 */
const PLACEHOLDER = 'warmup';
const PROJECT = `/en/orgs/${PLACEHOLDER}/projects/${PLACEHOLDER}`;

export const WARM_ROUTES: readonly string[] = [
  '/en/signup',
  '/en/login',
  '/en/dashboard',
  '/en/orgs',
  '/en/orgs/new',
  `/en/orgs/${PLACEHOLDER}`,
  `/en/orgs/${PLACEHOLDER}/projects/new`,
  `/en/orgs/${PLACEHOLDER}/resources`,
  `/en/orgs/${PLACEHOLDER}/audit-log`,
  `${PROJECT}/onboarding`,
  ...[
    'boards',
    'keys',
    'schema-defs',
    'metric-defs',
    'ingest-health',
    'hooks',
    'record-feed',
    'billing-ops-feed',
    'customers',
    'feedback',
    'intent-quality',
    'experiments',
    'funnel',
    'cohorts',
    'insights',
    'campaign-ops',
    'cost-guardrails',
    'plugins',
  ].map((page) => `${PROJECT}/${page}`),
  '/en/tv',
];

const PER_ROUTE_TIMEOUT_MS = 180_000;

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL;
  if (!baseURL || process.env.E2E_SKIP_WARMUP === '1') return;
  const started = Date.now();
  for (const route of WARM_ROUTES) {
    try {
      await fetch(new URL(route, baseURL), {
        headers: { cookie: `${SESSION_COOKIE_NAME}=${PLACEHOLDER}` },
        redirect: 'manual',
        signal: AbortSignal.timeout(PER_ROUTE_TIMEOUT_MS),
      });
    } catch (error) {
      console.warn(`[e2e warm-up] ${route}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  console.log(`[e2e warm-up] compiled ${WARM_ROUTES.length} routes in ${Math.round((Date.now() - started) / 1000)}s`);
}
