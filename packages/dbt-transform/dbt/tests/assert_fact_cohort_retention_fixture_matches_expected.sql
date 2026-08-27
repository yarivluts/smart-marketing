-- DuckDB-only (KAN-18): asserts exact hand-computed values against the
-- fixture seed's synthetic projects, which only exist in the DuckDB dev
-- target -- against a real warehouse with real data the assertion is
-- meaningless. It also uses DuckDB's `with cte(cols) as (values ...)`
-- form, which BigQuery rejects outright (proved by the first real
-- `dbt build --target prod`, 2026-08-19). The portable invariant tests
-- (ratio/bucket ranges, uniqueness, not-null) stay enabled on both.
{{ config(enabled=(target.type == 'duckdb')) }}
-- A dbt test query returning zero rows passes. KAN-62 AC: "Cohort matrix
-- matches hand-computed fixture." Filters to `conversion_event = '__any__'`
-- (KAN-118's parameterized-retention row alongside the original one) so
-- this keeps asserting the exact same "any activity counts" values it
-- always has; `assert_fact_cohort_retention_conversion_event_fixture_matches_expected.sql`
-- covers a specific `conversion_event` value instead.
--
-- `seeds/raw_records.csv` carries a hand-built two-cohort scenario under
-- `proj_11`, isolated from every other project's own exact-count-asserting
-- fixture test -- but NOT isolated from `proj_11`'s own other fixtures
-- (`assert_fact_funnel_step_fixture_matches_expected.sql`,
-- `assert_fact_landing_page_performance_fixture_matches_expected.sql`,
-- `assert_fact_funnel_event_fixture_matches_expected.sql` all share the
-- same project's `events`, a deliberate "one shared events fixture, several
-- independent models reading it" convention per that funnel-step test's own
-- comment). The landing-page/funnel-event fixtures' own `2026-05-01` batch
-- re-fires `signup` for `cust_a1`/`cust_a2`/`cust_b1` -- customers this
-- cohort fixture already covers -- which genuinely extends both cohorts'
-- observable periods (this model's own "only periods that have actually
-- elapsed" rule keys off the *project's* latest activity month, not one
-- fixture's own slice of it). The values below account for that shared
-- activity rather than only the Jan-Mar slice this cohort scenario itself
-- introduces:
--
--   Cohort 2026-01 (3 customers): cust_a1 signs up 01-05, comes back
--   02-10, 03-15 and (the shared fixture's own re-fire) 05-01; cust_a2
--   signs up 01-10 and returns only via the shared fixture's 05-01 re-fire;
--   cust_a3 signs up 01-20 and comes back only 03-05 (retained at period 2
--   despite skipping period 1 -- "active in period N", not "active every
--   period up to N").
--
--   Cohort 2026-02 (2 customers): cust_b1 signs up 02-03, comes back 03-01
--   and (the shared fixture's own re-fire) 05-01; cust_b2 signs up 02-15
--   and never returns.
--
-- The project's own latest observed activity month is 2026-05 (from the
-- shared fixture's own re-fires), so the 2026-01 cohort has 5 observable
-- periods (0-4) and the 2026-02 cohort has 4 (0-3).
with expected(cohort_month, period_number, cohort_size, retained_count, retention_rate) as (
    values
        (timestamp '2026-01-01', 0, 3, 3, 1.0),
        (timestamp '2026-01-01', 1, 3, 1, 0.3333),
        (timestamp '2026-01-01', 2, 3, 2, 0.6667),
        (timestamp '2026-01-01', 3, 3, 0, 0.0),
        (timestamp '2026-01-01', 4, 3, 2, 0.6667),
        (timestamp '2026-02-01', 0, 2, 2, 1.0),
        (timestamp '2026-02-01', 1, 2, 1, 0.5),
        (timestamp '2026-02-01', 2, 2, 0, 0.0),
        (timestamp '2026-02-01', 3, 2, 1, 0.5)
),
actual as (
    select cohort_month, period_number, cohort_size, retained_count, round(retention_rate, 4) as retention_rate
    from {{ ref('fact_cohort_retention') }}
    where project_id = 'proj_11' and conversion_event = '__any__'
)
(select * from actual
except
select * from expected)

union all

(select * from expected
except
select * from actual)
