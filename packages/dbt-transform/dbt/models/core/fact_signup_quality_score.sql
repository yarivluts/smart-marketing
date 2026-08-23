-- Intent/quality scoring (KAN-83, plan `14 §Gap 4`): one row per landed
-- `onboarding_survey` event, flattening its structured `company_size`/
-- `budget_range`/`urgency`/`use_case` answers and the `quality_score`
-- `computeSignupQualityScore` (`@growthos/shared`) already computed
-- *before* the event was ever sent (see that schema's own doc comment for
-- why the score travels as a landed field rather than being recomputed
-- here) into real columns, and joining each scored signup back to its
-- last-touch marketing channel (`fact_attribution`) and signup cohort month
-- -- the same join pattern `fact_cancellation_reason` (KAN-84) established,
-- reused verbatim here (see that model's own doc comment for the full
-- reasoning on why every join below is a `left join`). Feeds the Intent &
-- Quality pack's `avg_signup_quality_score`/`quality_adjusted_cost_per_signup`/
-- `quality_adjusted_cac` metrics (`quality-score-pack/metrics.ts`).
--
-- `is_paying_customer` is this model's one addition beyond
-- `fact_cancellation_reason`'s own join set: a `true`/`false` string flag
-- (not a native boolean -- the metrics compiler's own filter values are
-- always strings, see `MetricFilterDef`) marking whether the customer has
-- ever landed a `first_charge`-type row in `fact_revenue_event` -- lets
-- `quality_adjusted_cac` weight quality by *paying* signups specifically
-- (the acronym's own literal meaning), distinct from
-- `quality_adjusted_cost_per_signup`, which weights every scored signup
-- regardless of whether it ever converted. A customer who cancels and later
-- resubscribes, or who has more than one `first_charge` row for any reason,
-- still only ever contributes `true` once here (a plain existence check,
-- not a count).

with signups as (
    select
        event_id,
        organization_id,
        project_id,
        environment_id,
        entity_id as customer_id,
        {{ json_text_field('properties', "'company_size'") }} as company_size,
        {{ json_text_field('properties', "'budget_range'") }} as budget_range,
        {{ json_text_field('properties', "'urgency'") }} as urgency,
        {{ json_text_field('properties', "'use_case'") }} as use_case,
        {{ growthos_try_cast(json_text_field('properties', "'quality_score'"), dbt.type_float()) }} as quality_score,
        occurred_at as ts
    from {{ ref('events') }}
    where event_type = 'onboarding_survey'
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

channel_attribution as (
    select organization_id, project_id, environment_id, conversion_event_id, channel_id
    from {{ ref('fact_attribution') }}
    where model = 'last_touch'
),

paying_customers as (
    select distinct organization_id, project_id, environment_id, customer_id
    from {{ ref('fact_revenue_event') }}
    where type = 'first_charge'
)

select
    {{ surrogate_key(['s.organization_id', 's.project_id', 's.environment_id', 's.event_id']) }} as signup_quality_score_key,
    s.organization_id,
    s.project_id,
    s.environment_id,
    s.customer_id,
    s.company_size,
    s.budget_range,
    s.urgency,
    s.use_case,
    s.quality_score,
    ca.channel_id,
    coh.cohort_month,
    case when pc.customer_id is not null then 'true' else 'false' end as is_paying_customer,
    s.ts
from signups s
left join channel_attribution ca
    on ca.organization_id = s.organization_id
    and ca.project_id = s.project_id
    and ca.environment_id = s.environment_id
    and ca.conversion_event_id = s.event_id
left join cohort_assignment coh
    on coh.organization_id = s.organization_id
    and coh.project_id = s.project_id
    and coh.environment_id = s.environment_id
    and coh.customer_id = s.customer_id
left join paying_customers pc
    on pc.organization_id = s.organization_id
    and pc.project_id = s.project_id
    and pc.environment_id = s.environment_id
    and pc.customer_id = s.customer_id
