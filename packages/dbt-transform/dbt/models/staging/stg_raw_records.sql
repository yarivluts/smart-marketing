-- Thin typing/renaming layer over the raw ingest export. Against the
-- DuckDB dev target this reads `seeds/raw_records.csv` (a fixture "test
-- dataset" stand-in — see the seed's own doc comment); against a real
-- BigQuery target it reads the actual partitioned `growthos_raw.raw_records`
-- table `infra/terraform/bigquery.tf` declares and KAN-33's
-- `BigQueryRawRecordSink` streams into. One row per landed record,
-- unfiltered by kind.
with source_records as (

{% if target.type == 'bigquery' %}
    select
        organization_id,
        project_id,
        environment_id,
        partition_date,
        batch_id,
        kind,
        schema_name,
        client_id,
        payload,
        landed_at
    from {{ source('growthos_raw', 'raw_records') }}
{% else %}
    select
        organization_id,
        project_id,
        environment_id,
        partition_date,
        batch_id,
        kind,
        schema_name,
        client_id,
        payload,
        landed_at
    from {{ ref('raw_records') }}
{% endif %}

)

select
    organization_id,
    project_id,
    environment_id,
    partition_date,
    batch_id,
    kind,
    schema_name,
    client_id,
    payload,
    landed_at,
    -- Deterministic surrogate key for a landed record. `client_id` alone isn't
    -- unique across kinds/schemas/environments, and a record can legitimately
    -- be re-landed under a new batch (KAN-34 replay), so the key folds in
    -- every column that makes one raw record distinct from another.
    {{ surrogate_key(['organization_id', 'project_id', 'environment_id', 'batch_id', 'kind', 'schema_name', 'client_id']) }} as raw_record_key
from source_records
-- The raw table can legitimately hold the SAME record more than once: BigQuery's
-- streaming-insert `insertId` dedup is a best-effort window of about a minute, so a
-- KAN-34 DLQ replay or the ingest-health "re-export records to warehouse" backfill
-- (`reexportRawRecordsToWarehouse`) that re-lands a record later inserts a second
-- physical row. Idempotency therefore lives HERE, not in the sink: keep the first
-- landing of each key so `raw_record_key` stays unique (the `_staging.yml` test) and
-- nothing downstream double-counts a replayed record.
qualify row_number() over (
    partition by organization_id, project_id, environment_id, batch_id, kind, schema_name, client_id
    order by landed_at
) = 1
