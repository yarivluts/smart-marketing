{{ config(enabled=(target.type == 'duckdb')) }}
-- DuckDB-only (KAN-18): asserts exact hand-computed values against the
-- existing `proj_16` signup-quality-score fixture seed (KAN-83's own
-- `assert_fact_signup_quality_score_fixture_matches_expected.sql` fixture) --
-- no new seed rows needed, since `cust_qs1`'s own succeeded Stripe charge
-- already doubles as `fact_customer_payback`'s revenue input for the exact
-- same customer.
--
-- `cust_qs1`: quality_score=97 -> quality_tier='high'; its $200 succeeded
-- charge lands 4 days after acquisition (the onboarding_survey event
-- itself, its first customer-side event), well within every payback
-- window, so collected_revenue_40d=200 and is_paying_customer='true' --
-- a high-scored signup that actually converted, the calibration view's own
-- "this is working as intended" case.
--
-- `cust_qs2`: quality_score=12 -> quality_tier='low'; no charge at all, so
-- collected_revenue_40d=0 (the left join still produces a row, coalesced to
-- 0 rather than null) and is_paying_customer='false'.
with expected(customer_id, quality_score, quality_tier, is_paying_customer, collected_revenue_40d) as (
    values
        ('cust_qs1', 97.0, 'high', 'true', 200.0),
        ('cust_qs2', 12.0, 'low', 'false', 0.0)
),
actual as (
    select customer_id, quality_score, quality_tier, is_paying_customer, collected_revenue_40d
    from {{ ref('fact_quality_calibration') }}
    where project_id = 'proj_16'
)
select * from actual
except
select * from expected

union all

select * from expected
except
select * from actual
