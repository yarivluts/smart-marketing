# The scheduled warehouse-refresh runner (KAN-18/KAN-38): a minimal image
# that runs `dbt build --target prod` against the real BigQuery project and
# exits — executed as a Cloud Run *Job* (not a service) on a Cloud Scheduler
# cadence, since the web/api service containers are Node-only and deliberately
# don't carry a Python toolchain. Credentials come from the job's own service
# account via Application Default Credentials (dbt's `oauth` method — see
# dbt/profiles.yml's `prod` output), so no key file is baked in or mounted.
#
# Build (from the monorepo root, matching deploy/cloudbuild.dbt.yaml):
#   docker build -f packages/dbt-transform/Dockerfile -t <image> .
FROM python:3.12-slim

WORKDIR /app

# dbt needs git for package resolution even when packages.yml is absent.
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*

COPY packages/dbt-transform/requirements.txt packages/dbt-transform/requirements-bigquery.txt ./
# dbt-duckdb (requirements.txt) is NOT installed: this image only ever runs
# the BigQuery target; the DuckDB dev/CI leg keeps using the venv that
# run-dbt.mjs self-provisions. dbt-core arrives as dbt-bigquery's dependency,
# pinned by requirements-bigquery.txt to the same 1.11.x line.
RUN pip install --no-cache-dir -r requirements-bigquery.txt

COPY packages/dbt-transform/dbt ./dbt

WORKDIR /app/dbt
ENV DBT_PROFILES_DIR=/app/dbt

# GOOGLE_CLOUD_PROJECT / GROWTHOS_BIGQUERY_CORE_DATASET /
# GROWTHOS_BIGQUERY_LOCATION are supplied by the Cloud Run Job's env config —
# the same three vars the app's own BigQuery seams read.
ENTRYPOINT ["dbt", "build", "--target", "prod"]
