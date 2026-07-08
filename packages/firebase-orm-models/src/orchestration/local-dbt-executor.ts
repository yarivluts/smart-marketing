import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  OrchestrationExecutionError,
  type OrchestrationExecutionResult,
  type OrchestrationExecutor,
  type OrchestrationExecutorRunParams,
  type OrchestrationFreshnessEntry,
} from './executor';

/** `dbt build` itself normally finishes in a couple of seconds once its venv is provisioned (see `packages/dbt-transform/scripts/dbt-env.mjs`); this gives generous headroom for a cold provision (a `pip install` on a fresh checkout with no cached `.venv`) without letting a genuinely hung subprocess block a caller forever. */
const RUN_TIMEOUT_MS = 5 * 60_000;

interface RunOrchestrationScriptOutput {
  ok: true;
  freshness: OrchestrationFreshnessEntry[];
  generatedAt: string;
}

interface RunOrchestrationScriptFailure {
  ok: false;
  errorMessage: string;
}

/** How many parent directories {@link findMonorepoRoot} climbs from `process.cwd()` before giving up — deep enough for any real caller in this repo (`apps/web`, `apps/api`, `packages/*` are all one level below the repo root) with headroom to spare. */
const MAX_ROOT_SEARCH_DEPTH = 10;

/**
 * Walks up from `process.cwd()` looking for `pnpm-workspace.yaml` — the
 * one file that unambiguously marks this monorepo's own root, regardless of
 * which package's directory a process happened to start in. `process.cwd()`
 * is a genuine OS-level value (a real `getcwd()` syscall) resolved purely at
 * runtime, unlike `require.resolve()` or `__dirname`, both of which turned
 * out to be unreliable inside this specific call path (see
 * {@link resolveDbtTransformDir}'s own doc comment) — no bundler can rewrite
 * a value it has no static/compile-time visibility into.
 */
function findMonorepoRoot(): string | null {
  let dir = process.cwd();
  for (let i = 0; i < MAX_ROOT_SEARCH_DEPTH; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
  return null;
}

/**
 * Locates the sibling `@growthos/dbt-transform` package this executor
 * shells out to. The obvious approach — `require.resolve('@growthos/dbt-transform/package.json')`,
 * relying on the same pnpm-managed workspace symlink every other
 * cross-package import in this monorepo already uses — is correct in every
 * runtime this code has been verified against directly (plain Node, Vitest,
 * Jest/`apps/api`) but breaks under a real `next dev`/`next build` server:
 * confirmed by hand that Next's webpack pipeline bundles this module into
 * the requesting route's own compiled chunk (even with the package listed
 * in `serverExternalPackages`), which rewrites `require.resolve()` into an
 * internal module id (e.g. `(rsc)/../../packages/dbt-transform`, not a real
 * path) *and* rewrites `__dirname` to the bundled chunk's own output
 * location (e.g. `.next/server/app/api/...`) rather than this source file's
 * real location — so neither can be trusted as a fallback for the other
 * inside a bundled context. `findMonorepoRoot()`'s `process.cwd()`-based
 * walk is the one strategy that survives bundling, so it's tried first;
 * `require.resolve` is kept as a fallback for a caller running from
 * somewhere `process.cwd()` doesn't lead back to this monorepo's root
 * (unusual for this private, monorepo-only package, but cheap insurance).
 */
function resolveDbtTransformDir(): string {
  const root = findMonorepoRoot();
  if (root) {
    const fromRoot = join(root, 'packages', 'dbt-transform');
    if (existsSync(fromRoot)) {
      return fromRoot;
    }
  }
  return dirname(require.resolve('@growthos/dbt-transform/package.json'));
}

function tail(text: string, lines = 20): string {
  return text
    .split('\n')
    .filter((line) => line.length > 0)
    .slice(-lines)
    .join('\n');
}

/**
 * The only real {@link OrchestrationExecutor} today (KAN-38): actually runs
 * KAN-37's dbt project end to end via `packages/dbt-transform/scripts/run-orchestration.mjs`
 * — `dbt build` (seed + run + test) against the buildable-today DuckDB
 * stand-in, then reads the resulting `core` tables back, filtered to the
 * requesting org/project, for row counts + latest timestamps.
 *
 * Because dbt-transform's own seed (`seeds/raw_records.csv`) is still a
 * static fixture standing in for a real per-org/project/environment export
 * (see that package's own KAN-37 doc comments), a run triggered for a
 * project this product actually created (not the fixture's own hardcoded
 * `org_1`/`proj_1`/`org_2`/`proj_9`) legitimately comes back with zero rows
 * in every table today — there's no live wiring yet from KAN-33's Firestore
 * `raw_records` into this seed. That's a real, deliberate, documented
 * limitation of *this run*, not a bug in this executor: once a future story
 * replaces the fixture with a real per-project export, freshness numbers
 * become meaningful without this executor (or the model/service around it)
 * needing to change at all.
 */
export class LocalDbtOrchestrationExecutor implements OrchestrationExecutor {
  async run(params: OrchestrationExecutorRunParams): Promise<OrchestrationExecutionResult> {
    const dbtTransformDir = resolveDbtTransformDir();
    const outputDir = mkdtempSync(join(tmpdir(), 'growthos-orchestration-'));
    const outputPath = join(outputDir, 'result.json');
    try {
      // Resolved via PATH (`'node'`), not `process.execPath` — the same
      // reasoning `dbt-env.mjs` already documents for its own `python3`
      // call: an absolute interpreter path captured from *this* process can
      // point somewhere a child process spawned from a different execution
      // context (e.g. a Next.js dev server request handler, vs. a plain
      // Node/vitest process) isn't actually able to exec, surfacing as a
      // bare ENOENT with no useful diagnostic.
      const result = spawnSync(
        'node',
        [join(dbtTransformDir, 'scripts', 'run-orchestration.mjs'), params.organizationId, params.projectId, outputPath],
        { cwd: dbtTransformDir, encoding: 'utf8', timeout: RUN_TIMEOUT_MS },
      );

      if (result.error) {
        throw new OrchestrationExecutionError(`Failed to start the dbt orchestration run: ${result.error.message}`);
      }

      let raw: string;
      try {
        raw = readFileSync(outputPath, 'utf8');
      } catch {
        const combined = tail(`${result.stdout ?? ''}\n${result.stderr ?? ''}`);
        throw new OrchestrationExecutionError(
          `The dbt orchestration run produced no result (exit code ${result.status}).${combined ? ` Last output:\n${combined}` : ''}`,
        );
      }

      const parsed = JSON.parse(raw) as RunOrchestrationScriptOutput | RunOrchestrationScriptFailure;
      if (!parsed.ok) {
        throw new OrchestrationExecutionError(parsed.errorMessage);
      }
      return { freshness: parsed.freshness };
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  }
}

export const defaultOrchestrationExecutor: OrchestrationExecutor = new LocalDbtOrchestrationExecutor();
