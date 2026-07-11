-- A dbt test query returning zero rows passes. KAN-63 AC: "L28 histogram
-- matches fixture on synthetic events" — see `assert_fact_engagement_daily_
-- fixture_matches_expected.sql`'s own doc comment for the full `proj_12`
-- scenario. Each of the four customers has a deliberately distinct
-- days-active-in-the-28-day-window count (10/3/1/6), so the expected
-- histogram is the full 1..28 bucket spine with exactly those four buckets
-- at `customer_count = 1` and every other bucket at `0`.
with bucket_spine as (
    select gs.days_active_bucket
    from generate_series(1, 28) as gs(days_active_bucket)
),
expected_nonzero(days_active_bucket, customer_count) as (
    values (1, 1), (3, 1), (6, 1), (10, 1)
),
expected as (
    select
        timestamp '2026-04-28' as as_of_date,
        spine.days_active_bucket,
        coalesce(nz.customer_count, 0) as customer_count
    from bucket_spine spine
    left join expected_nonzero nz on nz.days_active_bucket = spine.days_active_bucket
),
actual as (
    select as_of_date, days_active_bucket, customer_count
    from {{ ref('fact_engagement_depth_histogram') }}
    where project_id = 'proj_12'
)
select * from actual
except
select * from expected

union all

select * from expected
except
select * from actual
