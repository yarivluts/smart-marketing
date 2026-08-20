-- DuckDB-only (KAN-18): asserts exact hand-computed values against the
-- fixture seed's synthetic `proj_11` funnel, the same isolated-project
-- convention `assert_fact_cohort_retention_fixture_matches_expected.sql`
-- already established for its own exact-count assertions against the same
-- project's events (a shared events fixture, two independent models reading
-- it -- adding funnel_step_mappings rows doesn't change what
-- fact_cohort_retention itself computes).
{{ config(enabled=(target.type == 'duckdb')) }}
-- KAN-75 `query_funnel` follow-up AC-equivalent: "funnel step counts match
-- a hand-computed fixture." `seeds/raw_records.csv`'s `proj_11` scenario
-- (funnel confirmed as signup -> activation -> conversion via
-- `funnel_step_mappings.csv`):
--
--   cust_a1: signup 01-05, activated 02-10, purchase 03-15 (reaches all 3).
--   cust_a2: signup 01-10 only (reaches signup only).
--   cust_a3: signup 01-20, purchase 03-05 -- reaches conversion having
--            never fired `activated` (this model reports observed stages,
--            it doesn't require or synthesize a skipped one).
--   cust_b1: signup 02-03, activated 03-01 (reaches signup + activation).
--   cust_b2: signup 02-15 only (reaches signup only).
--
-- So: signup = 5 customers (a1, a2, a3, b1, b2); activation = 2 (a1, b1);
-- conversion = 2 (a1, a3).
with expected(stage_key, step_order, customer_count) as (
    values
        ('signup', 0, 5),
        ('activation', 1, 2),
        ('conversion', 2, 2)
),
actual as (
    select stage_key, step_order, count(distinct customer_id) as customer_count
    from {{ ref('fact_funnel_step') }}
    where project_id = 'proj_11'
    group by 1, 2
)
select * from actual
except
select * from expected

union all

select * from expected
except
select * from actual
