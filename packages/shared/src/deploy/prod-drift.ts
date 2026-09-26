/**
 * Whether production is running what `main` says it should be (KAN-180).
 *
 * GrowthOS has no deploy-on-merge: every production deploy is a manual Cloud
 * Build + `gcloud run deploy` (`docs/deploy-api.md`). That is a defensible
 * choice on its own. What made it expensive was that nothing noticed when the
 * two diverged. Twice in one week an integrator was blocked on code that was
 * already written, reviewed, green and merged:
 *
 *   - `register_schema`'s `dry_run` sat merged for about a day before anyone
 *     deployed it, by which point production was 151 commits behind `main`.
 *   - The follow-up that let `dry_run` run on a read-only key then sat merged
 *     but not live in exactly the same way.
 *
 * Both times the fix existed and the only missing step was a deploy nobody knew
 * was owed. This turns that into a signal.
 *
 * Pure, so the decision is testable without a network or a git checkout; the
 * I/O lives in `scripts/deploy/check-prod-drift.mjs`.
 */

export type ProdDriftStatus =
  /** Production is at `main`, or at a commit `main` has not moved past. */
  | 'current'
  /** Behind, but only by commits young enough that a deploy is plausibly already on its way. */
  | 'within_grace'
  /** Behind by commits older than the grace period. A deploy is owed and nobody has done it. */
  | 'drifted'
  /**
   * Production does not report a build SHA — its image predates stamping, or was
   * built without one. Reported as its own state rather than folded into
   * `drifted` or `current`: the check genuinely cannot tell, and saying so is the
   * honest answer. One deploy with `_GIT_SHA` set clears it permanently.
   */
  | 'unstamped';

export interface UndeployedCommit {
  sha: string;
  /** ISO-8601 commit timestamp. */
  committedAt: string;
}

export interface ProdDriftInput {
  /** From production's `/v1/health` `buildSha`; `null` when it reports none. */
  deployedSha: string | null;
  mainSha: string;
  /**
   * Commits reachable from `main` but not from `deployedSha`, in any order.
   * Empty when production is current. Ignored when `deployedSha` is null.
   */
  undeployedCommits: readonly UndeployedCommit[];
  now: Date;
  /** How long a merged commit may wait before its absence counts as drift. */
  graceHours: number;
  /**
   * Set when `undeployedCommits` was narrowed to commits touching only these paths
   * (`git log A..main -- <paths>`), for a service whose image is built from a small
   * corner of the monorepo (KAN-204). The dbt-refresh job is built from
   * `packages/dbt-transform` alone: counting every web or API merge against it would
   * raise its alarm after every ordinary deploy that did not touch dbt, and an alarm
   * that fires during ordinary operation is one people learn to ignore. Only
   * phrases the message; the decision is made on `undeployedCommits` either way.
   */
  watchedPaths?: readonly string[];
}

export interface ProdDriftAssessment {
  status: ProdDriftStatus;
  /** Commits `main` has that production does not; `null` when unstamped. */
  behindBy: number | null;
  /** Age of the OLDEST undeployed commit, in whole hours; `null` when not behind or unstamped. */
  oldestUndeployedAgeHours: number | null;
  message: string;
}

/**
 * How long a merge may sit undeployed before it counts as drift.
 *
 * Long enough that a normal merge-then-deploy afternoon never trips it — an
 * alarm that fires during ordinary operation is one people learn to ignore.
 * Short enough that the failure this exists for is caught the same working
 * day: the dry-run fix waited roughly twenty-four hours, which a six-hour
 * grace would have flagged by mid-afternoon.
 */
export const DEFAULT_PROD_DRIFT_GRACE_HOURS = 6;

const HOUR_MS = 60 * 60 * 1000;

export function assessProdDrift(input: ProdDriftInput): ProdDriftAssessment {
  if (input.deployedSha === null) {
    return {
      status: 'unstamped',
      behindBy: null,
      oldestUndeployedAgeHours: null,
      message:
        'Production does not report a build SHA, so how far it lags main cannot be determined. ' +
        'Its image predates build-SHA stamping or was built without _GIT_SHA. ' +
        'Deploy once with _GIT_SHA set (see docs/deploy-api.md) and this check starts working.',
    };
  }

  const watched = input.watchedPaths && input.watchedPaths.length > 0 ? input.watchedPaths.join(', ') : null;
  const atMain = shaMatches(input.deployedSha, input.mainSha);

  if (input.undeployedCommits.length === 0 || atMain) {
    return {
      status: 'current',
      behindBy: 0,
      oldestUndeployedAgeHours: null,
      message:
        watched === null || atMain
          ? `Production is at ${short(input.deployedSha)}, which is main.`
          : `Production is at ${short(input.deployedSha)}; main (${short(input.mainSha)}) has no later change to ${watched}.`,
    };
  }

  // The OLDEST undeployed commit decides it, not the newest. A merge five
  // minutes ago does not make a merge from yesterday any less overdue — and
  // measuring from the newest would let a steady trickle of merges keep
  // resetting the clock, so a stale production would never be reported.
  const oldestMs = Math.min(...input.undeployedCommits.map((commit) => Date.parse(commit.committedAt)));
  const oldestAgeHours = Math.max(0, Math.floor((input.now.getTime() - oldestMs) / HOUR_MS));
  const behindBy = input.undeployedCommits.length;
  const commits = watched === null ? `${behindBy} commit(s)` : `${behindBy} commit(s) touching ${watched}`;

  if (oldestAgeHours < input.graceHours) {
    return {
      status: 'within_grace',
      behindBy,
      oldestUndeployedAgeHours: oldestAgeHours,
      message: `Production is ${commits} behind main, the oldest ${oldestAgeHours}h old — within the ${input.graceHours}h grace period.`,
    };
  }

  return {
    status: 'drifted',
    behindBy,
    oldestUndeployedAgeHours: oldestAgeHours,
    message:
      `Production is at ${short(input.deployedSha)}, ${commits} behind main (${short(input.mainSha)}). ` +
      `The oldest undeployed commit merged ${oldestAgeHours}h ago, past the ${input.graceHours}h grace period. ` +
      'A deploy is owed — see docs/deploy-api.md.',
  };
}

/** Git accepts any unambiguous prefix, and health may report a short SHA while `main` is resolved long. */
function shaMatches(a: string, b: string): boolean {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x.startsWith(y) || y.startsWith(x);
}

function short(sha: string): string {
  return sha.slice(0, 7);
}
