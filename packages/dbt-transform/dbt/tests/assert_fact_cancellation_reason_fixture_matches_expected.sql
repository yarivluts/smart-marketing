{{ config(enabled=(target.type == 'duckdb')) }}
-- DuckDB-only (KAN-18): asserts exact hand-computed values against the
-- fixture seed's synthetic `proj_15` churn-reason journey, which only
-- exists in the DuckDB dev target.
--
-- `cust_ch1` touches via paid_search on 2026-07-01, signs up minutes later
-- declaring `anon_id`, and has an active monthly `stripe_subscription`
-- starting the same day -- so its cancellation a month later must resolve
-- plan_interval=month (from `dim_subscription`), channel_id=paid_search
-- (from `fact_attribution`'s last_touch model -- there's only one
-- touchpoint, so first- and last-touch agree), and cohort_month=2026-07-01
-- (the calendar month of its own first customer-side event, the signup).
--
-- `cust_ch2` cancels with no prior touchpoint and no subscription ever
-- landed for it -- proving the left joins never drop a cancellation row for
-- a missing dimension: plan_interval is null (no `dim_subscription` join
-- match), channel_id is `fact_attribution`'s own `unattributed` fallback
-- (every conversion gets one row per model even with zero candidate
-- touchpoints — see that model's own doc comment), and its own cancellation
-- event (the only customer-side event it ever has) seeds its own
-- cohort_month.
with expected(customer_id, reason_code, plan_interval, channel_id, cohort_month) as (
    values
        ('cust_ch1', 'too_expensive', 'month', 'paid_search', date '2026-07-01'),
        ('cust_ch2', 'not_using_enough', cast(null as varchar), 'unattributed', date '2026-08-01')
),
actual as (
    select customer_id, reason_code, plan_interval, channel_id, cohort_month
    from {{ ref('fact_cancellation_reason') }}
    where project_id = 'proj_15'
)
select * from actual
except
select * from expected

union all

select * from expected
except
select * from actual
