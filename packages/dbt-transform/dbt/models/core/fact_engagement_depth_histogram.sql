-- The L28/LN engagement-depth histogram (plan `14` gap 2, KAN-63): as of the
-- project's own latest observed activity date, how many customers were
-- active on exactly N of the trailing `engagement_window_days` days (default
-- 28 — "L28"; any N via `--vars '{engagement_window_days: N}'` for an "LN"
-- window). One row per (organization, project, environment, as_of_date,
-- days_active_bucket) covering every bucket from 1 to the configured window
-- size — a bucket with no matching customer still gets a row with
-- `customer_count = 0` (the same "full spine, coalesce to zero" convention
-- `fact_cohort_retention` uses for its own matrix), so the KAN-60 `histogram`
-- board tile always renders a complete distribution rather than a sparse one
-- with silent gaps. Feeds the engagement-pack's own `engagement_depth_
-- histogram` metric (`plugin-runtime/engagement-pack/metrics.ts`), broken
-- down by `days_active_bucket`.
--
-- "As of the latest observed activity date" (not every historical date, the
-- way `fact_engagement_daily` is) because a days-active-in-the-last-N-days
-- histogram is inherently a *snapshot* metric — "how engaged are our
-- customers right now" — not a time series; the same reasoning
-- `fact_cohort_retention`'s own `project_bounds` doc comment gives for why
-- its own periods stop at the project's latest observed month rather than
-- projecting speculative future rows.

with customer_events as (
    select organization_id, project_id, environment_id, entity_id as customer_id, date_trunc('day', occurred_at) as activity_date
    from {{ ref('events') }}
    where event_type != 'touchpoint'
),

customer_activity_days as (
    select distinct organization_id, project_id, environment_id, customer_id, activity_date
    from customer_events
),

project_bounds as (
    select organization_id, project_id, environment_id, max(activity_date) as as_of_date
    from customer_activity_days
    group by 1, 2, 3
),

-- Every customer's own distinct-days-active count within the trailing
-- window ending on the project's `as_of_date` — the same `date_diff`-bounded
-- self-join `fact_engagement_daily.rolling_active` uses, just grouped by
-- customer instead of counted distinct.
customer_days_active_in_window as (
    select
        pb.organization_id,
        pb.project_id,
        pb.environment_id,
        cad.customer_id,
        count(distinct cad.activity_date) as days_active
    from project_bounds pb
    inner join customer_activity_days cad
        on cad.organization_id = pb.organization_id
        and cad.project_id = pb.project_id
        and cad.environment_id = pb.environment_id
        and date_diff('day', cad.activity_date, pb.as_of_date) between 0 and {{ var('engagement_window_days', 28) - 1 }}
    group by 1, 2, 3, 4
),

bucket_spine as (
    select pb.organization_id, pb.project_id, pb.environment_id, pb.as_of_date, gs.days_active_bucket
    from project_bounds pb
    cross join generate_series(1, {{ var('engagement_window_days', 28) }}) as gs(days_active_bucket)
),

histogram as (
    select organization_id, project_id, environment_id, days_active as days_active_bucket, count(distinct customer_id) as customer_count
    from customer_days_active_in_window
    group by 1, 2, 3, 4
)

select
    -- Composite (project_id, environment_id, as_of_date, days_active_bucket)
    -- uniqueness key, the same convention `cohort_retention_key` establishes.
    md5(
        spine.organization_id || '|' || spine.project_id || '|' || spine.environment_id || '|'
        || spine.as_of_date || '|' || spine.days_active_bucket
    ) as engagement_depth_histogram_key,
    spine.organization_id,
    spine.project_id,
    spine.environment_id,
    spine.as_of_date,
    spine.days_active_bucket,
    coalesce(h.customer_count, 0) as customer_count
from bucket_spine spine
left join histogram h
    on h.organization_id = spine.organization_id
    and h.project_id = spine.project_id
    and h.environment_id = spine.environment_id
    and h.days_active_bucket = spine.days_active_bucket
