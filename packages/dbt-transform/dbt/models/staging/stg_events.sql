select
    raw_record_key,
    organization_id,
    project_id,
    environment_id,
    schema_name,
    client_id,
    payload,
    -- The event's own `properties` object from the ingest envelope
    -- (`{event, event_id, ts, properties}`) — every downstream reader wants
    -- the user-declared fields, not the envelope wrapper.
    {{ json_object_field('payload', "'properties'") }} as properties,
    landed_at,
    -- Prefer the event's own client-reported `ts` (when the payload declares
    -- one) over ingest-time `landed_at`, so a batch replayed or delivered
    -- late still buckets by when the event actually happened. Falls back to
    -- `landed_at` for payloads that don't carry a `ts` field.
    coalesce(
        {{ growthos_try_cast(json_text_field('payload', "'ts'"), dbt.type_timestamp()) }},
        landed_at
    ) as occurred_at
from {{ ref('stg_raw_records') }}
where kind = 'event'
