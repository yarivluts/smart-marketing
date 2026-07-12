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
  fullyParallel: false,
  workers: 1,
  retries: 1,
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
