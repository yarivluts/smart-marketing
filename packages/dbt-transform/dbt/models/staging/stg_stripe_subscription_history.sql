-- Subscription snapshot history (2026-08-21 KAN-59 follow-up): every landed
-- `stripe_subscription` entity snapshot, not just the current one `entities`
-- dedupes down to — built directly off `stg_entities` (the undeduped
-- staging view) rather than `entities`/`dim_subscription`, since the
-- MRR-movement and lifecycle-transition rows `fact_revenue_event`/
-- `fact_subscription_event` both need both need to diff a subscription
-- against its own *previous* landed state, which the deduped-to-latest
-- `entities` table has already discarded. A "thicker" staging view than its
-- siblings (`stg_events`/`stg_entities` are thin typed passthroughs) —
-- kept here rather than under `models/core/` because it isn't itself a
-- plan-referenced fact/dim table any metric targets, just shared prep two
-- core models both need.
--
-- Stripe's connector (`mapSubscriptionToEntityRecord`,
-- `packages/firebase-orm-models`) lands only a subscription's *current*
-- state on each sync — there is no dedicated "plan changed"/"trial
-- converted" event captured — so this model detects those transitions
-- itself by comparing each snapshot to the immediately-preceding one for
-- the same subscription (`lag()` over `landed_at`).
--
-- `movement_type`/`mrr_delta` (consumed by `fact_revenue_event`'s MRR-
-- movement rows) and `lifecycle_event_type` (consumed by
-- `fact_subscription_event`) are both null when a snapshot represents no
-- meaningful transition (e.g. an unrelated field changed, or `status`/
-- `mrr_normalized` didn't move) — most landed snapshots carry neither:
--
--   movement_type:
--     'new'      — first-ever snapshot lands `active`, OR a `trialing` ->
--                   `active` conversion, OR a `canceled` -> `active`
--                   reactivation. `mrr_delta` = the new `mrr_normalized`
--                   (nothing was being contributed before).
--     'upgrade'  — `active` -> `active` with `mrr_normalized` increased.
--     'downgrade'— `active` -> `active` with `mrr_normalized` decreased, OR
--                   `active` -> anything-else (a cancellation is a full
--                   downgrade to zero). `mrr_delta` is the (negative)
--                   change, or `-1 * prev_mrr_normalized` for a full
--                   cancellation.
--   lifecycle_event_type:
--     'trial_start' — first-ever snapshot lands `trialing`.
--     'convert'     — `trialing` -> `active`.
--     'reactivate'  — `canceled` -> `active`.
--
-- A `trialing`-first-ever snapshot deliberately gets no `movement_type`
-- (nothing has been billed yet); a first-ever snapshot landing directly as
-- `active` (no trial observed) gets `movement_type = 'new'` but no
-- `lifecycle_event_type` (there was no trial to start or convert from).
--
-- `ts` on a transition is exact only for `trial_start`, which uses the
-- subscription's own real `started_at` (Stripe's `created` timestamp,
-- plumbed through by the mapper) — every other transition is dated by
-- `landed_at` (when this connector's sync happened to observe the new
-- state), not the real-world instant Stripe applied it. The same
-- "buildable-today" polling precision this connector's sync already has
-- everywhere else, documented rather than silently assumed exact.

with snapshots as (
    select
        organization_id,
        project_id,
        environment_id,
        raw_record_key,
        client_id as subscription_id,
        {{ json_text_field('attributes', "'customer_id'") }} as customer_id,
        {{ json_text_field('attributes', "'status'") }} as status,
        {{ growthos_try_cast(json_text_field('attributes', "'mrr_normalized'"), dbt.type_float()) }} as mrr_normalized,
        {{ json_text_field('attributes', "'plan_interval'") }} as plan_interval,
        {{ growthos_try_cast(json_text_field('attributes', "'started_at'"), dbt.type_timestamp()) }} as started_at,
        landed_at
    from {{ ref('stg_entities') }}
    where schema_name = 'stripe_subscription'
),

with_prev as (
    select
        *,
        lag(status) over (
            partition by organization_id, project_id, environment_id, subscription_id
            order by landed_at, raw_record_key
        ) as prev_status,
        lag(mrr_normalized) over (
            partition by organization_id, project_id, environment_id, subscription_id
            order by landed_at, raw_record_key
        ) as prev_mrr_normalized
    from snapshots
)

select
    organization_id,
    project_id,
    environment_id,
    raw_record_key,
    subscription_id,
    customer_id,
    status,
    mrr_normalized,
    plan_interval,
    started_at,
    landed_at,
    case
        when prev_status is null and status = 'active' then 'new'
        when prev_status = 'trialing' and status = 'active' then 'new'
        when prev_status = 'canceled' and status = 'active' then 'new'
        when prev_status = 'active' and status = 'active' and mrr_normalized > prev_mrr_normalized then 'upgrade'
        when prev_status = 'active' and status = 'active' and mrr_normalized < prev_mrr_normalized then 'downgrade'
        when prev_status = 'active' and status != 'active' then 'downgrade'
        else null
    end as movement_type,
    case
        when prev_status is null and status = 'active' then mrr_normalized
        when prev_status = 'trialing' and status = 'active' then mrr_normalized
        when prev_status = 'canceled' and status = 'active' then mrr_normalized
        when prev_status = 'active' and status = 'active' and mrr_normalized != prev_mrr_normalized then mrr_normalized - prev_mrr_normalized
        when prev_status = 'active' and status != 'active' then -1 * prev_mrr_normalized
        else null
    end as mrr_delta,
    case
        when prev_status is null and status = 'trialing' then 'trial_start'
        when prev_status = 'trialing' and status = 'active' then 'convert'
        when prev_status = 'canceled' and status = 'active' then 'reactivate'
        else null
    end as lifecycle_event_type
from with_prev
