-- Canonical measure fact table: append-only, one row per landed
-- pre-aggregated measure record (e.g. a daily ad-spend line).
select
    raw_record_key as measure_id,
    organization_id,
    project_id,
    environment_id,
    schema_name as measure_type,
    client_id,
    payload as properties,
    measure_value,
    measure_date,
    landed_at
from {{ ref('stg_measures') }}
