-- Markov Chain state-to-state channel transitions (KAN-312):
-- Computes the empirical transition counts and probabilities between
-- consecutive touchpoint channels in customer conversion journeys.

with touchpoints as (
    select
        organization_id,
        project_id,
        environment_id,
        event_id as touchpoint_event_id,
        entity_id as anon_id,
        coalesce({{ json_text_field('properties', "'channel'") }}, 'unknown') as channel_id,
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
        occurred_at as converted_at
    from {{ ref('events') }}
    where event_type != 'touchpoint'
),

ordered_touches as (
    select
        c.organization_id,
        c.project_id,
        c.environment_id,
        c.conversion_event_id,
        t.channel_id,
        t.occurred_at,
        row_number() over (
            partition by c.conversion_event_id
            order by t.occurred_at asc, t.touchpoint_event_id asc
        ) as step_num,
        lead(t.channel_id) over (
            partition by c.conversion_event_id
            order by t.occurred_at asc, t.touchpoint_event_id asc
        ) as next_channel_id,
        count(*) over (
            partition by c.conversion_event_id
        ) as journey_touch_count
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

-- 1. (start) -> first touchpoint
start_transitions as (
    select
        organization_id,
        project_id,
        environment_id,
        '(start)' as from_channel,
        channel_id as to_channel
    from ordered_touches
    where step_num = 1
),

-- 2. channel_i -> channel_{i+1}
internal_transitions as (
    select
        organization_id,
        project_id,
        environment_id,
        channel_id as from_channel,
        next_channel_id as to_channel
    from ordered_touches
    where next_channel_id is not null
),

-- 3. last touchpoint -> (conversion)
conversion_transitions as (
    select
        organization_id,
        project_id,
        environment_id,
        channel_id as from_channel,
        '(conversion)' as to_channel
    from ordered_touches
    where step_num = journey_touch_count
),

all_transitions as (
    select * from start_transitions
    union all
    select * from internal_transitions
    union all
    select * from conversion_transitions
),

aggregated as (
    select
        organization_id,
        project_id,
        environment_id,
        from_channel,
        to_channel,
        count(*) as transition_count
    from all_transitions
    group by 1, 2, 3, 4, 5
),

with_totals as (
    select
        organization_id,
        project_id,
        environment_id,
        from_channel,
        to_channel,
        transition_count,
        sum(transition_count) over (
            partition by organization_id, project_id, environment_id, from_channel
        ) as total_from_transitions
    from aggregated
)

select
    {{ surrogate_key(['organization_id', 'project_id', 'environment_id', 'from_channel', 'to_channel']) }} as transition_key,
    organization_id,
    project_id,
    environment_id,
    from_channel,
    to_channel,
    transition_count,
    (1.0 * transition_count) / total_from_transitions as transition_probability
from with_totals
