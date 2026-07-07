-- Thin typing/renaming layer over the raw ingest export (KAN-33's Firestore
-- `raw_records` stand-in for a real BigQuery raw table, partitioned by
-- org/project/env/date). One row per landed record, unfiltered by kind.
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
    md5(
        organization_id || '|' || project_id || '|' || environment_id || '|'
        || batch_id || '|' || kind || '|' || schema_name || '|' || client_id
    ) as raw_record_key
from {{ ref('raw_records') }}
