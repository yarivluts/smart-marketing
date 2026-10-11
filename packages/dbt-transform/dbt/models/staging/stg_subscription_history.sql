-- Subscription state history, vendor-neutral (KAN-110). Two sources feed one diff:
--
--   stripe:    every landed `stripe_subscription` entity snapshot (KAN-49's
--              connector), ordered by `landed_at` - the connector lands only
--              current state per sync, so a transition is dated by when the sync
--              observed it (see the precision note below).
--   canonical: every `subscription_state_change` EVENT carrying `properties.mrr`
--              - the contract any billing source without a PSP connector sends
--              (EasySign: plans set by an admin, no Stripe). Keyed by
--              `properties.subscription_id`, else `properties.customer_id` (a
--              customer has one plan, so a source with no subscription id is
--              not forced to invent one). `mrr` is the monthly recurring amount
--              AFTER the change, in `properties.currency`; `status` is
--              `properties.status`, or derived: mrr 0 -> canceled, else active.
--              Ordered by the event's own `ts` (`occurred_at`), so a late
--              or replayed batch still sorts by when the change happened. A
--              source's own type/mrr_delta fields are informational: movements
--              are derived from consecutive states here, exactly as for Stripe.
--              Records without `mrr` (EasySign's v1 events carried only a
--              currency-named field) are not read: no per-customer aliases.
--
-- Each row carries `changed_at` - the moment its state took effect as far as
-- the source tells us (`landed_at` for stripe, `occurred_at` for canonical) -
-- which downstream models date movements and transitions by.
--
-- `movement_type`/`mrr_delta` (consumed by `fact_revenue_event`'s MRR-
-- movement rows) and `lifecycle_event_type` (consumed by
-- `fact_subscription_event`) are both null when a snapshot represents no
-- meaningful transition (e.g. an unrelated field changed, or `status`/
-- `mrr_normalized` didn't move) — most landed snapshots carry neither:
--
--   movement_type:
--     'new'      — lands `active` from anything other than `active` (a
--                   first-ever snapshot, a `trialing` conversion, or a
--                   reactivation from `canceled`/`past_due`/`unpaid`/etc.).
--                   `mrr_delta` = the new `mrr_normalized` (nothing was
--                   being contributed before). Deliberately keyed off
--                   "did status become `active`", not off which specific
--                   status it came from — a `past_due` subscription that
--                   recovers to `active` re-contributes its MRR the same
--                   way a `canceled` one reactivating does; narrowing this
--                   to only `trialing`/`canceled` would silently drop that
--                   MRR forever (subtracted on the way to `past_due`, never
--                   re-added on the way back).
--     'upgrade'  — `active` -> `active` with `mrr_normalized` increased.
--     'downgrade'— `active` -> `active` with `mrr_normalized` decreased, OR
--                   `active` -> anything-else (a cancellation, a lapse into
--                   `past_due`/`unpaid`/etc., is a full downgrade to zero —
--                   symmetric with `new`'s own "any non-active status"
--                   rule). `mrr_delta` is the (negative) change, or
--                   `-1 * prev_mrr_normalized` for a full loss.
--   lifecycle_event_type:
--     'trial_start' — first-ever snapshot lands `trialing`.
--     'convert'     — `trialing` -> `active`.
--     'reactivate'  — any non-`active`/non-`trialing` status -> `active`
--                     (not just `canceled` — `past_due`/`unpaid`/etc. too).
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

with stripe_snapshots as (
    select
        organization_id,
        project_id,
        environment_id,
        raw_record_key,
        'stripe' as source,
        client_id as subscription_id,
        {{ json_text_field('attributes', "'customer_id'") }} as customer_id,
        {{ json_text_field('attributes', "'status'") }} as status,
        {{ growthos_try_cast(json_text_field('attributes', "'mrr_normalized'"), dbt.type_float()) }} as mrr_normalized,
        {{ json_text_field('attributes', "'currency'") }} as currency,
        {{ json_text_field('attributes', "'plan_interval'") }} as plan_interval,
        {{ json_text_field('attributes', "'plan_interval'") }} as plan,
        {{ growthos_try_cast(json_text_field('attributes', "'started_at'"), dbt.type_timestamp()) }} as started_at,
        landed_at,
        landed_at as changed_at
    from {{ ref('stg_entities') }}
    where schema_name = 'stripe_subscription'
),

canonical_changes as (
    select
        organization_id,
        project_id,
        environment_id,
        raw_record_key,
        'canonical' as source,
        coalesce(
            {{ json_text_field('properties', "'subscription_id'") }},
            {{ json_text_field('properties', "'customer_id'") }}
        ) as subscription_id,
        {{ json_text_field('properties', "'customer_id'") }} as customer_id,
        {{ json_text_field('properties', "'status'") }} as declared_status,
        {{ growthos_try_cast(json_text_field('properties', "'mrr'"), dbt.type_float()) }} as mrr_normalized,
        {{ json_text_field('properties', "'currency'") }} as currency,
        cast(null as {{ dbt.type_string() }}) as plan_interval,
        {{ json_text_field('properties', "'plan'") }} as plan,
        cast(null as {{ dbt.type_timestamp() }}) as started_at,
        landed_at,
        occurred_at as changed_at
    from {{ ref('stg_events') }}
    where schema_name = 'subscription_state_change'
),

snapshots as (
    select * from stripe_snapshots
    union all
    select
        organization_id,
        project_id,
        environment_id,
        raw_record_key,
        source,
        subscription_id,
        customer_id,
        coalesce(declared_status, case when mrr_normalized = 0 then 'canceled' else 'active' end) as status,
        mrr_normalized,
        currency,
        plan_interval,
        plan,
        started_at,
        landed_at,
        changed_at
    from canonical_changes
    -- The contract: a change without mrr, or without anyone to attribute it to, is not a state.
    where mrr_normalized is not null
      and subscription_id is not null
),

with_prev as (
    select
        *,
        lag(status) over (
            partition by organization_id, project_id, environment_id, source, subscription_id
            order by changed_at, raw_record_key
        ) as prev_status,
        lag(mrr_normalized) over (
            partition by organization_id, project_id, environment_id, source, subscription_id
            order by changed_at, raw_record_key
        ) as prev_mrr_normalized
    from snapshots
)

select
    organization_id,
    project_id,
    environment_id,
    raw_record_key,
    source,
    subscription_id,
    customer_id,
    status,
    mrr_normalized,
    currency,
    plan_interval,
    plan,
    started_at,
    landed_at,
    changed_at,
    case
        when status = 'active' and (prev_status is null or prev_status != 'active') then 'new'
        when status = 'active' and prev_status = 'active' and mrr_normalized > prev_mrr_normalized then 'upgrade'
        when status = 'active' and prev_status = 'active' and mrr_normalized < prev_mrr_normalized then 'downgrade'
        when status != 'active' and prev_status = 'active' then 'downgrade'
        else null
    end as movement_type,
    case
        when status = 'active' and (prev_status is null or prev_status != 'active') then mrr_normalized
        when status = 'active' and prev_status = 'active' and mrr_normalized != prev_mrr_normalized then mrr_normalized - prev_mrr_normalized
        when status != 'active' and prev_status = 'active' then -1 * prev_mrr_normalized
        else null
    end as mrr_delta,
    case
        when prev_status is null and status = 'trialing' then 'trial_start'
        when prev_status = 'trialing' and status = 'active' then 'convert'
        when prev_status is not null and prev_status not in ('active', 'trialing') and status = 'active' then 'reactivate'
        else null
    end as lifecycle_event_type
from with_prev
