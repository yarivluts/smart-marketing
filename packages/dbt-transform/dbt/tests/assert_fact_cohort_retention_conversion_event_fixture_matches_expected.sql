-- DuckDB-only (KAN-18): see `assert_fact_cohort_retention_fixture_matches_expected.sql`'s
-- own comment for why (`with cte(cols) as (values ...)`, BigQuery-incompatible).
{{ config(enabled=(target.type == 'duckdb')) }}
-- KAN-118 AC-equivalent: "conversion cohort matrix (parameterized by a
-- specific event) matches a hand-computed fixture." Same `proj_11` scenario
-- as the sibling `__any__` fixture test (see its own comment for the full
-- per-customer activity timeline, including why the observable periods run
-- through 2026-05 rather than stopping at 2026-03), but for
-- `conversion_event = 'purchase'` instead of `__any__`: only cust_a1
-- (03-15) and cust_a3 (03-05) ever fire `purchase`, both in period 2 of the
-- 2026-01 cohort; nobody in the 2026-02 cohort (cust_b1, cust_b2) ever
-- does, so every one of its periods is 0 -- confirming a specific
-- conversion event's row still exists (cohort_size stays the cohort's real
-- size, not a 0/0 divide) even when nobody in that cohort ever reaches it.
with expected(cohort_month, period_number, cohort_size, retained_count, retention_rate) as (
    values
        (timestamp '2026-01-01', 0, 3, 0, 0.0),
        (timestamp '2026-01-01', 1, 3, 0, 0.0),
        (timestamp '2026-01-01', 2, 3, 2, 0.6667),
        (timestamp '2026-01-01', 3, 3, 0, 0.0),
        (timestamp '2026-01-01', 4, 3, 0, 0.0),
        (timestamp '2026-02-01', 0, 2, 0, 0.0),
        (timestamp '2026-02-01', 1, 2, 0, 0.0),
        (timestamp '2026-02-01', 2, 2, 0, 0.0),
        (timestamp '2026-02-01', 3, 2, 0, 0.0)
),
actual as (
    select cohort_month, period_number, cohort_size, retained_count, round(retention_rate, 4) as retention_rate
    from {{ ref('fact_cohort_retention') }}
    where project_id = 'proj_11' and conversion_event = 'purchase'
)
(select * from actual
except
select * from expected)

union all

(select * from expected
except
select * from actual)
