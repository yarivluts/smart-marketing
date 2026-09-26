#!/usr/bin/env node
/**
 * KAN-213 one-off: declare the built-in pack unit (count / ratio / percent / currency /
 * duration_seconds) on every ACTIVE built-in pack metric registered before metrics carried a unit.
 * See `backfillBuiltinMetricUnits` in `src/services/metric-unit-backfill.service.ts` for exactly
 * which metrics qualify: a metric that already has a unit, or whose definition was changed from the
 * pack's, is never touched. Idempotent - safe to re-run. Goal data is never rewritten.
 *
 * Dry run by default; pass --apply to write.
 *
 *   pnpm --filter @growthos/shared build && pnpm --filter @growthos/firebase-orm-models build
 *   node packages/firebase-orm-models/scripts/backfill-builtin-metric-units.mjs --project <gcp-project-id> [--org <orgId> [--project-id <projectId>]] [--apply]
 *
 * Credentials come from Application Default Credentials (Firebase Admin SDK), the same as the
 * Cloud Run services; FIRESTORE_EMULATOR_HOST is honoured for a local rehearsal.
 */
import 'reflect-metadata';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { connectFirestoreOrmAdmin, backfillBuiltinMetricUnits } = require('../dist/index.js');

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const gcpProjectId = argValue('--project');
const organizationId = argValue('--org');
const projectId = argValue('--project-id');
const apply = process.argv.includes('--apply');

if (!gcpProjectId) {
  console.error('Missing --project <gcp-project-id>.');
  process.exit(2);
}

await connectFirestoreOrmAdmin({ projectId: gcpProjectId });
const result = await backfillBuiltinMetricUnits({
  ...(organizationId ? { organizationId } : {}),
  ...(projectId ? { projectId } : {}),
  dryRun: !apply,
});

console.log(JSON.stringify({ ...result, updatedCount: result.updated.length, skippedCustomisedCount: result.skippedCustomised.length }, null, 2));
if (!apply) {
  console.log('Dry run only - re-run with --apply to write these changes.');
}
process.exit(0);
