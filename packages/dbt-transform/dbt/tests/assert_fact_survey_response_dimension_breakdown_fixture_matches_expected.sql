{{ config(enabled=(target.type == 'duckdb')) }}
-- DuckDB-only (KAN-18): asserts exact hand-computed values against the
-- fixture seed's synthetic `proj_19` NPS journey, which only exists in the
-- DuckDB dev target. Isolated from `proj_14`'s own exact-category-count-
-- asserting fixture test (`assert_fact_survey_response_fixture_matches_
-- expected.sql`) since this fixture is purpose-built to exercise the
-- `plan_interval`/`channel_id`/`cohort_month` breakdown columns instead.
--
-- `cust_nps1` touches via paid_social on 2026-09-01, signs up minutes later
-- declaring `anon_id`, and has an active annual `stripe_subscription`
-- starting the same day -- so its NPS response a couple weeks later must
-- resolve plan_interval=year (from `dim_subscription`), channel_id=
-- paid_social (from `fact_attribution`'s last_touch model -- there's only
-- one touchpoint, so first- and last-touch agree), and
-- cohort_month=2026-09-01 (the calendar month of its own first customer-side
-- event, the signup).
--
-- `cust_nps2` responds with no prior touchpoint and no subscription ever
-- landed for it -- proving the left joins never drop a response row for a
-- missing dimension: plan_interval is null (no `dim_subscription` join
-- match), channel_id is `fact_attribution`'s own `unattributed` fallback
-- (every conversion gets one row per model even with zero candidate
-- touchpoints — see that model's own doc comment), and its own response
-- event (the only customer-side event it ever has) seeds its own
-- cohort_month.
with expected(customer_id, plan_interval, channel_id, cohort_month) as (
    values
        ('cust_nps1', 'year', 'paid_social', date '2026-09-01'),
        ('cust_nps2', cast(null as varchar), 'unattributed', date '2026-10-01')
),
actual as (
    select customer_id, plan_interval, channel_id, cohort_month
    from {{ ref('fact_survey_response') }}
    where project_id = 'proj_19'
)
select * from actual
except
select * from expected

union all

select * from expected
except
select * from actual
