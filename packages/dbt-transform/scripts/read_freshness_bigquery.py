#!/usr/bin/env python3
"""Reads freshness metadata (row count + latest record timestamp) for one
project's core dbt tables (KAN-38) out of a real BigQuery `growthos_core`
dataset -- the `prod`-target sibling of `read_freshness.py`'s DuckDB read for
the `dev` target. Invoked as a subprocess from run-orchestration.mjs only
when `resolveOrchestrationTarget` selects `prod` (i.e. a real
`GOOGLE_CLOUD_PROJECT`/`GCLOUD_PROJECT` + `GROWTHOS_BIGQUERY_CORE_DATASET`
are configured). Uses the `google-cloud-bigquery` package `dbt-bigquery`
(requirements-bigquery.txt) already pulls in as a dependency -- no separate
package to install.

Usage: read_freshness_bigquery.py <gcp_project_id> <dataset> <location> <organization_id> <growthos_project_id> <output_json_path>

<location> may be an empty string when unset -- the client then infers it
from the dataset/table, matching how `dbt/profiles.yml`'s own `prod` target
only sets `location` when `GROWTHOS_BIGQUERY_LOCATION` is configured.

Writes a JSON array to <output_json_path>: one entry per core table
(`entities`, `events`, `measures`), each `{"table": ..., "rowCount": ...,
"latestRecordAt": ...}` (an ISO 8601 UTC string ending in "Z", or null if the
project has no rows in that table) -- the exact same shape
`read_freshness.py` writes, so `run-orchestration.mjs` and everything
downstream of it (`LocalDbtOrchestrationExecutor`, `OrchestrationRunModel`)
stay warehouse-agnostic.
"""
import json
import sys
from datetime import timezone

from google.cloud import bigquery

# Same per-table freshness column mapping as `read_freshness.py` -- these are
# fixed literals this script owns (not user input), so splicing them
# directly into the SQL below is safe; `organization_id`/`project_id` are
# always passed as bound query parameters, never interpolated.
FRESHNESS_COLUMNS = {
    "entities": "last_seen_at",
    "events": "landed_at",
    "measures": "landed_at",
}


def format_timestamp(value) -> str | None:
    """Normalizes a BigQuery-returned `TIMESTAMP` (a timezone-aware
    `datetime`, always UTC) into the same `"...Z"` string shape
    `read_freshness.py` emits for DuckDB's timezone-naive `datetime` (drop
    the offset, append a literal "Z") -- `overallFreshnessAsOf` (apps/web)
    compares these across both warehouses by parsed instant, not raw string,
    but keeping the literal format identical avoids giving that comparison
    anything warehouse-specific to trip over. `datetime.isoformat()` already
    omits the fractional-seconds component whenever it's exactly zero, same
    as the DuckDB side."""
    if value is None:
        return None
    naive_utc = value.astimezone(timezone.utc).replace(tzinfo=None) if value.tzinfo is not None else value
    return f"{naive_utc.isoformat()}Z"


def main() -> None:
    if len(sys.argv) != 7:
        print(
            "Usage: read_freshness_bigquery.py <gcp_project_id> <dataset> <location> "
            "<organization_id> <growthos_project_id> <output_json_path>",
            file=sys.stderr,
        )
        sys.exit(1)

    gcp_project_id, dataset, location, organization_id, growthos_project_id, output_path = sys.argv[1:7]
    client = bigquery.Client(project=gcp_project_id, location=location or None)

    freshness = []
    for table, time_column in FRESHNESS_COLUMNS.items():
        query = (
            f"select count(*) as row_count, max({time_column}) as latest "
            f"from `{gcp_project_id}.{dataset}.{table}` "
            "where organization_id = @organization_id and project_id = @project_id"
        )
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("organization_id", "STRING", organization_id),
                bigquery.ScalarQueryParameter("project_id", "STRING", growthos_project_id),
            ]
        )
        rows = list(client.query(query, job_config=job_config).result())
        row_count, latest = (rows[0]["row_count"], rows[0]["latest"]) if rows else (0, None)
        freshness.append({"table": table, "rowCount": row_count, "latestRecordAt": format_timestamp(latest)})

    with open(output_path, "w") as output_file:
        json.dump(freshness, output_file)


if __name__ == "__main__":
    main()
