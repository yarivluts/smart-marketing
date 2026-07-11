-- A dbt test query returning zero rows passes. KAN-63 AC: "L28 histogram
-- matches fixture on synthetic events" — this half covers `fact_engagement_
-- daily`. `seeds/raw_records.csv` carries a hand-built 28-day engagement
-- window under `proj_12` (2026-04-01..2026-04-28), isolated from every other
-- project's own exact-row-count-asserting fixture test:
--
--   cust_c1 active every 3rd day (04-01, 04-04, ..., 04-28 — 10 days).
--   cust_c2 active 04-02, 04-15, 04-28 (3 days).
--   cust_c3 active 04-01 only (1 day).
--   cust_c4 active 04-01..04-05 and 04-28 (6 days).
--
-- The project's own latest observed activity date is 2026-04-28, so every
-- activity date's own trailing-28-day window (`date - 27`) reaches back to
-- (at earliest) 2026-04-01 — the fixture's own first date — meaning
-- `active_customers_l_n` for any date in this fixture is simply "every
-- distinct customer active on or before that date": 3 on 04-01 (before
-- cust_c2 has appeared), 4 from 04-02 onward.
with expected(activity_date, dau, active_customers_l_n, dau_mau_ratio) as (
    values
        (timestamp '2026-04-01', 3, 3, 1.0),
        (timestamp '2026-04-02', 2, 4, 0.5),
        (timestamp '2026-04-03', 1, 4, 0.25),
        (timestamp '2026-04-04', 2, 4, 0.5),
        (timestamp '2026-04-05', 1, 4, 0.25),
        (timestamp '2026-04-07', 1, 4, 0.25),
        (timestamp '2026-04-10', 1, 4, 0.25),
        (timestamp '2026-04-13', 1, 4, 0.25),
        (timestamp '2026-04-15', 1, 4, 0.25),
        (timestamp '2026-04-16', 1, 4, 0.25),
        (timestamp '2026-04-19', 1, 4, 0.25),
        (timestamp '2026-04-22', 1, 4, 0.25),
        (timestamp '2026-04-25', 1, 4, 0.25),
        (timestamp '2026-04-28', 3, 4, 0.75)
),
actual as (
    select activity_date, dau, active_customers_l_n, round(dau_mau_ratio, 4) as dau_mau_ratio
    from {{ ref('fact_engagement_daily') }}
    where project_id = 'proj_12'
)
select * from actual
except
select * from expected

union all

select * from expected
except
select * from actual
