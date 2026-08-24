-- Flattens `survey_response` events' JSON `properties` into real columns
-- (KAN-82, plan `14 §Gap 1`) so the metrics compiler -- which only ever
-- emits bare column references against a mart's own flat columns, never
-- generic JSON extraction (see `metrics-compiler/compiler.ts`'s own
-- documented "denormalized mart" assumption) -- can filter/aggregate NPS
-- promoter/detractor counts. Same posture `fact_funnel_event` established
-- for its own `step` column. `survey_type` defaults to `'nps'` when a
-- payload omits it (every survey this codebase's own in-app SDK helper
-- sends today is NPS; a future CSAT survey would send its own explicit
-- `survey_type`, not rely on this fallback). `score` parses to null (not an
-- error) for a malformed/missing value, via the same tolerant
-- `growthos_try_cast` every other mart's own numeric column uses.
--
-- `plan_interval`/`channel_id`/`cohort_month` are the "by segment/plan/
-- channel" breakdown axes the AC names -- the same join set
-- `fact_cancellation_reason` (KAN-84) established, reused verbatim here (see
-- that model's own doc comment for the full reasoning: "current subscription"
-- is the customer's own most-recently-started `dim_subscription` row,
-- `channel_id` is `fact_attribution`'s `last_touch` credit for this exact
-- survey-response event, and `cohort_month` is the calendar month of the
-- customer's first non-touchpoint event). Every join is a `left join`: a
-- response with no matching subscription/attribution/cohort row still gets
-- its own row, never dropped for a missing dimension.

with responses as (
    select
        event_id,
        organization_id,
        project_id,
        environment_id,
        entity_id as customer_id,
        coalesce({{ json_text_field('properties', "'survey_type'") }}, 'nps') as survey_type,
        {{ growthos_try_cast(json_text_field('properties', "'score'"), dbt.type_float()) }} as score,
        occurred_at as ts
    from {{ ref('events') }}
    where event_type = 'survey_response'
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
    {{ surrogate_key(['r.organization_id', 'r.project_id', 'r.environment_id', 'r.event_id']) }} as survey_response_key,
    r.organization_id,
    r.project_id,
    r.environment_id,
    r.customer_id,
    r.survey_type,
    r.score,
    cs.plan_interval,
    ca.channel_id,
    coh.cohort_month,
    r.ts
from responses r
left join current_subscription cs
    on cs.organization_id = r.organization_id
    and cs.project_id = r.project_id
    and cs.environment_id = r.environment_id
    and cs.customer_id = r.customer_id
left join channel_attribution ca
    on ca.organization_id = r.organization_id
    and ca.project_id = r.project_id
    and ca.environment_id = r.environment_id
    and ca.conversion_event_id = r.event_id
left join cohort_assignment coh
    on coh.organization_id = r.organization_id
    and coh.project_id = r.project_id
    and coh.environment_id = r.environment_id
    and coh.customer_id = r.customer_id
