-- Canonical event fact table: append-only, one row per landed event record.
select
    raw_record_key as event_id,
    organization_id,
    project_id,
    environment_id,
    schema_name as event_type,
    client_id as entity_id,
    payload as properties,
    occurred_at,
    landed_at
from {{ ref('stg_events') }}
