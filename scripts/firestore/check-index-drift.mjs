#!/usr/bin/env node
/**
 * Reports drift between `firestore.indexes.json` and a live Firestore project's
 * composite indexes.
 *
 * Exists because CI structurally cannot catch a missing composite index: the
 * Firestore emulator does not enforce them, so the suite passes whether or not
 * the index is deployed. `infra/terraform/README.md` records seven production
 * crashes from this before the file was seeded; KAN-129 was the eighth. This
 * turns "found when a customer's page breaks" into one command.
 *
 * Read-only — lists indexes and compares. It never creates or deletes anything.
 *
 *   node scripts/firestore/check-index-drift.mjs [--project growthos-g2w84]
 *
 * Exits 1 on drift so it can gate a deploy step.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { compareIndexes, formatIndexDrift, hasIndexDrift } from '../../packages/shared/dist/index.js';

const projectFlag = process.argv.indexOf('--project');
const project = projectFlag !== -1 ? process.argv[projectFlag + 1] : 'growthos-g2w84';

const declared = JSON.parse(readFileSync(new URL('../../firestore.indexes.json', import.meta.url), 'utf8')).indexes ?? [];

// `gcloud` on Windows is a .cmd shim; the extensionless POSIX script beside it
// cannot execute and fails silently with empty output that reads like an auth
// error (see CLAUDE.md).
const isWindows = process.platform === 'win32';
const gcloud = isWindows ? 'gcloud.cmd' : 'gcloud';
const raw = execFileSync(gcloud, ['firestore', 'indexes', 'composite', 'list', '--project', project, '--format=json'], {
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024,
  // Node refuses to spawn a `.cmd` without a shell since its command-injection
  // hardening. Safe here: every argument is a literal or the `--project` value,
  // which is the operator's own input on their own machine.
  shell: isWindows,
});

const deployed = JSON.parse(raw).map((index) => ({
  // gcloud returns the index name, not the collection group, as its own field —
  // the group is the second-to-last path segment of `name`.
  collectionGroup: index.name.split('/').at(-3),
  fields: index.fields ?? [],
}));

const drift = compareIndexes(declared, deployed);
console.log(`Comparing ${declared.length} declared against ${deployed.length} deployed in ${project}:\n`);
console.log(formatIndexDrift(drift));
process.exit(hasIndexDrift(drift) ? 1 : 0);
