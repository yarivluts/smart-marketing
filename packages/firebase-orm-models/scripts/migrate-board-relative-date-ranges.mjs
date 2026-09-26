#!/usr/bin/env node
/**
 * KAN-211 one-off: switch every pack-seeded board still on its frozen seed-time date range to the
 * rolling "last 30 days" default. See `migrateSeededBoardsToRelativeDateRange` in
 * `src/services/board.service.ts` for exactly which boards qualify (and why a human-chosen range
 * is never touched). Idempotent - safe to re-run.
 *
 * Dry run by default; pass --apply to write.
 *
 *   pnpm --filter @growthos/shared build && pnpm --filter @growthos/firebase-orm-models build
 *   node packages/firebase-orm-models/scripts/migrate-board-relative-date-ranges.mjs --project <gcp-project-id> [--org <orgId> [--project-id <projectId>]] [--apply]
 *
 * Credentials come from Application Default Credentials (Firebase Admin SDK), the same as the
 * Cloud Run services; FIRESTORE_EMULATOR_HOST is honoured for a local rehearsal.
 */
import 'reflect-metadata';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { connectFirestoreOrmAdmin, migrateSeededBoardsToRelativeDateRange } = require('../dist/index.js');

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
const result = await migrateSeededBoardsToRelativeDateRange({
  ...(organizationId ? { organizationId } : {}),
  ...(projectId ? { projectId } : {}),
  dryRun: !apply,
});

console.log(JSON.stringify({ ...result, migratedCount: result.migrated.length }, null, 2));
if (!apply) {
  console.log('Dry run only - re-run with --apply to write these changes.');
}
process.exit(0);
