-- Fixed-window payback (KAN-86, E18.x, plan `14 §Gap 12`): the `collection_nd`
-- half of the "roi_nd / collection_nd metric family" AC — how much revenue a
-- customer's own acquisition cohort has generated within a fixed number of
-- days of acquisition, the standard early-payback KPI (BigBrain's own
-- "Coll. 40(d)").
--
-- Grain: one row per customer. "Acquired" reuses the exact `min(occurred_at)
-- where event_type != 'touchpoint'` convention `fact_cohort_retention`/
-- `fact_cancellation_reason` already established for "a customer's first
-- customer-side event" — not hard-coded to a `signup` event name.
--
-- The window set is a fixed catalog (7/14/30/40 days, the last one BigBrain's
-- own literal "40(d)" window) rather than a single runtime-configurable N:
-- the metrics compiler has no per-query parameter beyond its own time-range/
-- dimension/filter shape (`packages/shared/src/metrics-compiler`), so "one
-- column per window" is this codebase's established way to expose a small
-- fixed set of windows as ordinary aggregation metrics (`campaign-ops-pack/
-- metrics.ts` registers one `collection_Nd` metric per column below) — the
-- same posture `fact_engagement_depth_histogram`'s own fixed L1/L7/L28
-- buckets already take for "configurable" engagement windows.
--
-- Revenue is `fact_revenue_event` rows with `type = 'charge'` (a real charge
-- attempt), NOT `first_charge` — `first_charge` is a second, synthetic row
-- alongside a customer's first `charge` row for the exact same dollar amount
-- (see that model's own doc comment), so including both would double-count
-- a customer's very first payment. Only `status = 'succeeded'` charges count
-- as "collected".
--
-- `campaign_id`/`channel_id` (2026-08-25 KAN-86 follow-up): the customer's
-- own acquisition event (their first customer-side event, same row this
-- model already keys off) is joined to `fact_attribution`'s `last_touch`
-- model by `conversion_event_id`, the same "join a specific event's own
-- event_id to `fact_attribution` where `model = 'last_touch'`" pattern
-- `fact_signup_quality_score.sql` (KAN-83) already established. The
-- acquisition CTE below is rewritten from a bare `min(occurred_at)` group-by
-- to a `row_number()` winner-pick so it can carry that specific event's
-- `event_id` forward (mirrors `fact_attribution`'s own touched_at/
-- touchpoint_event_id tiebreak convention: earliest `occurred_at`, ties
-- broken by `event_id`) — a customer's acquisition is still exactly one
-- event, this only makes its identity explicit instead of discarding it.
-- A left join: an organic customer with no attributable touchpoint at all
-- still gets a row (`channel_id = 'unattributed'`, `campaign_id = null`),
-- same posture the left join to `revenue` already establishes for zero
-- charges. This closes the "compiler has no join graph to bridge the two"
-- half of the old deferred note — `metric-registry.service.ts` places no
-- constraint on a metric's declared `dimensions` beyond name syntax, and
-- `compiler.ts` already FULL JOINs one leaf CTE per aggregation on shared
-- dimension columns (proven in production by `cac`/`quality_adjusted_cac`,
-- both of which divide `ad_spend` by a `fact_signup_quality_score`-derived
-- metric on `channel_id`) — so a real dbt column was the only missing
-- piece. `roi_nd`/`collection_nd` remain project-level-only unless broken
-- down by this new `campaign_id` dimension (`campaign-ops-pack/metrics.ts`
-- does so). A genuine per-campaign `roi_nd` still needs a real ad-spend
-- connector (KAN-50/51, blocked by KAN-43) before `ad_spend` carries any
-- live rows to divide by — that half is unchanged.

with customer_events as (
    select organization_id, project_id, environment_id, entity_id as customer_id, event_id, occurred_at
    from {{ ref('events') }}
    where event_type != 'touchpoint'
),

acquisition as (
    select
        organization_id,
        project_id,
        environment_id,
        customer_id,
        event_id as acquisition_event_id,
        occurred_at as acquired_at
    from (
        select
            *,
            row_number() over (
                partition by organization_id, project_id, environment_id, customer_id
                order by occurred_at asc, event_id asc
            ) as rn
        from customer_events
    )
    where rn = 1
),

channel_attribution as (
    select organization_id, project_id, environment_id, conversion_event_id, channel_id, campaign_id
    from {{ ref('fact_attribution') }}
    where model = 'last_touch'
),

revenue as (
    select organization_id, project_id, environment_id, customer_id, amount, ts
    from {{ ref('fact_revenue_event') }}
    where type = 'charge' and status = 'succeeded'
),

-- A left join, not an inner one: a customer with zero succeeded charges
-- still needs a row here (every `collection_Nd` = 0 for them), the same
-- "every entity gets a row, even with nothing to join" posture
-- `fact_cancellation_reason`'s own joins establish.
joined as (
    select
        a.organization_id,
        a.project_id,
        a.environment_id,
        a.customer_id,
        a.acquired_at,
        coalesce(ca.channel_id, 'unattributed') as channel_id,
        ca.campaign_id,
        r.amount,
        case
            when r.ts is null then null
            else {{ growthos_datediff('a.acquired_at', 'r.ts', 'day') }}
        end as days_since_acquisition
    from acquisition a
    left join channel_attribution ca
        on ca.organization_id = a.organization_id
        and ca.project_id = a.project_id
        and ca.environment_id = a.environment_id
        and ca.conversion_event_id = a.acquisition_event_id
    left join revenue r
        on r.organization_id = a.organization_id
        and r.project_id = a.project_id
        and r.environment_id = a.environment_id
        and r.customer_id = a.customer_id
        and r.ts >= a.acquired_at
),

aggregated as (
    select
        organization_id,
        project_id,
        environment_id,
        customer_id,
        acquired_at,
        channel_id,
        campaign_id,
        sum(case when days_since_acquisition <= 7 then amount else 0 end) as collected_revenue_7d,
        sum(case when days_since_acquisition <= 14 then amount else 0 end) as collected_revenue_14d,
        sum(case when days_since_acquisition <= 30 then amount else 0 end) as collected_revenue_30d,
        sum(case when days_since_acquisition <= 40 then amount else 0 end) as collected_revenue_40d
    from joined
    group by 1, 2, 3, 4, 5, 6, 7
)

select
    -- One row per (organization_id, project_id, environment_id, customer_id) --
    -- the same "fold every column that makes a row distinct into an md5"
    -- convention `attribution_key`/`cohort_retention_key` already use.
    {{ surrogate_key(['organization_id', 'project_id', 'environment_id', 'customer_id']) }} as customer_payback_key,
    organization_id,
    project_id,
    environment_id,
    customer_id,
    acquired_at,
    channel_id,
    campaign_id,
    collected_revenue_7d,
    collected_revenue_14d,
    collected_revenue_30d,
    collected_revenue_40d
from aggregated
