select
    raw_record_key,
    organization_id,
    project_id,
    environment_id,
    schema_name,
    client_id,
    payload,
    landed_at,
    {{ growthos_try_cast(json_text_field('payload', "'value'"), dbt.type_float()) }} as measure_value,
    -- The measure's own `dimensions` object from the ingest envelope
    -- (`{measure, ts, value, dimensions}`).
    {{ json_object_field('payload', "'dimensions'") }} as dimensions,
    -- Measures carry `ts` (an ISO timestamp) in the envelope, not a bare
    -- `date` field — cast to date for the daily grain every measure metric
    -- buckets by.
    {{ growthos_try_cast(json_text_field('payload', "'ts'"), dbt.type_timestamp()) }} as measure_ts,
    {{ growthos_try_cast(json_text_field('payload', "'ts'"), 'date') }} as measure_date
from {{ ref('stg_raw_records') }}
where kind = 'measure'
