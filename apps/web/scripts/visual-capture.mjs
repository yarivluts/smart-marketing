#!/usr/bin/env node
/**
 * Visual capture harness for the Stitch → code conversion work.
 *
 * Signs up a throwaway user against the local Firebase emulators, creates an
 * org + project through the real UI (same flow as e2e/*.spec.ts), then takes
 * full-page screenshots of every requested route at desktop and mobile sizes.
 *
 * Prereqs (not started by this script):
 *   - firebase emulators:start --project demo-growthos-test --only auth,firestore
 *   - next dev -p 3100 with NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST,
 *     FIREBASE_AUTH_EMULATOR_HOST and FIRESTORE_EMULATOR_HOST set.
 *
 * Usage:
 *   node scripts/visual-capture.mjs --out <dir> [--routes settings,keys,...] [--locales en,he] [--fresh]
 *
 * Route tokens are paths relative to the project (e.g. `keys`), or absolute
 * templates starting with `/` that may use {orgId} / {projectId}.
 */
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const BASE_URL = process.env.VISUAL_BASE_URL ?? 'http://127.0.0.1:3100';
const PASSWORD = 'Sup3rSecret!';
const STATE_DIR = join(tmpdir(), 'growthos-visual');
const STORAGE_STATE = join(STATE_DIR, 'storage-state.json');
const IDS_FILE = join(STATE_DIR, 'ids.json');

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};

export const PROJECT_ROUTES = [
  '', 'ad-studio', 'ad-studio/autopilot', 'ad-studio/storyboard', 'ad-studio/video-export',
  'attribution', 'automation', 'billing-ops-feed', 'boards', 'campaign-ops', 'campaigns',
  'churn-reasons', 'cohorts', 'cost-guardrails', 'customers', 'demos', 'experiments', 'feedback',
  'field-mappings', 'firmographics', 'funnel', 'goals', 'hooks', 'ingest-health', 'insights',
  'integrations', 'intent-quality', 'keys', 'mcp', 'metric-defs', 'onboarding', 'plugins',
  'record-feed', 'rep-collections', 'resources', 'schema-defs', 'segments', 'session-replay',
  'settings', 'setup-checklist', 'support', 'tv', 'win-rules',
];

export const GLOBAL_ROUTES = [
  '/{locale}', '/{locale}/login', '/{locale}/signup', '/{locale}/pricing', '/{locale}/dashboard',
  '/{locale}/orgs', '/{locale}/orgs/new', '/{locale}/orgs/{orgId}', '/{locale}/orgs/{orgId}/audit-log',
  '/{locale}/orgs/{orgId}/plugins', '/{locale}/orgs/{orgId}/resources', '/{locale}/orgs/{orgId}/settings',
  '/{locale}/orgs/{orgId}/projects/new', '/{locale}/mcp', '/{locale}/onboarding',
];

function parseArgs(argv) {
  const args = { out: null, routes: null, locales: ['en'], fresh: false, viewports: Object.keys(VIEWPORTS) };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') args.out = argv[++i];
    else if (a === '--routes') args.routes = argv[++i].split(',').map((s) => s.trim());
    else if (a === '--locales') args.locales = argv[++i].split(',').map((s) => s.trim());
    else if (a === '--viewports') args.viewports = argv[++i].split(',').map((s) => s.trim());
    else if (a === '--fresh') args.fresh = true;
  }
  if (!args.out) throw new Error('--out <dir> is required');
  return args;
}

async function setupAccount(browser) {
  mkdirSync(STATE_DIR, { recursive: true });
  const context = await browser.newContext({ viewport: VIEWPORTS.desktop });
  const page = await context.newPage();
  const email = `visual-${Date.now()}@example.com`;

  await page.goto(`${BASE_URL}/en/signup`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign up' }).click();
  await page.waitForURL(/\/en\/dashboard/, { timeout: 90_000 });

  await page.goto(`${BASE_URL}/en/orgs/new`);
  await page.getByLabel('Organization name').fill('Visual QA Org');
  await page.getByRole('button', { name: 'Create organization' }).click();
  await page.waitForURL((url) => /\/en\/orgs\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith('/orgs/new'), {
    timeout: 90_000,
  });
  const orgId = new URL(page.url()).pathname.split('/').pop();

  await page.goto(`${BASE_URL}/en/orgs/${orgId}/projects/new`);
  await page.getByLabel(/project( or website)? name/i).first().fill('Visual QA Project');
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.waitForURL((url) => /\/projects\/(?!new)[^/]+(\/|$)/.test(url.pathname), { timeout: 90_000 });
  const projectId = new URL(page.url()).pathname.match(/\/projects\/([^/]+)/)[1];

  await context.storageState({ path: STORAGE_STATE });
  const ids = { email, orgId, projectId };
  writeFileSync(IDS_FILE, JSON.stringify(ids, null, 2));
  await context.close();
  return ids;
}

function expandRoute(token, ids, locale) {
  const path = token.startsWith('/')
    ? token
    : `/{locale}/orgs/{orgId}/projects/{projectId}${token ? `/${token}` : ''}`;
  return path.replaceAll('{locale}', locale).replaceAll('{orgId}', ids.orgId).replaceAll('{projectId}', ids.projectId);
}

function slug(token) {
  return (token || 'project-home').replace(/^\//, '').replace(/[{}]/g, '').replace(/[\/]+/g, '__') || 'root';
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = resolve(args.out);
  mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch();
  let ids;
  if (!args.fresh && existsSync(STORAGE_STATE) && existsSync(IDS_FILE)) {
    ids = JSON.parse(readFileSync(IDS_FILE, 'utf8'));
  } else {
    try {
      ids = await setupAccount(browser);
    } catch (error) {
      const pages = browser.contexts().flatMap((c) => c.pages());
      const last = pages[pages.length - 1];
      if (last) {
        await last.screenshot({ path: join(outDir, '_setup-failure.png'), fullPage: true }).catch(() => {});
        console.error(`[visual] setup failed at ${last.url()}`);
      }
      throw error;
    }
  }
  console.log(`[visual] using org=${ids.orgId} project=${ids.projectId}`);

  const routes = args.routes ?? [...GLOBAL_ROUTES, ...PROJECT_ROUTES];
  const results = [];
  for (const viewportName of args.viewports) {
    const context = await browser.newContext({
      viewport: VIEWPORTS[viewportName],
      storageState: STORAGE_STATE,
      deviceScaleFactor: 1,
      isMobile: viewportName === 'mobile',
      hasTouch: viewportName === 'mobile',
    });
    const page = await context.newPage();
    for (const locale of args.locales) {
      for (const token of routes) {
        const url = `${BASE_URL}${expandRoute(token, ids, locale)}`;
        const file = join(outDir, `${slug(token)}.${viewportName}.${locale}.png`);
        try {
          const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 120_000 });
          await page.waitForTimeout(600);
          await page.screenshot({ path: file, fullPage: true });
          results.push({ token, viewportName, locale, status: response?.status() ?? 0, finalUrl: page.url(), file });
          console.log(`[visual] ${response?.status()} ${viewportName} ${locale} ${token} -> ${file}`);
        } catch (error) {
          results.push({ token, viewportName, locale, status: -1, error: String(error), file: null });
          console.log(`[visual] FAIL ${viewportName} ${locale} ${token}: ${error}`);
        }
      }
    }
    await context.close();
  }
  writeFileSync(join(outDir, 'results.json'), JSON.stringify({ ids, results }, null, 2));
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
