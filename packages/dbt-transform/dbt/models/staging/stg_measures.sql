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
    {{ growthos_try_cast(json_text_field('payload', "'date'"), 'date') }} as measure_date
from {{ ref('stg_raw_records') }}
where kind = 'measure'
