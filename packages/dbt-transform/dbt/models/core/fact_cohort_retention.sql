-- Generic cohort engine v1 (plan `04 §5`, KAN-62): every customer is
-- assigned to a cohort by the calendar month of their *first* customer-side
-- event (the same "conversion event" generalization `fact_attribution`
-- already established — not hard-coded to an event named `signup`, so this
-- reads off whatever event a project's own schema happens to log first).
-- For every subsequent month a cohort has had time to be observed, this
-- computes how many of that cohort's customers had further activity
-- ("retention"), producing the classic cohort_month x period_number matrix
-- (plan `10 §2.2`'s "cohort heatmap" tile, KAN-60's `heatmap` tile type).
--
-- `period_number` 0 is always 100% retained by construction (the very event
-- that assigned the cohort counts as that period's own activity). A cohort's
-- periods only run up to the project's own latest observed activity month —
-- not some fixed lookback window — so a recent cohort naturally has fewer
-- columns populated than an older one (a real matrix's usual lower-triangular
-- shape), rather than emitting speculative rows for periods that haven't
-- happened yet.
--
-- KAN-118: `retained_count`/`retention_rate` are now parameterized by
-- `conversion_event` — the classic "signup-month x conversion/retention"
-- shape this model's own v1 doc comment named as a deliberately-deferred
-- follow-on. Cohort *assignment* stays generic (still whichever event a
-- customer logged first, unchanged); only what counts as "retained" in a
-- later period is parameterized. Every cohort_month x period_number
-- combination gets one `conversion_event = '__any__'` row (byte-for-byte the
-- v1 behavior: retained if the customer had *any* activity that period) plus
-- one row per specific event label actually observed anywhere in that
-- (org, project, environment) — retained only if the customer fired that
-- exact event again in that period. The event label is derived the same way
-- `fact_attribution.conversion_event`/`fact_funnel_step.event_label` already
-- do: the payload's own `event_name` when the schema carries one, falling
-- back to `event_type` itself otherwise — never a hard-coded event name.
-- `query_cohort`/`queryProjectCohortRetention` defaults to `__any__` when a
-- caller doesn't ask for a specific conversion event, so every existing
-- caller keeps its current behavior unchanged.

with customer_events as (
    select
        organization_id,
        project_id,
        environment_id,
        entity_id as customer_id,
        coalesce({{ json_text_field('properties', "'event_name'") }}, event_type) as event_label,
        occurred_at
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

cohort_months as (
    select distinct organization_id, project_id, environment_id, cohort_month
    from cohort_assignment
),

cohort_sizes as (
    select organization_id, project_id, environment_id, cohort_month, count(distinct customer_id) as cohort_size
    from cohort_assignment
    group by 1, 2, 3, 4
),

-- Every calendar month any customer in this (org, project, environment) had
-- activity — the boundary that determines how many periods are observable
-- for each cohort (see the model's own doc comment above).
project_bounds as (
    select organization_id, project_id, environment_id, max({{ dbt.date_trunc('month', 'occurred_at') }}) as max_activity_month
    from customer_events
    group by 1, 2, 3
),

-- One row per (cohort_month, period_number) that has actually elapsed —
-- i.e. `period_number` months after `cohort_month` is not later than the
-- project's own latest observed activity month.
cohort_period_spine as (
    select
        cm.organization_id,
        cm.project_id,
        cm.environment_id,
        cm.cohort_month,
        period_number
    from cohort_months cm
    inner join project_bounds pb
        on pb.organization_id = cm.organization_id
        and pb.project_id = cm.project_id
        and pb.environment_id = cm.environment_id
    cross join {{ int_range_join(0, growthos_datediff('cm.cohort_month', 'pb.max_activity_month', 'month'), 'period_number') }}
),

-- Every distinct event label ever observed in a given (org, project,
-- environment) — the set of "specific conversion event" rows this model
-- adds alongside the `__any__` row for every elapsed period.
conversion_events as (
    select distinct organization_id, project_id, environment_id, event_label
    from customer_events
),

-- The full (cohort_month, period_number, conversion_event) grain: the
-- existing `__any__` row for every elapsed period, plus one row per period
-- per event label actually observed in that project.
cohort_period_conversion_spine as (
    select spine.*, '__any__' as conversion_event
    from cohort_period_spine spine

    union all

    select spine.organization_id, spine.project_id, spine.environment_id, spine.cohort_month, spine.period_number, ce.event_label as conversion_event
    from cohort_period_spine spine
    inner join conversion_events ce
        on ce.organization_id = spine.organization_id
        and ce.project_id = spine.project_id
        and ce.environment_id = spine.environment_id
),

customer_activity_months as (
    select distinct organization_id, project_id, environment_id, customer_id, event_label, {{ dbt.date_trunc('month', 'occurred_at') }} as activity_month
    from customer_events
),

retained as (
    -- `__any__`: retained if the customer had any activity at all that period (v1's original rule).
    select
        ca.organization_id,
        ca.project_id,
        ca.environment_id,
        ca.cohort_month,
        {{ growthos_datediff('ca.cohort_month', 'cam.activity_month', 'month') }} as period_number,
        '__any__' as conversion_event,
        count(distinct ca.customer_id) as retained_count
    from cohort_assignment ca
    inner join customer_activity_months cam
        on cam.organization_id = ca.organization_id
        and cam.project_id = ca.project_id
        and cam.environment_id = ca.environment_id
        and cam.customer_id = ca.customer_id
    where cam.activity_month >= ca.cohort_month
    group by 1, 2, 3, 4, 5, 6

    union all

    -- One event label at a time: retained only if the customer fired that
    -- exact event again that period.
    select
        ca.organization_id,
        ca.project_id,
        ca.environment_id,
        ca.cohort_month,
        {{ growthos_datediff('ca.cohort_month', 'cam.activity_month', 'month') }} as period_number,
        cam.event_label as conversion_event,
        count(distinct ca.customer_id) as retained_count
    from cohort_assignment ca
    inner join customer_activity_months cam
        on cam.organization_id = ca.organization_id
        and cam.project_id = ca.project_id
        and cam.environment_id = ca.environment_id
        and cam.customer_id = ca.customer_id
    where cam.activity_month >= ca.cohort_month
    group by 1, 2, 3, 4, 5, 6
)

select
    -- Composite (project_id, environment_id, cohort_month, period_number,
    -- conversion_event) uniqueness key, the same "fold every column that
    -- makes a row distinct into an md5" convention `bridge_identity_key`/
    -- `attribution_key` already use.
    {{ surrogate_key(['spine.organization_id', 'spine.project_id', 'spine.environment_id', 'spine.cohort_month', 'spine.period_number', 'spine.conversion_event']) }} as cohort_retention_key,
    spine.organization_id,
    spine.project_id,
    spine.environment_id,
    spine.cohort_month,
    spine.period_number,
    spine.conversion_event,
    cs.cohort_size,
    coalesce(r.retained_count, 0) as retained_count,
    cast(coalesce(r.retained_count, 0) as {{ dbt.type_float() }}) / cs.cohort_size as retention_rate
from cohort_period_conversion_spine spine
inner join cohort_sizes cs
    on cs.organization_id = spine.organization_id
    and cs.project_id = spine.project_id
    and cs.environment_id = spine.environment_id
    and cs.cohort_month = spine.cohort_month
left join retained r
    on r.organization_id = spine.organization_id
    and r.project_id = spine.project_id
    and r.environment_id = spine.environment_id
    and r.cohort_month = spine.cohort_month
    and r.period_number = spine.period_number
    and r.conversion_event = spine.conversion_event
