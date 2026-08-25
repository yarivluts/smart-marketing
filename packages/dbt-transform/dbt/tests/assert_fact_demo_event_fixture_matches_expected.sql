{{ config(enabled=(target.type == 'duckdb')) }}
-- DuckDB-only (KAN-18): asserts exact hand-computed values against the
-- fixture seed's synthetic `proj_22` demo-pipeline journey — four demos
-- scheduled (two booked by `rep_r1`, one by `rep_r2`, one self-served with
-- no rep assigned yet), two held (both `rep_r1`'s), one a no-show
-- (`rep_r2`'s), one canceled (never held, never a no-show — excluded from
-- the held/no_show counts entirely, same "not every stage feeds every
-- number" posture the schema's own doc comment documents). `rep_org_person_id`
-- is coalesced to the sentinel `'none'` for the rep-less rows (the
-- self-served scheduling and the canceled outcome) so the `except`-based
-- diff below never has to compare a NULL against a NULL, the same "no set-op
-- ambiguity" reasoning every fixture test in this file follows.
with expected(stage, rep_key, row_count) as (
    values
        ('scheduled', 'rep_r1', 2),
        ('scheduled', 'rep_r2', 1),
        ('scheduled', 'none', 1),
        ('held', 'rep_r1', 2),
        ('no_show', 'rep_r2', 1),
        ('canceled', 'none', 1)
),
actual as (
    select stage, coalesce(rep_org_person_id, 'none') as rep_key, count(*) as row_count
    from {{ ref('fact_demo_event') }}
    where project_id = 'proj_22'
    group by 1, 2
)
select * from actual
except
select * from expected

union all

select * from expected
except
select * from actual
