-- Revenue event fact (plan `04 §1`'s `fact_revenue_event`, 2026-08-21 KAN-59
-- follow-up): one row per dollar-denominated commerce event, built from two
-- independently reliable sources this codebase already lands: Stripe's own
-- `stripe_charge` events (`events` core table, per-charge outcome) for
-- `type in ('charge', 'first_charge')`, and the subscription snapshot
-- history (`stg_stripe_subscription_history`) for `type in ('new',
-- 'upgrade', 'downgrade')` MRR movements — Stripe's connector only lands a
-- subscription's *current* state on each sync (no dedicated "plan changed"
-- webhook/event is captured), so a movement is derived by diffing each
-- landed snapshot against the immediately-preceding one for the same
-- subscription (see that model's own doc comment for the exact rule).
--
-- `first_charge` rows are a second, synthetic row alongside a customer's
-- first-ever *succeeded* charge (not a replacement for its own `charge`
-- row) — the SaaS pack's `new_paying` metric (customers who've become
-- paying) counts distinct customers with one, independent of
-- `total_charges`/`collected_revenue`, which read the `charge` rows
-- themselves.
--
-- `plan` (the SaaS pack's own `mrr_movements` breakdown dimension) is the
-- moving subscription's own billing interval (`month`/`year`/...) — the
-- most granular "plan" label available from Stripe's minimal API shape this
-- connector reads (see `mapSubscriptionToEntityRecord`'s own doc comment).
-- `status`/`amount` are only ever populated for `charge`/`first_charge`
-- rows — a movement has no per-dollar "outcome status", and `collected_
-- revenue` (`status = 'succeeded'`) naturally excludes a null-status
-- movement row rather than needing its own type filter; likewise `plan`/
-- `mrr_delta` are only ever populated for movement rows.

with charge_events as (
    select
        organization_id,
        project_id,
        environment_id,
        event_id,
        entity_id as customer_id,
        {{ json_text_field('properties', "'status'") }} as status,
        {{ growthos_try_cast(json_text_field('properties', "'amount'"), dbt.type_float()) }} as amount,
        occurred_at
    from {{ ref('events') }}
    where event_type = 'stripe_charge'
),

charge_rows as (
    select
        organization_id,
        project_id,
        environment_id,
        event_id as revenue_event_id,
        'charge' as type,
        customer_id,
        status,
        amount,
        cast(null as {{ dbt.type_string() }}) as plan,
        cast(null as {{ dbt.type_float() }}) as mrr_delta,
        occurred_at as ts
    from charge_events
),

-- The earliest succeeded charge per customer — the "became a paying
-- customer" moment `new_paying` counts.
first_succeeded_charge_per_customer as (
    select *
    from (
        select
            *,
            row_number() over (
                partition by organization_id, project_id, environment_id, customer_id
                order by occurred_at asc, event_id asc
            ) as rn
        from charge_events
        where status = 'succeeded'
    ) ranked
    where rn = 1
),

first_charge_rows as (
    select
        organization_id,
        project_id,
        environment_id,
        event_id as revenue_event_id,
        'first_charge' as type,
        customer_id,
        status,
        amount,
        cast(null as {{ dbt.type_string() }}) as plan,
        cast(null as {{ dbt.type_float() }}) as mrr_delta,
        occurred_at as ts
    from first_succeeded_charge_per_customer
),

movement_rows as (
    select
        organization_id,
        project_id,
        environment_id,
        raw_record_key as revenue_event_id,
        movement_type as type,
        customer_id,
        cast(null as {{ dbt.type_string() }}) as status,
        cast(null as {{ dbt.type_float() }}) as amount,
        plan_interval as plan,
        mrr_delta,
        landed_at as ts
    from {{ ref('stg_stripe_subscription_history') }}
    where movement_type is not null
),

unioned as (
    select * from charge_rows
    union all
    select * from first_charge_rows
    union all
    select * from movement_rows
)

select
    -- One row per (revenue_event_id, type): a charge event contributes at
    -- most a `charge` row and a `first_charge` row (never two of the same
    -- type), and a subscription snapshot contributes at most one movement
    -- row, so the pair is always distinct.
    {{ surrogate_key(['organization_id', 'project_id', 'environment_id', 'revenue_event_id', 'type']) }} as revenue_event_key,
    organization_id,
    project_id,
    environment_id,
    customer_id,
    type,
    status,
    amount,
    plan,
    mrr_delta,
    ts
from unioned
