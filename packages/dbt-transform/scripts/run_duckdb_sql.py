#!/usr/bin/env python3
"""Runs SQL against a fresh IN-MEMORY DuckDB database and prints the results as
JSON. A test harness, never run by a human or in production: it lets a test in
another package prove that a hand-written warehouse query actually computes
what it claims on a real SQL engine, not just that its text has the right
shape (B20: `query_funnel`'s SQL had the right shape and counted the wrong
thing). Uses the `duckdb` package `dbt-duckdb` already installs into this
package's venv, the same way `read_freshness.py` does.

In-memory on purpose: the dbt-built `target/growthos_transform.duckdb` file is
rebuilt by other tests while they run, and DuckDB allows one writer per file.

Reads one JSON object from stdin:
    {"setup": ["<sql>", ...], "queries": [{"sql": "<sql>", "params": {...}}, ...]}
`setup` statements run first, in order (create and fill fixture tables).
Each query's named parameters are DuckDB `$name` placeholders.

Usage: run_duckdb_sql.py <output_json_path>

Writes a JSON array to <output_json_path> (a file, not stdout, so the venv
provisioning output a first run prints can never corrupt it): one array of
row objects per query. Timestamps and decimals are written as strings.
"""
import json
import sys

import duckdb


def main() -> None:
    if len(sys.argv) != 2:
        print("Usage: run_duckdb_sql.py <output_json_path>", file=sys.stderr)
        sys.exit(1)
    request = json.load(sys.stdin)
    connection = duckdb.connect(database=":memory:")
    for statement in request.get("setup", []):
        connection.execute(statement)

    results = []
    for query in request.get("queries", []):
        cursor = connection.execute(query["sql"], query.get("params") or {})
        columns = [description[0] for description in cursor.description]
        results.append([dict(zip(columns, row)) for row in cursor.fetchall()])

    with open(sys.argv[1], "w") as output_file:
        json.dump(results, output_file, default=str)


if __name__ == "__main__":
    main()
