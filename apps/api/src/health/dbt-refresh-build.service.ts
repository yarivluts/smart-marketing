import { Inject, Injectable, Logger, Optional, ServiceUnavailableException } from '@nestjs/common';
import { readBuildSha } from '@growthos/shared';
import { WarehouseNotConfiguredError, WarehouseQueryFailedError, type WarehouseQueryExecutor } from '@growthos/firebase-orm-models';

/** The warehouse executor the dbt-refresh build is read through; `defaultWarehouseQueryExecutor` in the app, a fake in tests. */
export const DBT_BUILD_INFO_EXECUTOR = Symbol('DBT_BUILD_INFO_EXECUTOR');
/** Millisecond clock, injectable so the cache can be tested without real time passing. */
export const DBT_BUILD_INFO_CLOCK = Symbol('DBT_BUILD_INFO_CLOCK');

export interface DbtRefreshBuildStatus {
  status: 'ok';
  service: 'dbt-refresh';
  /**
   * The commit of the dbt-refresh image that last ran, or `null` when that image was
   * built without `_GIT_SHA`, predates recording it, or no warehouse is configured.
   * Same "null, never a sentinel" contract as `/v1/health`'s own `buildSha`.
   */
  buildSha: string | null;
  /** When that run recorded it (warehouse timestamp as a string), or `null` when nothing is recorded. */
  recordedAt: string | null;
}

/**
 * How long one warehouse read is reused. The endpoint is public and unauthenticated,
 * so without this every anonymous request would be a BigQuery query. The job runs
 * hourly and the drift check hourly with a six-hour grace, so five minutes of
 * staleness costs nothing, and it bounds the query rate to ~12/hour per instance
 * whatever the request rate is.
 */
export const DBT_BUILD_INFO_CACHE_MS = 5 * 60 * 1000;
/**
 * A failed read is cached too, briefly, so a warehouse outage plus a burst of
 * requests is still one query per minute rather than one per request.
 */
export const DBT_BUILD_INFO_FAILURE_CACHE_MS = 60 * 1000;

const BUILD_INFO_SQL =
  'SELECT build_sha, CAST(recorded_at AS STRING) AS recorded_at FROM dbt_build_info ORDER BY recorded_at DESC LIMIT 1';

type Outcome = { ok: true; value: DbtRefreshBuildStatus } | { ok: false };

/**
 * Reports which build of the dbt-refresh Cloud Run Job last ran (KAN-204), for the
 * credential-free drift check in `.github/workflows/prod-drift.yml`.
 *
 * The job has no HTTP endpoint of its own. Every `dbt build` writes the image's
 * `GIT_SHA` into the one-row `dbt_build_info` table
 * (`packages/dbt-transform/dbt/models/ops`), and this API — which already queries
 * that dataset with its own service account — reads it back and publishes it. So
 * the workflow still reads only public HTTP and holds no GCP credentials; the
 * credentialed read happens inside production, where the credentials already live.
 *
 * Why this and not reading the job's configured image from the Cloud Run Admin
 * API: that would need a new IAM grant on api-prod's identity and would trust an
 * image tag's naming convention to carry the commit. This reports the build that
 * actually RAN, so a job whose executions stopped starting is caught as well.
 */
@Injectable()
export class DbtRefreshBuildService {
  private readonly logger = new Logger(DbtRefreshBuildService.name);

  private cached: { expiresAt: number; outcome: Promise<Outcome> } | null = null;

  private readonly now: () => number;

  constructor(
    @Inject(DBT_BUILD_INFO_EXECUTOR) private readonly executor: WarehouseQueryExecutor,
    @Optional() @Inject(DBT_BUILD_INFO_CLOCK) now?: () => number,
  ) {
    this.now = now ?? Date.now;
  }

  async getBuild(): Promise<DbtRefreshBuildStatus> {
    const now = this.now();
    if (this.cached === null || now >= this.cached.expiresAt) {
      // The promise is cached, not the value, so concurrent requests during a read
      // share it instead of each starting a query. Its expiry is set once it settles.
      const outcome = this.read();
      const entry = { expiresAt: Number.POSITIVE_INFINITY, outcome };
      this.cached = entry;
      void outcome.then((settled) => {
        entry.expiresAt = this.now() + (settled.ok ? DBT_BUILD_INFO_CACHE_MS : DBT_BUILD_INFO_FAILURE_CACHE_MS);
      });
    }
    const outcome = await this.cached.outcome;
    if (!outcome.ok) {
      // Deliberately not a 200 with a null SHA: that reads as "unstamped", a warning,
      // and a warehouse outage would then quietly stop the drift check. A 503 turns
      // the scheduled run red, which is what an unreadable answer deserves.
      throw new ServiceUnavailableException('The dbt-refresh build could not be read from the warehouse.');
    }
    return outcome.value;
  }

  private async read(): Promise<Outcome> {
    try {
      const [row] = await this.executor.execute({ sql: BUILD_INFO_SQL, params: {} });
      const recordedAt = row?.recorded_at;
      return {
        ok: true,
        value: this.status(
          readBuildSha(typeof row?.build_sha === 'string' ? row.build_sha : null),
          typeof recordedAt === 'string' && recordedAt.length > 0 ? recordedAt : null,
        ),
      };
    } catch (error) {
      if (error instanceof WarehouseNotConfiguredError) {
        // Dev and CI: no warehouse, so no recorded build. Honest null, not an outage.
        return { ok: true, value: this.status(null, null) };
      }
      if (error instanceof WarehouseQueryFailedError && isTableNotFound(error)) {
        // The table appears on the first run of an image that has the model. Until
        // then the job is, precisely, running an image that does not record its build.
        return { ok: true, value: this.status(null, null) };
      }
      this.logger.error(`Reading dbt_build_info failed: ${error instanceof Error ? error.message : String(error)}`);
      return { ok: false };
    }
  }

  private status(buildSha: string | null, recordedAt: string | null): DbtRefreshBuildStatus {
    return { status: 'ok', service: 'dbt-refresh', buildSha, recordedAt };
  }
}

/**
 * BigQuery reports a missing table as "Not found: Table <project>:<dataset>.<table>".
 * Matched on the message rather than on HTTP 404 alone, because a missing DATASET is
 * also a 404 and is a misconfiguration that must surface as an error, not read as
 * "this job has not recorded a build yet".
 */
function isTableNotFound(error: WarehouseQueryFailedError): boolean {
  return /not found: table [^\s]*dbt_build_info/i.test(error.message);
}
