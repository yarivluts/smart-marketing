-- Cohort engine v1 (plan `04 §5`, KAN-62): signup-month cohorts x
-- conversion/retention, one row per (cohort_month, conversion_event,
-- period_index) cell of the heatmap plan `10 §2.2` calls a "cohort
-- heatmap" tile. `cohort_month` is fixed to the signup event's own month
-- for this v1 — the plan's "generic cohort engine" note ("pick cohort key
-- -- signup month, first channel, plan") explicitly scopes other cohort
-- keys to a later story, the same "AC over wishlist" posture `BOARD_TILE_
-- TYPES`'s own doc comment already applies. Every `events` row whose label
-- isn't `signup` is a candidate "conversion", labeled the same generic way
-- `fact_attribution.conversion_event` already is (`properties ->>
-- 'event_name'`, falling back to `event_type`).
--
-- A customer's cohort is the calendar month of their *earliest* `signup`
-- event (customers should only ever sign up once, but `min()` makes this
-- resilient to an accidental duplicate landing). `period_index` is the
-- number of whole calendar months between the cohort month and a later
-- conversion's own month (0 = same month as signup; a conversion dated
-- *before* the cohort month, impossible in practice but not schema-
-- enforced, is excluded rather than producing a negative period).
--
-- Only cells with at least one converted customer produce a row -- the
-- same sparse-append posture `events`/`measures` already have -- a heatmap
-- tile treats a missing cell as 0% retention against the row's own
-- `cohort_size` (included on every row so no separate "cohort sizes"
-- table is needed to compute that 0%).

with signups as (
    select
        organization_id,
        project_id,
        environment_id,
        entity_id as customer_id,
        min(occurred_at) as signup_at
    from {{ ref('events') }}
    where coalesce(properties ->> 'event_name', event_type) = 'signup'
    group by 1, 2, 3, 4
),

cohorts as (
    select
        organization_id,
        project_id,
        environment_id,
        customer_id,
        date_trunc('month', signup_at) as cohort_month
    from signups
),

cohort_sizes as (
    select
        organization_id,
        project_id,
        environment_id,
        cohort_month,
        count(distinct customer_id) as cohort_size
    from cohorts
    group by 1, 2, 3, 4
),

conversions as (
    select
        organization_id,
        project_id,
        environment_id,
        entity_id as customer_id,
        coalesce(properties ->> 'event_name', event_type) as conversion_event,
        date_trunc('month', occurred_at) as event_month
    from {{ ref('events') }}
    where coalesce(properties ->> 'event_name', event_type) != 'signup'
),

cohort_conversions as (
    select
        c.organization_id,
        c.project_id,
        c.environment_id,
        c.cohort_month,
        cv.conversion_event,
        date_diff('month', c.cohort_month, cv.event_month) as period_index,
        c.customer_id
    from cohorts c
    inner join conversions cv
        on cv.organization_id = c.organization_id
        and cv.project_id = c.project_id
        and cv.environment_id = c.environment_id
        and cv.customer_id = c.customer_id
    where cv.event_month >= c.cohort_month
),

aggregated as (
    select
        organization_id,
        project_id,
        environment_id,
        cohort_month,
        conversion_event,
        period_index,
        count(distinct customer_id) as converted_customers
    from cohort_conversions
    group by 1, 2, 3, 4, 5, 6
)

select
    -- One row per (project_id, environment_id, cohort_month,
    -- conversion_event, period_index) -- the same "fold every column that
    -- makes a row distinct into an md5" convention `bridge_identity`/
    -- `fact_attribution` already use for their own surrogate keys.
    md5(
        a.organization_id || '|' || a.project_id || '|' || a.environment_id || '|'
        || cast(a.cohort_month as varchar) || '|' || a.conversion_event || '|'
        || cast(a.period_index as varchar)
    ) as cohort_retention_key,
    a.organization_id,
    a.project_id,
    a.environment_id,
    a.cohort_month,
    a.conversion_event,
    a.period_index,
    cs.cohort_size,
    a.converted_customers,
    cast(a.converted_customers as double) / cs.cohort_size as retention_rate
from aggregated a
inner join cohort_sizes cs
    on cs.organization_id = a.organization_id
    and cs.project_id = a.project_id
    and cs.environment_id = a.environment_id
    and cs.cohort_month = a.cohort_month
