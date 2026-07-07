select
    raw_record_key,
    organization_id,
    project_id,
    environment_id,
    schema_name,
    client_id,
    payload,
    landed_at
from {{ ref('stg_raw_records') }}
where kind = 'entity'
