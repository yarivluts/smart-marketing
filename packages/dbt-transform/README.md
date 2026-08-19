# @growthos/dbt-transform

dbt project (plan `13 §E4.1`): staging models over raw ingest, canonical
`entities`/`events`/`measures` core tables, dbt tests.

## Why DuckDB, not BigQuery — and the BigQuery port (KAN-18 phase 4)

There's no live BigQuery project yet (KAN-18, `needs-human`), so CI runs this
project against `dbt-duckdb` — a local, file-based warehouse stand-in, the
same "buildable today, swap the provider later" posture this repo already
uses for `LocalKmsProvider` (KAN-29), `InMemoryTokenBucketRateLimiter`
(KAN-34), and `NotConfiguredWarehouseQueryExecutor` (KAN-42).
`dbt/seeds/raw_records.csv` is a fixture "test dataset" standing in for a
real export of KAN-33's Firestore `raw_records` collection (itself a
stand-in for a partitioned BigQuery raw table).

`dbt/profiles.yml` also has a real `prod` (type: `bigquery`) output, and
every model/macro in this project is written to compile identically against
either adapter — see `dbt/macros/cross_database.sql`'s own doc comments for
the specific DuckDB/BigQuery dialect differences it papers over (JSON field
extraction, tolerant casts, date-part diffing/truncation, a portable
row-per-integer join, and a shared "hash every column into a surrogate key"
convention that explicitly stringifies each field first, since BigQuery's
`||` — unlike DuckDB's — errors on a non-STRING operand). `stg_raw_records`
switches at compile time (`target.type == 'bigquery'`) between the DuckDB
seed and a declared `growthos_raw.raw_records` **source**
(`models/staging/_sources.yml`) pointing at the real table
`infra/terraform/bigquery.tf` provisions and `BigQueryRawRecordSink`
(KAN-18 phase 3) streams into.

**Not yet ported for BigQuery:** `seeds/schema_identity_fields.csv` (feeding
`bridge_identity`'s identity-key stitching) stays seed-only for both
targets — it's already documented as a stand-in for a warehouse export of
`SchemaDefModel.field_defs` that doesn't exist yet (a separate future story,
not this one). Running `dbt build --target prod` today would also need a
real seed target dataset for it (`dbt_project.yml`'s `+schema: seed` — the
`growthos_core_seed` dataset terraform doesn't provision).

**Verification status:** the `dev` (DuckDB) target is the one CI actually
executes (`dbt build`) on every change — including all 118
seed/run/test cases, unchanged in outcome by this port (see the fixture
tests). The `prod` (BigQuery) target has been verified with `dbt parse
--target prod` (using the real `dbt-bigquery` adapter — see
`requirements-bigquery.txt` below — the full manifest builds and every
`bigquery__*` macro dispatch resolves with no Jinja/SQL syntax errors) but
**not** against a live BigQuery project: KAN-18 is still `needs-human`, so
nothing here has executed a real BigQuery query. Every BigQuery-dialect
choice is written to documented GoogleSQL syntax and explained in
`cross_database.sql`'s comments rather than guessed silently; treat it as
ready for a human (or an explicitly-authorized run) to validate against a
real project, the same posture `infra/terraform/`'s own README already
establishes for the rest of KAN-18.

To try the BigQuery target locally once a real project exists:

```bash
.venv/bin/pip install -r requirements-bigquery.txt   # adds the dbt-bigquery adapter
export GOOGLE_CLOUD_PROJECT=<project-id>              # or GCLOUD_PROJECT
export GROWTHOS_BIGQUERY_CORE_DATASET=growthos_core    # optional, this is the default
export GROWTHOS_BIGQUERY_RAW_DATASET=growthos_raw      # optional, this is the default
export GROWTHOS_BIGQUERY_LOCATION=US                   # optional, this is the default
DBT_PROFILES_DIR=dbt .venv/bin/dbt build --project-dir dbt --target prod
```

Authenticates via Application Default Credentials (`profiles.yml`'s
`method: oauth`) — run `gcloud auth application-default login` first, or rely
on the ambient service-account credentials of wherever this actually runs
(matches how `BigQueryWarehouseQueryExecutor`/`BigQueryRawRecordSink` already
authenticate — see `packages/firebase-orm-models/src/warehouse/`).

## Layers

- `models/staging/` — one row per landed raw record (`stg_raw_records`), split
  by kind (`stg_entities` / `stg_events` / `stg_measures`).
- `models/core/` — canonical tables the AC asks for:
  - `entities`: current-state snapshot, latest payload per (project, schema,
    entity id).
  - `events`: append-only event fact table.
  - `measures`: append-only pre-aggregated measure fact table (e.g. a daily
    ad-spend line).
  - `bridge_identity` (KAN-56): deterministic identity stitching — resolves
    each anonymous visitor id to the customer identity it shares registered
    identity-key evidence with (plan `04 §4`). Reads
    `seeds/schema_identity_fields.csv` (a stand-in for a warehouse export of
    KAN-31's `SchemaDefModel.field_defs` filtered to `is_identity_key =
    true`, same posture as `raw_records.csv`) via the new
    `stg_identity_key_observations` staging model, so the fields it stitches
    on are whatever a project has actually registered, never hard-coded. See
    the model's own doc comment for the full conflict-resolution rule.

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
