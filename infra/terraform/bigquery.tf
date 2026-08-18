# KAN-18 phase 1 (warehouse): the two BigQuery datasets that back the
# real-warehouse slice of `docs/plan` — a raw landing zone mirroring
# `RawRecordModel` (packages/firebase-orm-models), and the dbt-built
# canonical core tables (packages/dbt-transform's `core` schema). Unlike
# every other resource in this directory, these do NOT already exist in the
# real project — an automated run attempted to provision them directly via
# `bq mk`/`gcloud`, but that action is blocked by this environment's own
# safety controls (creating live cloud infra is treated as sensitive
# regardless of budget/reversibility). This file is `terraform fmt`/
# `validate`-clean and ready for a human (or an explicitly-authorized run)
# to `terraform apply` — at that point these become the first resources in
# this directory actually created BY Terraform, rather than imported after
# the fact like everything else here (see README.md).
#
# Cost note: BigQuery datasets themselves are free; you pay for storage
# (~$0.02/GB/month) and on-demand query bytes scanned (first 1 TiB/month
# free). Unlike Memorystore/Redis (KAN-18's other remaining piece), there is
# no standing per-hour charge — safe to provision within the project's
# small budget. Redis is deliberately NOT modeled here yet: it needs a VPC
# + Serverless VPC Access connector for Cloud Run to reach it, plus a
# continuous per-instance charge, and is a cost decision this repo's human
# owner should make explicitly rather than one an autonomous run defaults
# to spending on.
resource "google_bigquery_dataset" "raw" {
  project     = var.project_id
  dataset_id  = "growthos_raw"
  location    = var.region
  description = "GrowthOS raw ingest landing zone — mirrors RawRecordModel (Firestore), exported/streamed in here per raw-record (KAN-18 phase 1)."
  labels = {
    app         = "warehouse"
    environment = "prod"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_bigquery_dataset" "core" {
  project     = var.project_id
  dataset_id  = "growthos_core"
  location    = var.region
  description = "GrowthOS dbt-built canonical core tables (packages/dbt-transform's `core` schema) — the real target for compiled metric queries once WarehouseQueryExecutor is wired to BigQuery."
  labels = {
    app         = "warehouse"
    environment = "prod"
  }

  lifecycle {
    prevent_destroy = true
  }
}

# Drop-in BigQuery equivalent of `packages/firebase-orm-models/src/models/raw-record.model.ts`
# — see that model's own doc comment for the field-by-field mapping. Partitioned by
# `partition_date` (matches the model's own `YYYY-MM-DD` field) and clustered by tenant/env
# so a per-org/project/environment query prunes to a small slice rather than scanning the
# whole table.
resource "google_bigquery_table" "raw_records" {
  project    = var.project_id
  dataset_id = google_bigquery_dataset.raw.dataset_id
  table_id   = "raw_records"

  time_partitioning {
    type  = "DAY"
    field = "partition_date"
  }

  clustering = ["organization_id", "project_id", "environment_id"]

  schema = jsonencode([
    { name = "raw_record_id", type = "STRING", mode = "REQUIRED", description = "The source PipelineMessage id — the dedup/idempotency key for a re-landed record." },
    { name = "organization_id", type = "STRING", mode = "REQUIRED" },
    { name = "project_id", type = "STRING", mode = "REQUIRED" },
    { name = "environment_id", type = "STRING", mode = "REQUIRED" },
    { name = "partition_date", type = "DATE", mode = "REQUIRED" },
    { name = "batch_id", type = "STRING", mode = "REQUIRED" },
    { name = "kind", type = "STRING", mode = "REQUIRED", description = "entity | event | measure" },
    { name = "schema_name", type = "STRING", mode = "REQUIRED" },
    { name = "client_id", type = "STRING", mode = "REQUIRED" },
    { name = "payload", type = "JSON", mode = "REQUIRED" },
    { name = "landed_at", type = "TIMESTAMP", mode = "REQUIRED" },
  ])

  lifecycle {
    prevent_destroy = true
  }
}
