-- Daily engagement (plan `04 §3` / `14` gap 2, KAN-63): per (organization,
-- project, environment, activity_date), `dau` is the count of distinct
-- customers with any non-touchpoint event that calendar day, and
-- `active_customers_l_n` is the count of distinct customers active anywhere
-- in the trailing `engagement_window_days` days (default 28 — "L28",
-- configurable to any N via `--vars '{engagement_window_days: N}'` for an
-- "LN" window) ending on that same day. `dau_mau_ratio` (`dau /
-- active_customers_l_n`) is the stickiness ratio plan `14` gap 2 names —
-- registered by the engagement-pack plugin, see
-- `plugin-runtime/engagement-pack/metrics.ts`'s own doc comment for why this
-- needs its own precomputed table rather than a `dau / mau` formula over two
-- separately-registered metrics.
--
-- `dau`/`wau`/`mau` themselves are NOT sourced from this table: they're one
-- shared aggregation-kind metric (`count_distinct` over the aspirational
-- `fact_funnel_event` table, matching the SaaS pack's own aspirational-table
-- convention) queried at three different time grains by the metrics compiler
-- (KAN-41) — a calendar-day/week/month distinct-customer count is correct at
-- whichever grain a query requests, so only the cross-grain *ratio* needs a
-- dedicated, precomputed table: that's this model's entire reason to exist.
--
-- No `project_bounds`/spine here (unlike `fact_cohort_retention`): every row
-- this model emits corresponds to a calendar day that actually had activity,
-- and there's no matrix to fill zeros into — a day with zero activity simply
-- has no row, the same "no observable data, no row" posture the cohort
-- model's own spine restricts itself to (only *elapsed* periods), just
-- without a further axis to cross against.

with customer_events as (
    select organization_id, project_id, environment_id, entity_id as customer_id, date_trunc('day', occurred_at) as activity_date
    from {{ ref('events') }}
    where event_type != 'touchpoint'
),

customer_activity_days as (
    select distinct organization_id, project_id, environment_id, customer_id, activity_date
    from customer_events
),

activity_dates as (
    select distinct organization_id, project_id, environment_id, activity_date
    from customer_activity_days
),

daily_active as (
    select organization_id, project_id, environment_id, activity_date, count(distinct customer_id) as dau
    from customer_activity_days
    group by 1, 2, 3, 4
),

-- Every customer active anywhere in the trailing `engagement_window_days`
-- days ending on `d.activity_date` (inclusive of both ends) — a self-join
-- bounded by `date_diff`, the same pattern `fact_cohort_retention` already
-- uses for its own elapsed-periods spine.
rolling_active as (
    select
        d.organization_id,
        d.project_id,
        d.environment_id,
        d.activity_date,
        count(distinct a.customer_id) as active_customers_l_n
    from activity_dates d
    inner join customer_activity_days a
        on a.organization_id = d.organization_id
        and a.project_id = d.project_id
        and a.environment_id = d.environment_id
        and date_diff('day', a.activity_date, d.activity_date) between 0 and {{ var('engagement_window_days', 28) - 1 }}
    group by 1, 2, 3, 4
)

select
    -- Composite (project_id, environment_id, activity_date) uniqueness key,
    -- the same "fold every column that makes a row distinct into an md5"
    -- convention `cohort_retention_key`/`attribution_key` already use.
    md5(
        daily.organization_id || '|' || daily.project_id || '|' || daily.environment_id || '|' || daily.activity_date
    ) as engagement_daily_key,
    daily.organization_id,
    daily.project_id,
    daily.environment_id,
    daily.activity_date,
    daily.dau,
    rolling.active_customers_l_n,
    -- Never divides by zero: `rolling.active_customers_l_n` always includes
    -- at least `daily.dau`'s own customers (the window's own last day is
    -- itself in range), so it's always >= dau >= 1 for every row this model
    -- emits — the same "denominator can't be zero by construction" reasoning
    -- `fact_cohort_retention.retention_rate` relies on for its own division.
    daily.dau::double / rolling.active_customers_l_n as dau_mau_ratio
from daily_active daily
inner join rolling_active rolling
    on rolling.organization_id = daily.organization_id
    and rolling.project_id = daily.project_id
    and rolling.environment_id = daily.environment_id
    and rolling.activity_date = daily.activity_date
