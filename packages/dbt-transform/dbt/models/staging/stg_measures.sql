select
    raw_record_key,
    organization_id,
    project_id,
    environment_id,
    schema_name,
    client_id,
    payload,
    landed_at,
    try_cast(payload ->> 'value' as double) as measure_value,
    try_cast(payload ->> 'date' as date) as measure_date
from {{ ref('stg_raw_records') }}
where kind = 'measure'
