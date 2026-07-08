#!/usr/bin/env python3
"""Reads freshness metadata (row count + latest record timestamp) for one
project's core dbt tables (KAN-38) out of the DuckDB database KAN-37's dbt
project just built. Invoked as a subprocess from run-orchestration.mjs, never
run directly by a human. Uses the `duckdb` Python package that `dbt-duckdb`
(this project's own adapter) already pulls in via requirements.txt -- no new
dependency needed, and no new npm-side DuckDB driver either.

Usage: read_freshness.py <duckdb_path> <organization_id> <project_id> <output_json_path>

Writes a JSON array to <output_json_path>: one entry per core table
(`entities`, `events`, `measures`), each `{"table": ..., "rowCount": ...,
"latestRecordAt": ...}` (an ISO 8601 UTC string, or null if the project has
no rows in that table).
"""
import json
import sys

import duckdb

# Per-table "freshness" timestamp column -- the three core tables don't share
# one time-column name (`entities` is a current-state snapshot keyed on
# `last_seen_at`; `events`/`measures` are append-only facts keyed on
# `landed_at`), the same reason KAN-41's compiler needed a per-aggregation
# `timeColumn` rather than assuming one universal column name. These are
# fixed literals this script owns (not user input), so splicing them
# directly into the SQL below is safe; `organization_id`/`project_id` are
# always passed as bound parameters, never interpolated.
FRESHNESS_COLUMNS = {
    "entities": "last_seen_at",
    "events": "landed_at",
    "measures": "landed_at",
}


def main() -> None:
    if len(sys.argv) != 5:
        print(
            "Usage: read_freshness.py <duckdb_path> <organization_id> <project_id> <output_json_path>",
            file=sys.stderr,
        )
        sys.exit(1)

    duckdb_path, organization_id, project_id, output_path = sys.argv[1:5]
    connection = duckdb.connect(database=duckdb_path, read_only=True)

    freshness = []
    for table, time_column in FRESHNESS_COLUMNS.items():
        row_count, latest = connection.execute(
            f"select count(*), max({time_column}) from main_core.{table} "
            "where organization_id = ? and project_id = ?",
            [organization_id, project_id],
        ).fetchone()
        latest_iso = f"{latest.isoformat()}Z" if latest is not None else None
        freshness.append({"table": table, "rowCount": row_count, "latestRecordAt": latest_iso})

    with open(output_path, "w") as output_file:
        json.dump(freshness, output_file)


if __name__ == "__main__":
    main()
