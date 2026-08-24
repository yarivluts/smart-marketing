{{ config(enabled=(target.type == 'duckdb')) }}
-- DuckDB-only (KAN-18): asserts exact hand-computed values against the
-- fixture seed's synthetic `proj_16` signup-quality-score journey, which
-- only exists in the DuckDB dev target.
--
-- `cust_qs1` touches via paid_social on 2026-09-01, submits the onboarding
-- survey minutes later declaring `anon_id` (company_size=201-1000,
-- budget_range=50k_plus, urgency=immediately -> quality_score=97, computed
-- by `computeSignupQualityScore` the same way `submitOnboardingSurvey`
-- would have before sending), and lands a succeeded Stripe charge four days
-- later -- so its row must resolve channel_id=paid_social (from
-- `fact_attribution`'s last_touch model), cohort_month=2026-09-01 (the
-- calendar month of its own first customer-side event, the survey itself),
-- and is_paying_customer='true' (a landed `first_charge` row exists).
--
-- `cust_qs2` submits the survey with no prior touchpoint, no `anon_id`, and
-- no Stripe charge -- proving the left joins never drop a scored signup for
-- a missing dimension: channel_id is `fact_attribution`'s own
-- `unattributed` fallback, cohort_month is seeded from its own survey event
-- (2026-10-01), and is_paying_customer='false' (no `first_charge` row).
with expected(customer_id, quality_score, channel_id, cohort_month, is_paying_customer) as (
    values
        ('cust_qs1', 97.0, 'paid_social', date '2026-09-01', 'true'),
        ('cust_qs2', 12.0, 'unattributed', date '2026-10-01', 'false')
),
actual as (
    select customer_id, quality_score, channel_id, cohort_month, is_paying_customer
    from {{ ref('fact_signup_quality_score') }}
    where project_id = 'proj_16'
)
select * from actual
except
select * from expected

union all

select * from expected
except
select * from actual
