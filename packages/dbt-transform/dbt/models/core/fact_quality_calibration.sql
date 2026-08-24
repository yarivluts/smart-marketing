-- Predicted-vs-actual calibration (KAN-86, E18.x, plan `14 §Gap 12`'s own
-- "predicted-vs-actual calibration views" AC bullet, the one remaining
-- undelivered piece flagged in that story's own TASKS.md row): joins each
-- customer's *predicted* quality tier (`fact_signup_quality_score`, KAN-83)
-- against their *actual* revenue outcome (`fact_customer_payback`, KAN-86's
-- own fixed-window payback mart) so a human can see whether a high-scored
-- signup actually paid more than a low-scored one -- the calibration check
-- the score's own existence implies but nothing yet verifies.
--
-- `quality_tier` reuses `signupQualityScoreTier`'s exact thresholds
-- (`packages/shared/src/onboarding-survey/quality-score.ts`: low < 40,
-- medium < 70, high >= 70) so this mart's tiers always agree with the app's
-- own vocabulary -- SQL can't call that TS function directly, so the
-- boundaries are duplicated here deliberately (same "duplicated by
-- necessity, kept in sync by a fixture test pinning both" posture the
-- overall dbt/TS split already has no way around).
--
-- Grain: one row per (organization_id, project_id, environment_id,
-- customer_id) -- deliberately customer-grain, NOT
-- `fact_signup_quality_score`'s own event-grain: `fact_customer_payback`'s
-- `collected_revenue_*d` columns are a customer-level total (all of a
-- customer's succeeded charges within the window), not per-event, so
-- joining it against more than one scored-event row per customer would
-- double (or N-times) count that same revenue total once per extra event
-- -- inflating `quality_calibration_collected_revenue_40d`'s sum-based
-- aggregation even though `quality_calibration_signups`
-- (`count_distinct customer_id`) still correctly reports one signup. A
-- customer with more than one onboarding_survey event (deliberately
-- possible, per `fact_signup_quality_score`'s own doc comment) is
-- deduplicated down to their single latest-scored event via
-- `row_number() over (... order by ts desc)` -- the exact "current =
-- latest-landed row" convention `entities.sql` already establishes for its
-- own one-row-per-entity dedup.
--
-- Left-joined to payback, not inner: a scored signup who never converted to
-- any revenue still needs a row (`collected_revenue_40d` coalesced to 0),
-- the same "every entity gets a row, even with nothing to join" posture
-- `fact_customer_payback`'s own join to `fact_revenue_event` already
-- establishes one level up.

with latest_scored_signup as (
    select
        *,
        row_number() over (
            partition by organization_id, project_id, environment_id, customer_id
            order by ts desc
        ) as recency_rank
    from {{ ref('fact_signup_quality_score') }}
    where quality_score is not null
),

calibration as (
    select
        q.organization_id,
        q.project_id,
        q.environment_id,
        q.customer_id,
        q.channel_id,
        q.cohort_month,
        q.quality_score,
        case
            when q.quality_score < 40 then 'low'
            when q.quality_score < 70 then 'medium'
            else 'high'
        end as quality_tier,
        q.is_paying_customer,
        coalesce(p.collected_revenue_7d, 0) as collected_revenue_7d,
        coalesce(p.collected_revenue_40d, 0) as collected_revenue_40d,
        q.ts
    from latest_scored_signup q
    left join {{ ref('fact_customer_payback') }} p
        on p.organization_id = q.organization_id
        and p.project_id = q.project_id
        and p.environment_id = q.environment_id
        and p.customer_id = q.customer_id
    where q.recency_rank = 1
)

select
    {{ surrogate_key(['organization_id', 'project_id', 'environment_id', 'customer_id']) }} as quality_calibration_key,
    organization_id,
    project_id,
    environment_id,
    customer_id,
    channel_id,
    cohort_month,
    quality_score,
    quality_tier,
    is_paying_customer,
    collected_revenue_7d,
    collected_revenue_40d,
    ts
from calibration
