-- Multi-touch conversion journey pathways (KAN-312):
-- Aggregates customer touchpoint sequence paths prior to conversion,
-- computing total touches, first and last touch channels, duration, and conversion revenue.

with touchpoints as (
    select
        organization_id,
        project_id,
        environment_id,
        event_id as touchpoint_event_id,
        entity_id as anon_id,
        coalesce({{ json_text_field('properties', "'channel'") }}, 'unknown') as channel_id,
        {{ json_text_field('properties', "'utm_campaign'") }} as campaign_id,
        occurred_at
    from {{ ref('events') }}
    where event_type = 'touchpoint'
),

conversions as (
    select
        organization_id,
        project_id,
        environment_id,
        event_id as conversion_event_id,
        entity_id as customer_id,
        coalesce({{ json_text_field('properties', "'event_name'") }}, event_type) as conversion_event,
        coalesce({{ growthos_try_cast(json_text_field('properties', "'revenue'"), 'numeric') }}, 0.0) as conversion_revenue,
        occurred_at as converted_at
    from {{ ref('events') }}
    where event_type != 'touchpoint'
),

candidate_touchpoints as (
    select
        c.organization_id,
        c.project_id,
        c.environment_id,
        c.conversion_event_id,
        c.customer_id,
        c.conversion_event,
        c.conversion_revenue,
        c.converted_at,
        t.touchpoint_event_id,
        t.channel_id,
        t.campaign_id,
        t.occurred_at as touched_at,
        row_number() over (
            partition by c.conversion_event_id
            order by t.occurred_at asc, t.touchpoint_event_id asc
        ) as touch_sequence_num,
        count(*) over (
            partition by c.conversion_event_id
        ) as total_touches,
        min(t.occurred_at) over (
            partition by c.conversion_event_id
        ) as first_touched_at,
        max(t.occurred_at) over (
            partition by c.conversion_event_id
        ) as last_touched_at
    from conversions c
    inner join {{ ref('bridge_identity') }} bi
        on bi.organization_id = c.organization_id
        and bi.project_id = c.project_id
        and bi.environment_id = c.environment_id
        and bi.customer_id = c.customer_id
    inner join touchpoints t
        on t.organization_id = bi.organization_id
        and t.project_id = bi.project_id
        and t.environment_id = bi.environment_id
        and t.anon_id = bi.anon_id
    where t.occurred_at <= c.converted_at
),

ordered_endpoints as (
    select
        conversion_event_id,
        max(case when touch_sequence_num = 1 then channel_id end) as first_touch_channel,
        max(case when touch_sequence_num = total_touches then channel_id end) as last_touch_channel
    from candidate_touchpoints
    group by conversion_event_id
),

aggregated as (
    select
        ct.organization_id,
        ct.project_id,
        ct.environment_id,
        ct.conversion_event_id,
        ct.customer_id,
        ct.conversion_event,
        ct.conversion_revenue,
        ct.converted_at,
        ct.total_touches,
        oe.first_touch_channel,
        oe.last_touch_channel,
        {{ growthos_datediff('ct.first_touched_at', 'ct.converted_at', 'hour') }} as duration_hours
    from candidate_touchpoints ct
    inner join ordered_endpoints oe
        on oe.conversion_event_id = ct.conversion_event_id
    group by
        ct.organization_id,
        ct.project_id,
        ct.environment_id,
        ct.conversion_event_id,
        ct.customer_id,
        ct.conversion_event,
        ct.conversion_revenue,
        ct.converted_at,
        ct.total_touches,
        oe.first_touch_channel,
        oe.last_touch_channel,
        ct.first_touched_at
)

select
    {{ surrogate_key(['organization_id', 'project_id', 'environment_id', 'conversion_event_id']) }} as path_key,
    organization_id,
    project_id,
    environment_id,
    conversion_event_id,
    customer_id,
    conversion_event,
    conversion_revenue,
    converted_at,
    total_touches,
    first_touch_channel,
    last_touch_channel,
    duration_hours
from aggregated
