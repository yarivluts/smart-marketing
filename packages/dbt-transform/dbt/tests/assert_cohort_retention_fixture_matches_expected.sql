-- A dbt test query returning zero rows passes. KAN-62 AC: "Cohort matrix
-- matches hand-computed fixture." `seeds/raw_records.csv` carries a
-- hand-built multi-month signup cohort under `proj_11` (see that seed's own
-- description):
--
--   cust_c1 signs up 2026-01-10, is `activated` the same month (period 0),
--   then `purchase`s 2026-03-20 -- two calendar months after its own
--   January cohort month (period 2).
--   cust_c2 signs up 2026-01-12, no further event -- drags the January
--   cohort's `activated`/`purchase` retention_rate down to 1-of-2 (0.5)
--   each, the concrete proof `cohort_size` is the *cohort's* size, not the
--   converted count itself.
--   cust_c3 signs up 2026-02-05 (a second, later cohort month) and is
--   `activated` the same month (period 0, retention_rate 1.0) -- proof two
--   different cohort months don't bleed into each other's `cohort_size`.
--
-- Expressed as an EXCEPT diff against the expected table rather than one
-- assertion per row, so any unexpected row (missing, extra, or with a wrong
-- field) fails the test.
with expected(cohort_month, conversion_event, period_index, cohort_size, converted_customers, retention_rate) as (
    values
        (timestamp '2026-01-01', 'activated', 0, 2, 1, 0.5),
        (timestamp '2026-01-01', 'purchase', 2, 2, 1, 0.5),
        (timestamp '2026-02-01', 'activated', 0, 1, 1, 1.0)
),
actual as (
    select cohort_month, conversion_event, period_index, cohort_size, converted_customers, retention_rate
    from {{ ref('cohort_retention') }}
    where project_id = 'proj_11'
)
select * from actual
except
select * from expected

union all

select * from expected
except
select * from actual
