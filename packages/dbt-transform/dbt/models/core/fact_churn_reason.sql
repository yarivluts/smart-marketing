-- Churn-reason fact (plan `14 §Gap 10`, KAN-84): one row per landed
-- `churn_reason` event — captured from a cancel flow/exit survey via the
-- tracking SDK's `submitChurnReason` (same posture `submitNpsSurvey`/KAN-82
-- established for `survey_response`) — carrying the structured `category`
-- and free-text `reason_text` straight off the event's own properties,
-- joined to:
--
--   - `channel_id`/`campaign_id`: the customer's own first-touch attributed
--     channel (`fact_attribution`, model = 'first_touch'). A `churn_reason`
--     event is itself just another non-touchpoint "conversion" candidate to
--     that model (see `fact_attribution`'s own doc comment — every `events`
--     row whose `event_type` isn't `touchpoint` qualifies), so this reuses
--     the existing attribution rows rather than re-deriving touchpoint
--     linkage here. `unknown` when the customer has no resolvable
--     touchpoint at all, matching `fact_attribution`'s own placeholder.
--   - `plan`: the customer's most-recently-started subscription's own
--     billing interval (`dim_subscription.plan_interval`), the exact same
--     "plan" dimension vocabulary `fact_revenue_event.plan` already
--     established — no richer plan-tier field exists in this connector's
--     minimal Stripe shape yet (`mapSubscriptionToEntityRecord`'s own doc
--     comment). `null` for a customer with no landed subscription.
--   - `cohort_month`: the calendar month of the customer's own first
--     non-touchpoint event — the same per-customer cohort assignment
--     `fact_cohort_retention`'s own `cohort_assignment` CTE computes.
--
-- Together these are the "breakdown joined to plan/channel/cohort" report
-- the gap doc calls for, surfaced through the ordinary metrics/Boards
-- machinery (the Churn Reasons pack's `churn_events` aggregation metric
-- declares all four as breakdown dimensions) rather than a bespoke report
-- page. The AI-clustered *theme* digest (blending `category` with
-- free-text inference for anything `other`) is a separate, Firestore-side
-- read (`getChurnReasonThemeDigestForProject`) — the metrics compiler only
-- ever emits bare column references against a mart's own flat columns, so
-- this mart's own `category` column is the structured half of "structured +
-- free text", not the clustered one.

with churn_events as (
    select
        organization_id,
        project_id,
        environment_id,
        event_id,
        entity_id as customer_id,
        {{ json_text_field('properties', "'category'") }} as category,
        {{ json_text_field('properties', "'reason_text'") }} as reason_text,
        occurred_at
    from {{ ref('events') }}
    where event_type = 'churn_reason'
),

customer_events as (
    select organization_id, project_id, environment_id, entity_id as customer_id, occurred_at
    from {{ ref('events') }}
    where event_type != 'touchpoint'
),

cohort_assignment as (
    select
        organization_id,
        project_id,
        environment_id,
        customer_id,
        {{ dbt.date_trunc('month', 'min(occurred_at)') }} as cohort_month
    from customer_events
    group by 1, 2, 3, 4
),

-- The customer's most-recently-started subscription as of its own
-- `started_at` — a customer with more than one subscription over time
-- (upgrade/downgrade/resubscribe) is represented by the latest one, the
-- same "current state" posture `dim_subscription` itself takes for a single
-- subscription's own snapshot history.
latest_subscription as (
    select *
    from (
        select
            organization_id,
            project_id,
            environment_id,
            customer_id,
            plan_interval,
            row_number() over (
                partition by organization_id, project_id, environment_id, customer_id
                order by started_at desc nulls last, subscription_id asc
            ) as rn
        from {{ ref('dim_subscription') }}
    ) ranked
    where rn = 1
)

select
    {{ surrogate_key(['ce.organization_id', 'ce.project_id', 'ce.environment_id', 'ce.event_id']) }} as churn_reason_key,
    ce.organization_id,
    ce.project_id,
    ce.environment_id,
    ce.customer_id,
    ce.category,
    ce.reason_text,
    coalesce(fa.channel_id, 'unknown') as channel_id,
    fa.campaign_id,
    ls.plan_interval as plan,
    ca.cohort_month,
    ce.occurred_at as ts
from churn_events ce
left join {{ ref('fact_attribution') }} fa
    on fa.organization_id = ce.organization_id
    and fa.project_id = ce.project_id
    and fa.environment_id = ce.environment_id
    and fa.conversion_event_id = ce.event_id
    and fa.model = 'first_touch'
left join latest_subscription ls
    on ls.organization_id = ce.organization_id
    and ls.project_id = ce.project_id
    and ls.environment_id = ce.environment_id
    and ls.customer_id = ce.customer_id
left join cohort_assignment ca
    on ca.organization_id = ce.organization_id
    and ca.project_id = ce.project_id
    and ca.environment_id = ce.environment_id
    and ca.customer_id = ce.customer_id
