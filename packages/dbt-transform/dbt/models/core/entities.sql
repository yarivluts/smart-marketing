-- Canonical entity "current state" table: one row per (org, project,
-- environment, schema, entity id), the latest-landed payload for that
-- entity. Deliberately no history kept here — an entity is defined as its
-- present snapshot; `events` below is where the append-only history lives.
--
-- `environment_id` (and `organization_id`) joined the dedup partition and
-- `entity_key` on 2026-08-19 (session-B QA): before that, a dev-environment
-- and prod-environment entity sharing a client_id deduped AGAINST each
-- other — only one survived, with whichever environment's payload landed
-- most recently — the exact test/live blending every other fact table's
-- env-inclusive grain already prevents. Both must change together: adding
-- env to the partition without the key would make `entity_key` collide
-- across environments and fail its own uniqueness test.
with ranked as (
    select
        *,
        row_number() over (
            partition by organization_id, project_id, environment_id, schema_name, client_id
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
    {{ surrogate_key(['organization_id', 'project_id', 'environment_id', 'schema_name', 'client_id']) }} as entity_key,
    attributes as properties,
    landed_at as last_seen_at
from ranked
where recency_rank = 1
