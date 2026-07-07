-- Canonical entity "current state" table: one row per (project, schema,
-- entity id), the latest-landed payload for that entity. Deliberately no
-- history kept here — an entity is defined as its present snapshot; `events`
-- below is where the append-only history lives.
with ranked as (
    select
        *,
        row_number() over (
            partition by project_id, schema_name, client_id
            order by landed_at desc
        ) as recency_rank
    from {{ ref('stg_entities') }}
)

select
    organization_id,
    project_id,
    environment_id,
    schema_name,
    client_id as entity_id,
    project_id || '|' || schema_name || '|' || client_id as entity_key,
    payload as properties,
    landed_at as last_seen_at
from ranked
where recency_rank = 1
