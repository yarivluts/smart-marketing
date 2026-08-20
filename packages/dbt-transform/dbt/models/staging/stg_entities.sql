select
    raw_record_key,
    organization_id,
    project_id,
    environment_id,
    schema_name,
    client_id,
    payload,
    -- The entity's own `attributes` object from the ingest envelope
    -- (`{id, attributes}`).
    {{ json_object_field('payload', "'attributes'") }} as attributes,
    landed_at
from {{ ref('stg_raw_records') }}
where kind = 'entity'
