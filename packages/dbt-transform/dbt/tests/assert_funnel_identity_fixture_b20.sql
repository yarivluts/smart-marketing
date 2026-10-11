-- DuckDB-only: asserts the fixture seed (proj_25, proj_26).
{{ config(enabled=(target.type == 'duckdb')) }}
-- B20 (2026-09-26): `query_funnel` counted events, not people, and every step on
-- its own, so EasySign's funnel read 4 -> 6 -> 6 -> 6 -> 6 (150%). The fixed
-- query (`buildFunnelStepsQuery` in @growthos/firebase-orm-models) resolves each
-- event to a person through THIS model's anon -> customer edges, and its DuckDB
-- proof (`funnel-steps-query.duckdb.test.ts` there) runs against these same seed
-- rows with exactly the edges listed below. This test is what keeps the two
-- honest: if the identity rules here change, the edges the funnel proof assumes
-- must change with them.
--
--   proj_25 reproduces EasySign dev: four touchpoint visitors, two of whom
--   signed up (their signup declares anon_id + customer_id); four REST-created
--   customers who never had a touchpoint get no edge at all.
--   proj_26 is the edge-case fixture: one edge per identified visitor, two
--   devices (p8a, p8b) stitched to one customer, no edge for the never-
--   identified p4-anon or the legacy-convention person, and env_other's own
--   edges kept in env_other (p4-anon -> c9 there must not reach env_dev).
with expected(project_id, environment_id, anon_id, customer_id) as (
    values
        ('proj_25', 'env_dev', 'anon-9a59', 'cust-D3CM'),
        ('proj_25', 'env_dev', 'anon-1cbd', 'cust-taY2'),
        ('proj_26', 'env_dev', 'p1-anon', 'c1'),
        ('proj_26', 'env_dev', 'p2-anon', 'c2'),
        ('proj_26', 'env_dev', 'p3-anon', 'c3'),
        ('proj_26', 'env_dev', 'p6-anon', 'c6'),
        ('proj_26', 'env_dev', 'p7-anon', 'c7'),
        ('proj_26', 'env_dev', 'p8a', 'c8'),
        ('proj_26', 'env_dev', 'p8b', 'c8'),
        ('proj_26', 'env_dev', 'p9-anon', 'c9'),
        ('proj_26', 'env_other', 'z1', 'z1c'),
        ('proj_26', 'env_other', 'p4-anon', 'c9')
),
actual as (
    select project_id, environment_id, anon_id, customer_id
    from {{ ref('bridge_identity') }}
    where project_id in ('proj_25', 'proj_26')
),
-- The funnel reads `events.entity_id` as the per-event id under the documented
-- contract; the proof depends on that, so pin it: every proj_25 event's
-- entity_id is its own event_id, never a person.
entity_is_event_id as (
    select count(*) as n
    from {{ ref('events') }}
    where project_id = 'proj_25'
      and entity_id in ('cust-D3CM', 'cust-taY2', 'anon-9a59', 'anon-1cbd')
)
select 'bridge_missing' as failure, anon_id as detail from (select * from expected except select * from actual) m
union all
select 'bridge_unexpected', anon_id from (select * from actual except select * from expected) u
union all
select 'entity_id_is_a_person', cast(n as varchar) from entity_is_event_id where n != 0
