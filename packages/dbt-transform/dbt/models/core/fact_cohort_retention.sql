-- Generic cohort engine v1 (plan `04 §5`, KAN-62): every customer is
-- assigned to a cohort by the calendar month of their *first* customer-side
-- event (the same "conversion event" generalization `fact_attribution`
-- already established — not hard-coded to an event named `signup`, so this
-- reads off whatever event a project's own schema happens to log first).
-- For every subsequent month a cohort has had time to be observed, this
-- computes how many of that cohort's customers had *any* further activity
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
-- v1 scope, deliberately not built here (a natural follow-on, not required
-- by this story's own AC of "cohort matrix matches hand-computed fixture"):
-- a *conversion* cohort parameterized by a specific event name (this model
-- only computes the "retention" half of "signup-month x conversion/
-- retention" — any activity counts, not a specific target event), and a
-- configurable grain other than month.

with customer_events as (
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
        date_trunc('month', min(occurred_at)) as cohort_month
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
    select organization_id, project_id, environment_id, max(date_trunc('month', occurred_at)) as max_activity_month
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
        gs.period_number
    from cohort_months cm
    inner join project_bounds pb
        on pb.organization_id = cm.organization_id
        and pb.project_id = cm.project_id
        and pb.environment_id = cm.environment_id
    cross join generate_series(0, date_diff('month', cm.cohort_month, pb.max_activity_month)) as gs(period_number)
),

customer_activity_months as (
    select distinct organization_id, project_id, environment_id, customer_id, date_trunc('month', occurred_at) as activity_month
    from customer_events
),

retained as (
    select
        ca.organization_id,
        ca.project_id,
        ca.environment_id,
        ca.cohort_month,
        date_diff('month', ca.cohort_month, cam.activity_month) as period_number,
        count(distinct ca.customer_id) as retained_count
    from cohort_assignment ca
    inner join customer_activity_months cam
        on cam.organization_id = ca.organization_id
        and cam.project_id = ca.project_id
        and cam.environment_id = ca.environment_id
        and cam.customer_id = ca.customer_id
    where cam.activity_month >= ca.cohort_month
    group by 1, 2, 3, 4, 5
)

select
    -- Composite (project_id, environment_id, cohort_month, period_number)
    -- uniqueness key, the same "fold every column that makes a row
    -- distinct into an md5" convention `bridge_identity_key`/
    -- `attribution_key` already use.
    md5(
        spine.organization_id || '|' || spine.project_id || '|' || spine.environment_id || '|'
        || spine.cohort_month || '|' || spine.period_number
    ) as cohort_retention_key,
    spine.organization_id,
    spine.project_id,
    spine.environment_id,
    spine.cohort_month,
    spine.period_number,
    cs.cohort_size,
    coalesce(r.retained_count, 0) as retained_count,
    coalesce(r.retained_count, 0)::double / cs.cohort_size as retention_rate
from cohort_period_spine spine
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
