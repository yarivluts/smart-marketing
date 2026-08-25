{{ config(enabled=(target.type == 'duckdb')) }}
-- DuckDB-only (KAN-18): asserts exact hand-computed values against the
-- fixture seed's synthetic `proj_21` support-ticket lifecycle journey — four
-- tickets opened, three resolved (two by `agent_a1`, one by `agent_a2`), one
-- left open. `agent_org_person_id` is coalesced to the sentinel `'none'` for
-- an `opened`-stage row (which never carries an agent, see the schema's own
-- doc comment) so the `except`-based diff below never has to compare a NULL
-- against a NULL, the same "no set-op ambiguity" reasoning every fixture
-- test in this file follows.
with expected(stage, agent_key, row_count) as (
    values
        ('opened', 'none', 4),
        ('resolved', 'agent_a1', 2),
        ('resolved', 'agent_a2', 1)
),
actual as (
    select stage, coalesce(agent_org_person_id, 'none') as agent_key, count(*) as row_count
    from {{ ref('fact_support_ticket_event') }}
    where project_id = 'proj_21'
    group by 1, 2
)
select * from actual
except
select * from expected

union all

select * from expected
except
select * from actual
