{{ config(enabled=(target.type == 'duckdb')) }}
-- DuckDB-only (KAN-18): asserts exact hand-computed values against the
-- fixture seed's synthetic `proj_16` payback journey.
--
-- `cust_p1` signs up 2026-07-01 and has four succeeded charges afterward, at
-- +2 days ($100), +9 days ($50), +24 days ($30), +35 days ($20), plus a
-- fifth at +62 days ($999) — well past every window, proving the join never
-- leaks a too-late charge into any bucket. Cumulative-inclusive-of-day-N
-- windows: 7d=$100 (only the +2d charge), 14d=$150 (+ the +9d charge),
-- 30d=$180 (+ the +24d charge), 40d=$200 (+ the +35d charge; the +62d charge
-- never counts).
--
-- `cust_p2` signs up 2026-07-05 and has exactly one charge, four days later,
-- with `status = 'failed'` — proving a failed charge is never collected
-- revenue: every window is $0, not null (the left join still produces a row
-- for a customer with zero *succeeded* charges).
with expected(customer_id, collected_revenue_7d, collected_revenue_14d, collected_revenue_30d, collected_revenue_40d) as (
    values
        ('cust_p1', 100.0, 150.0, 180.0, 200.0),
        ('cust_p2', 0.0, 0.0, 0.0, 0.0)
),
actual as (
    select customer_id, collected_revenue_7d, collected_revenue_14d, collected_revenue_30d, collected_revenue_40d
    from {{ ref('fact_customer_payback') }}
    where project_id = 'proj_16'
)
select * from actual
except
select * from expected

union all

select * from expected
except
select * from actual
