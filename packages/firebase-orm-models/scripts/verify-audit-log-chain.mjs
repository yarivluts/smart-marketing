#!/usr/bin/env node
/**
 * Read-only: verifies one org's audit-log hash chain with `verifyAuditLogChainForOrg` and prints
 * the verdict - edited entries (hash_mismatch), missing parents (chain_break), and the benign
 * concurrent-append forks written before appends were serialized. Writes nothing; there is no
 * --apply. Forked history is deliberately NOT re-chained: every forked entry already verifies, and
 * rewriting hash-committed history would itself be an undetectable edit of the audit trail.
 *
 *   pnpm --filter @growthos/shared build && pnpm --filter @growthos/firebase-orm-models build
 *   node packages/firebase-orm-models/scripts/verify-audit-log-chain.mjs --project <gcp-project-id> --org <orgId>
 *
 * Credentials come from Application Default Credentials (Firebase Admin SDK);
 * FIRESTORE_EMULATOR_HOST is honoured for a local rehearsal. Prints ids, actions, times and
 * counts only - never before/after payloads.
 */
import 'reflect-metadata';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { connectFirestoreOrmAdmin, verifyAuditLogChainForOrg } = require('../dist/index.js');

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const gcpProjectId = argValue('--project');
const organizationId = argValue('--org');
if (!gcpProjectId || !organizationId) {
  console.error('Usage: --project <gcp-project-id> --org <orgId>');
  process.exit(2);
}

await connectFirestoreOrmAdmin({ projectId: gcpProjectId });
const result = await verifyAuditLogChainForOrg(organizationId);
console.log(
  JSON.stringify(
    {
      organizationId,
      valid: result.valid,
      entryCount: result.entryCount,
      ...(result.valid ? {} : { reason: result.reason, brokenEntry: result.brokenEntry }),
      forkCount: result.forks.length,
      sideBranchEntries: result.forks.reduce((total, fork) => total + fork.branches.length - 1, 0),
      forks: result.forks.map((fork) => ({
        parent: fork.parent ? `${fork.parent.id} ${fork.parent.action} ${fork.parent.createdAt}` : '(start of log)',
        branches: fork.branches.map((branch) => `${branch.id} ${branch.action} ${branch.createdAt}`),
      })),
    },
    null,
    2,
  ),
);
process.exit(result.valid ? 0 : 1);
