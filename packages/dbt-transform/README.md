# @growthos/dbt-transform

dbt project (plan `13 §E4.1`): staging models over raw ingest, canonical
`entities`/`events`/`measures` core tables, dbt tests.

## Why DuckDB, not BigQuery

There's no live BigQuery project yet (KAN-18, `needs-human`), so this project
runs against `dbt-duckdb` — a local, file-based warehouse stand-in, the same
"buildable today, swap the provider later" posture this repo already uses for
`LocalKmsProvider` (KAN-29), `InMemoryTokenBucketRateLimiter` (KAN-34), and
`NotConfiguredWarehouseQueryExecutor` (KAN-42). `dbt/seeds/raw_records.csv` is
a fixture "test dataset" standing in for a real export of KAN-33's Firestore
`raw_records` collection (itself a stand-in for a partitioned BigQuery raw
table). When KAN-18/KAN-37's follow-on work provisions a real warehouse, add a
`prod` (type: `bigquery`) output to `dbt/profiles.yml` pointed at the real
raw-records export — the models, tests, and seeds don't need to change, since
dbt compiles the same SQL against either adapter.

## Layers

- `models/staging/` — one row per landed raw record (`stg_raw_records`), split
  by kind (`stg_entities` / `stg_events` / `stg_measures`).
- `models/core/` — canonical tables the AC asks for:
  - `entities`: current-state snapshot, latest payload per (project, schema,
    entity id).
  - `events`: append-only event fact table.
  - `measures`: append-only pre-aggregated measure fact table (e.g. a daily
    ad-spend line).

This is a deliberately generic, denormalized shape — no join-graph/mart layer
yet (the same simplification KAN-41's metrics compiler already documents for
its own dimension/filter handling). Vertical-specific canonical tables (plan
`04 §1`'s `fact_ad_spend`, `fact_funnel_event`, etc.) are a later step once a
real source plugin (KAN-49+) lands typed data to build them from.

## Running locally

```bash
pnpm --filter @growthos/dbt-transform build   # dbt parse (fast validation)
pnpm --filter @growthos/dbt-transform test    # dbt build (seed + run + test)
```

Both scripts self-provision a local Python virtualenv (`.venv/`, git-ignored)
with the pinned `dbt-core`/`dbt-duckdb` versions from `requirements.txt` on
first run — no separate CI setup step needed, the same posture `pnpm test`
already has for the Firestore emulator (KAN-22) and Playwright browsers.
Provisioning itself lives in `scripts/dbt-env.mjs`, shared by both entry
points above and by `scripts/run-orchestration.mjs` below.

## Orchestrating a run for one project (KAN-38)

`scripts/run-orchestration.mjs <organizationId> <projectId> <outputJsonPath>`
is this package's own "run once, freshness metadata written back" entry
point — it re-runs `dbt build` and then reads the resulting `core` tables
back (via `scripts/read_freshness.py`, using the `duckdb` Python package
`dbt-duckdb` already pulls in), filtered to the given project, for row
counts + latest timestamps. It's invoked as a subprocess by
`@growthos/firebase-orm-models`'s `LocalDbtOrchestrationExecutor`
(`src/orchestration/local-dbt-executor.ts`) — the Firestore-backed
`OrchestrationRunModel`/`triggerOrchestrationRun` seam a project's admin
"Run now" button calls — never run directly by a human. See that package's
own `orchestration/executor.ts` doc comment for why a real Dagster/Cloud
Workflows scheduler is deferred until KAN-18 provisions somewhere to run one.
