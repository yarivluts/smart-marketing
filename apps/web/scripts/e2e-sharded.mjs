#!/usr/bin/env node
/**
 * The e2e suite as CI runs it: one production build, then the three shards, each under its own
 * Firebase emulators and against `next start` (E2E_PROD_SERVER=1, see playwright.config.ts).
 *
 * The build inlines the Auth emulator host into the client bundle (a NEXT_PUBLIC_ variable is
 * fixed at build time), and opts out of standalone output, which `next start` does not serve.
 * Serving a build instead of `next dev` means no navigation waits on an on-demand compile or a
 * Fast Refresh rebuild, which is what made specs miss their 15s assertion windows at random.
 */
import { execSync } from 'node:child_process';

const buildEnv = {
  ...process.env,
  NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
  NEXT_OUTPUT_STANDALONE: 'false',
};
execSync('pnpm exec next build', { stdio: 'inherit', env: buildEnv });

const runEnv = { ...process.env, E2E_PROD_SERVER: '1' };
for (const shard of ['1/3', '2/3', '3/3']) {
  execSync(`firebase emulators:exec --project demo-growthos-test --only auth,firestore "playwright test --shard=${shard}"`, { stdio: 'inherit', env: runEnv });
}
