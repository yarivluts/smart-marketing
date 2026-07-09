-- Rules-based attribution (plan `04 §4`, KAN-58): first-touch and last-touch
-- credit for every customer-side event, resolved back through touchpoints
-- via KAN-56's `bridge_identity` and KAN-57's real touchpoint capture.
--
-- "Conversion event" is deliberately generic, not a hard-coded event name:
-- every `events` row whose `event_type` isn't `touchpoint` is a candidate,
-- labeled by the payload's own `event_name` when the schema carries one
-- (this project's `funnel_event` schema does — signup/activated/purchase),
-- falling back to `event_type` itself for schemas that don't (e.g. a
-- future plugin registering one schema per event kind, `stripe_charge`-
-- style) — the same "works off whatever a project registered, never a
-- hard-coded field" posture `bridge_identity` already established.
--
-- For a given conversion, its customer_id is resolved back to every anon_id
-- that shares identity-key evidence with it (`bridge_identity`), and every
-- one of that anon_id's own `touchpoint` events at-or-before the conversion
-- is a candidate touchpoint. `first_touch` credits the earliest candidate,
-- `last_touch` the most recent — 100% credit to a single touchpoint each,
-- per plan `04 §4`'s "rules-based" family. `channel_id`/`campaign_id` are
-- the touchpoint's own raw `channel`/`utm_campaign` string values, not a
-- `dim_channel`/`dim_campaign` surrogate key — no such dimension table
-- exists yet, so this mirrors `measures`' own "channel"/"campaign" being
-- bare strings straight out of a landed ad-spend record's payload (the same
-- vocabulary a `troi`/`cac`-by-channel metric would join against once one
-- exists, KAN-59). A conversion with no attributable touchpoint at all
-- still gets one row per model, labeled `channel_id = 'unattributed'`, so a
-- channel breakdown's denominator (every conversion) is never silently
-- short by the numerator (only conversions with captured marketing entry).

with touchpoints as (
    select
        organization_id,
        project_id,
        environment_id,
        event_id as touchpoint_event_id,
        entity_id as anon_id,
        coalesce(properties ->> 'channel', 'unknown') as channel_id,
        properties ->> 'utm_campaign' as campaign_id,
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
        coalesce(properties ->> 'event_name', event_type) as conversion_event,
        occurred_at
    from {{ ref('events') }}
    where event_type != 'touchpoint'
),

-- Every touchpoint reachable from a conversion's own customer_id, through
-- any anon_id `bridge_identity` resolved to that customer, that happened
-- at or before the conversion itself (a touchpoint after the fact can't
-- have driven it).
candidate_touchpoints as (
    select
        c.organization_id,
        c.project_id,
        c.environment_id,
        c.conversion_event_id,
        c.customer_id,
        c.conversion_event,
        c.occurred_at as converted_at,
        t.touchpoint_event_id,
        t.channel_id,
        t.campaign_id,
        t.occurred_at as touched_at
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
    where t.occurred_at <= c.occurred_at
),

-- One winning row per conversion for each model. `touchpoint_event_id` is
-- the final, deterministic tiebreaker for two touchpoints landed at the
-- exact same instant.
first_touch_winners as (
    select *
    from (
        select
            *,
            row_number() over (
                partition by conversion_event_id
                order by touched_at asc, touchpoint_event_id asc
            ) as rn
        from candidate_touchpoints
    )
    where rn = 1
),

last_touch_winners as (
    select *
    from (
        select
            *,
            row_number() over (
                partition by conversion_event_id
                order by touched_at desc, touchpoint_event_id asc
            ) as rn
        from candidate_touchpoints
    )
    where rn = 1
),

attributed as (
    select
        organization_id, project_id, environment_id, conversion_event_id,
        customer_id, conversion_event, converted_at,
        'first_touch' as model, channel_id, campaign_id
    from first_touch_winners

    union all

    select
        organization_id, project_id, environment_id, conversion_event_id,
        customer_id, conversion_event, converted_at,
        'last_touch' as model, channel_id, campaign_id
    from last_touch_winners
),

-- (conversion x model) pairs with no candidate touchpoint at all.
unattributed as (
    select
        c.organization_id, c.project_id, c.environment_id, c.conversion_event_id,
        c.customer_id, c.conversion_event, c.occurred_at as converted_at,
        m.model, 'unattributed' as channel_id, cast(null as varchar) as campaign_id
    from conversions c
    cross join (values ('first_touch'), ('last_touch')) as m(model)
    left join attributed a
        on a.conversion_event_id = c.conversion_event_id
        and a.model = m.model
    where a.conversion_event_id is null
),

final as (
    select * from attributed
    union all
    select * from unattributed
)

select
    -- One row per (conversion_event_id, model); fold both into the key
    -- (same "everything that makes a row distinct" convention as every
    -- other core model's surrogate key here).
    md5(
        organization_id || '|' || project_id || '|' || environment_id || '|'
        || conversion_event_id || '|' || model
    ) as attribution_key,
    organization_id,
    project_id,
    environment_id,
    customer_id,
    conversion_event_id,
    conversion_event,
    converted_at as occurred_at,
    model,
    channel_id,
    campaign_id,
    1.0 as credit
from final
