import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const AUTH_EMULATOR_HOST = '127.0.0.1:9099';
const FIRESTORE_EMULATOR_HOST = '127.0.0.1:8090';

// Some sandboxes pre-install a pinned Chromium revision that may not match
// this package's @playwright/test version; use it directly instead of
// downloading a new one when present. Real CI has no such pre-install (see
// ci.yml's "Install Playwright browsers" step) and falls back to Playwright's
// own managed browser at its default cache path.
const SANDBOX_CHROMIUM_PATH = '/opt/pw-browsers/chromium';
const sandboxChromiumExecutable = existsSync(SANDBOX_CHROMIUM_PATH) ? SANDBOX_CHROMIUM_PATH : undefined;

export default defineConfig({
  testDir: './e2e',
  // The onboarding wizard (KAN-68) now sits between "create a project" and the org page for every
  // spec that creates a project through the UI — one more first-compile-in-this-run page in a hot
  // path most specs already exercise, on top of the "cold dev-server compile" budget individual
  // specs already raise their own `test.setTimeout` for. Bumped from the original 30s to absorb
  // that one extra compile across the whole suite rather than patching every affected spec file.
  timeout: 45_000,
  // Playwright's own `expect(...).toHaveURL()`/`toBeVisible()` polls use a
  // separate, much shorter default timeout (5s) than the whole-test budget
  // above — too short for the same "first compile in this run" dev-server
  // cost the `timeout: 45_000` comment already describes: a page-navigation
  // assertion right after a route's first-ever visit this run can still be
  // mid-compile at the 5s mark even though the surrounding test has 45s left.
  // Observed causing real, non-app-bug CI failures (main's own CI run for
  // this PR, and a local full-suite run): `auth.spec.ts`'s post-signup
  // dashboard redirect, `boards.spec.ts`'s post-create-project onboarding
  // redirect, and `ingest-health.spec.ts`'s nav-link URL update all missed a
  // 5s window despite the app genuinely finishing the navigation shortly
  // after. Raise just the assertion-poll ceiling to match.
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  // Which spec trips a timing assertion varies run to run (observed across
  // three separate full-suite runs: boards/auth, then onboarding/orgs/
  // resource-library, no repeat offender) — this is generic CI-runner
  // resource contention under a `next dev` server, not one fixable route.
  // `retries: 1` still left one spec hard-failed twice in a row on a real
  // CI run; bump to 2 so transient contention doesn't fail the whole suite.
  retries: 2,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `pnpm exec next dev -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST: AUTH_EMULATOR_HOST,
      FIREBASE_AUTH_EMULATOR_HOST: AUTH_EMULATOR_HOST,
      FIRESTORE_EMULATOR_HOST: FIRESTORE_EMULATOR_HOST,
    },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: sandboxChromiumExecutable ? { executablePath: sandboxChromiumExecutable } : undefined,
      },
    },
  ],
});
