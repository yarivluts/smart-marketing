-- DuckDB-only (KAN-18): asserts exact hand-computed values against the
-- fixture seed's synthetic projects, which only exist in the DuckDB dev
-- target.
{{ config(enabled=(target.type == 'duckdb')) }}
-- A dbt test query returning zero rows passes. 2026-08-21 KAN-59
-- follow-up AC-equivalent: "signups (and every other funnel step) countable
-- straight off a real warehouse table." Reuses `seeds/raw_records.csv`'s
-- existing `proj_2` synthetic anon -> signup -> purchase identity journey
-- (KAN-56's `bridge_identity` own fixture) rather than adding new rows —
-- this model only reads the same events, it doesn't change what any other
-- model computes off them, the same "two independent models, one fixture"
-- convention `fact_cohort_retention`'s own test comment already established
-- for `proj_11`:
--
--   signup: cust_3, cust_4, cust_5, cust_6, cust_7, cust_8 (6 customers).
--   purchase: cust_3 only (1 customer).
--   activated: cust_8 only (1 customer).
with expected(step, customer_count) as (
    values
        ('signup', 6),
        ('purchase', 1),
        ('activated', 1)
),
actual as (
    select step, count(distinct customer_id) as customer_count
    from {{ ref('fact_funnel_event') }}
    where project_id = 'proj_2'
    group by 1
)
select * from actual
except
select * from expected

union all

select * from expected
except
select * from actual
