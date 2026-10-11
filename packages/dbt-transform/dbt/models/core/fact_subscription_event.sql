-- Subscription lifecycle-transition fact (plan `04 §1`'s
-- `fact_subscription_event`, 2026-08-21 KAN-59 follow-up): one row per
-- detected trial_start/convert/reactivate transition, sourced from
-- `stg_subscription_history`'s own snapshot-diffing (Stripe snapshots and
-- vendor-neutral `subscription_state_change` events, KAN-110) — see that
-- model's own doc comment for the exact transition rules and the
-- `ts`-precision caveat. Feeds the SaaS pack's `reactivations`/
-- `trial_starts`/`trial_conversions` metrics.

with transitions as (
    select
        organization_id,
        project_id,
        environment_id,
        raw_record_key,
        subscription_id,
        customer_id,
        lifecycle_event_type as type,
        case when lifecycle_event_type = 'trial_start' then coalesce(started_at, changed_at) else changed_at end as ts
    from {{ ref('stg_subscription_history') }}
    where lifecycle_event_type is not null
)

select
    {{ surrogate_key(['organization_id', 'project_id', 'environment_id', 'raw_record_key', 'type']) }} as subscription_event_key,
    organization_id,
    project_id,
    environment_id,
    subscription_id,
    customer_id,
    type,
    ts
from transitions
