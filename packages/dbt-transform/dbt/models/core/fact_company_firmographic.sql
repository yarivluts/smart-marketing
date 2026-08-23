-- Firmographic enrichment (KAN-87, plan `14 §Gap 11`): one row per landed
-- `company_firmographic` event, flattening its self-reported
-- `company_name`/`company_domain`/`employee_count_range`/`region` and its
-- computed `industry` (`classifyCompanyIndustry`, `@growthos/shared` --
-- computed client-side before the event is ever sent, same "compute
-- before send, flatten on land" posture `fact_signup_quality_score`/
-- `fact_cancellation_reason` establish for their own derived fields) into
-- real columns, joined to the customer's current subscription MRR
-- (`dim_subscription`) -- the "$" half of the AC's "composition dashboards
-- (# vs $)": a human can answer "what % of *customers* are enterprise vs.
-- what % of *revenue* comes from enterprise" via the Firmographic pack's
-- `firmographic_profiles_total` (count) and `firmographic_mrr_total` (sum)
-- metrics sharing the same `industry`/`employee_count_range`/`region`
-- dimensions.
--
-- "Current subscription" is the customer's own most-recently-started
-- subscription in `dim_subscription`, the exact same ranking
-- `fact_cancellation_reason`'s own `current_subscription` CTE uses for "a
-- customer's plan" with no `subscription_id` correlation on the event
-- payload.
--
-- `left join`: a firmographic profile with no matching subscription still
-- gets its own row (`mrr` simply comes back null, so it contributes to the
-- "#" count composition but not the "$" one) -- e.g. a self-reported
-- profile captured before the customer's first paid subscription starts.

with profiles as (
    select
        event_id,
        organization_id,
        project_id,
        environment_id,
        entity_id as customer_id,
        {{ json_text_field('properties', "'company_name'") }} as company_name,
        {{ json_text_field('properties', "'company_domain'") }} as company_domain,
        {{ json_text_field('properties', "'employee_count_range'") }} as employee_count_range,
        {{ json_text_field('properties', "'region'") }} as region,
        {{ json_text_field('properties', "'industry'") }} as industry,
        occurred_at as ts
    from {{ ref('events') }}
    where event_type = 'company_firmographic'
),

current_subscription as (
    select organization_id, project_id, environment_id, customer_id, mrr
    from (
        select
            organization_id,
            project_id,
            environment_id,
            customer_id,
            mrr,
            row_number() over (
                partition by organization_id, project_id, environment_id, customer_id
                order by started_at desc, subscription_id desc
            ) as rn
        from {{ ref('dim_subscription') }}
    ) ranked
    where rn = 1
)

select
    {{ surrogate_key(['p.organization_id', 'p.project_id', 'p.environment_id', 'p.event_id']) }} as company_firmographic_key,
    p.organization_id,
    p.project_id,
    p.environment_id,
    p.customer_id,
    p.company_name,
    p.company_domain,
    p.employee_count_range,
    p.region,
    p.industry,
    cs.mrr,
    p.ts
from profiles p
left join current_subscription cs
    on cs.organization_id = p.organization_id
    and cs.project_id = p.project_id
    and cs.environment_id = p.environment_id
    and cs.customer_id = p.customer_id
