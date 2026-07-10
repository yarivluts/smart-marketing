-- A dbt test query returning zero rows passes. KAN-62 AC: "Cohort matrix
-- matches hand-computed fixture." `seeds/raw_records.csv` carries a
-- hand-built two-cohort scenario under `proj_11`, isolated from every other
-- project's own exact-row-count-asserting fixture test:
--
--   Cohort 2026-01 (3 customers): cust_a1 signs up 01-05, comes back
--   02-10 and again 03-15 (retained every period); cust_a2 signs up 01-10
--   and never returns (churned after period 0); cust_a3 signs up 01-20 and
--   comes back only 03-05 (retained at period 2 despite skipping period 1 —
--   "active in period N", not "active every period up to N").
--
--   Cohort 2026-02 (2 customers): cust_b1 signs up 02-03 and comes back
--   03-01; cust_b2 signs up 02-15 and never returns.
--
-- The project's own latest observed activity month is 2026-03, so the
-- 2026-01 cohort has 3 observable periods (0, 1, 2) and the 2026-02 cohort
-- has 2 (0, 1) — the model's own "only periods that have actually elapsed"
-- rule, not a fixed lookback window.
with expected(cohort_month, period_number, cohort_size, retained_count, retention_rate) as (
    values
        (timestamp '2026-01-01', 0, 3, 3, 1.0),
        (timestamp '2026-01-01', 1, 3, 1, 0.3333),
        (timestamp '2026-01-01', 2, 3, 2, 0.6667),
        (timestamp '2026-02-01', 0, 2, 2, 1.0),
        (timestamp '2026-02-01', 1, 2, 1, 0.5)
),
actual as (
    select cohort_month, period_number, cohort_size, retained_count, round(retention_rate, 4) as retention_rate
    from {{ ref('fact_cohort_retention') }}
    where project_id = 'proj_11'
)
select * from actual
except
select * from expected

union all

select * from expected
except
select * from actual
