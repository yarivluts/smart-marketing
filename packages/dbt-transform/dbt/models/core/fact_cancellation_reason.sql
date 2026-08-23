-- Churn-reason capture (KAN-84, plan `14 §Gap 10`): one row per landed
-- `cancellation_reason` event, flattening its structured `reason_code` +
-- free-text `comment` into real columns and joining each cancellation back
-- to the customer's current subscription plan (`dim_subscription`),
-- crediting marketing channel (`fact_attribution`, `last_touch` model --
-- this event is itself a "conversion" `fact_attribution` already resolves,
-- since its own `conversions` CTE selects every non-`touchpoint` event), and
-- the customer's signup cohort month -- so a human can answer "reason X is
-- 3x more common in accounts from channel Y" via the metrics compiler's own
-- dimension-breakdown support (bare `GROUP BY` against this mart's own flat
-- columns), the same posture `fact_survey_response` established for its own
-- JSON-flattening. Feeds the Churn Reason pack's `cancellations_total`
-- metric (`cancellations_total`'s own `dimensions`: `reason_code`,
-- `plan_interval`, `channel_id`, `cohort_month`).
--
-- "Current subscription" is the customer's own most-recently-started
-- subscription in `dim_subscription` -- same posture MRR-style metrics
-- establish elsewhere for "a customer's plan" with no `subscription_id`
-- correlation on the event payload. A customer with more than one
-- subscription over time (e.g. resubscribed after an earlier cancellation)
-- is deliberately joined to whichever one this model itself considers
-- "current", not necessarily the exact subscription this cancellation
-- reason was captured for.
--
-- `cohort_month` duplicates `fact_cohort_retention`'s own `cohort_assignment`
-- CTE (calendar month of a customer's first non-touchpoint event) rather
-- than referencing it, since that model only exposes cohort-level
-- aggregated rows (no per-customer grain to join against) -- a future
-- `dim_customer_cohort` model could de-duplicate this, not attempted here.
--
-- Every join is a `left join`: a cancellation with no matching subscription/
-- attribution/cohort row still gets its own row (structured `reason_code`
-- and free-text `comment` are never lost to a missing dimension). In
-- practice `channel_id`/`cohort_month` are close to always populated even
-- for a customer with zero marketing history: `fact_attribution` itself
-- emits an `unattributed` row for every conversion with no candidate
-- touchpoint (rather than no row at all), and `cohort_assignment` below
-- always has at least the cancellation event itself to seed a cohort_month
-- from. Only `plan_interval` can be genuinely null here -- a customer who
-- cancels with no `stripe_subscription` ever landed for them.

with cancellations as (
    select
        event_id,
        organization_id,
        project_id,
        environment_id,
        entity_id as customer_id,
        {{ json_text_field('properties', "'reason_code'") }} as reason_code,
        {{ json_text_field('properties', "'comment'") }} as comment,
        occurred_at as ts
    from {{ ref('events') }}
    where event_type = 'cancellation_reason'
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

current_subscription as (
    select organization_id, project_id, environment_id, customer_id, plan_interval
    from (
        select
            organization_id,
            project_id,
            environment_id,
            customer_id,
            plan_interval,
            row_number() over (
                partition by organization_id, project_id, environment_id, customer_id
                order by started_at desc, subscription_id desc
            ) as rn
        from {{ ref('dim_subscription') }}
    ) ranked
    where rn = 1
),

channel_attribution as (
    select organization_id, project_id, environment_id, conversion_event_id, channel_id
    from {{ ref('fact_attribution') }}
    where model = 'last_touch'
)

select
    {{ surrogate_key(['c.organization_id', 'c.project_id', 'c.environment_id', 'c.event_id']) }} as cancellation_reason_key,
    c.organization_id,
    c.project_id,
    c.environment_id,
    c.customer_id,
    c.reason_code,
    c.comment,
    cs.plan_interval,
    ca.channel_id,
    coh.cohort_month,
    c.ts
from cancellations c
left join current_subscription cs
    on cs.organization_id = c.organization_id
    and cs.project_id = c.project_id
    and cs.environment_id = c.environment_id
    and cs.customer_id = c.customer_id
left join channel_attribution ca
    on ca.organization_id = c.organization_id
    and ca.project_id = c.project_id
    and ca.environment_id = c.environment_id
    and ca.conversion_event_id = c.event_id
left join cohort_assignment coh
    on coh.organization_id = c.organization_id
    and coh.project_id = c.project_id
    and coh.environment_id = c.environment_id
    and coh.customer_id = c.customer_id
