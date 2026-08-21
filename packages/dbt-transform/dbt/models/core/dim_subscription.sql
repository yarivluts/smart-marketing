-- Subscription dimension (plan `04 §1`'s `dim_subscription`, 2026-08-21
-- KAN-59 follow-up): current-state snapshot per Stripe subscription,
-- straight off the generic `entities` core table filtered to
-- `schema_name = 'stripe_subscription'` (KAN-49's Stripe connector — see
-- `mapSubscriptionToEntityRecord`'s own doc comment for exactly what each
-- attribute means and where `started_at`/`plan_interval` come from).
-- `mrr`/`started_at` are the columns the SaaS metric pack's own `mrr`/
-- `trials_active` aggregations target
-- (`packages/firebase-orm-models/.../saas-metric-pack/metrics.ts`).

select
    entity_key as subscription_key,
    organization_id,
    project_id,
    environment_id,
    entity_id as subscription_id,
    {{ json_text_field('properties', "'customer_id'") }} as customer_id,
    {{ json_text_field('properties', "'status'") }} as status,
    {{ json_text_field('properties', "'currency'") }} as currency,
    {{ growthos_try_cast(json_text_field('properties', "'mrr_normalized'"), dbt.type_float()) }} as mrr,
    {{ json_text_field('properties', "'plan_interval'") }} as plan_interval,
    {{ growthos_try_cast(json_text_field('properties', "'current_period_end'"), dbt.type_timestamp()) }} as current_period_end,
    ({{ json_text_field('properties', "'cancel_at_period_end'") }} = 'true') as cancel_at_period_end,
    {{ growthos_try_cast(json_text_field('properties', "'canceled_at'"), dbt.type_timestamp()) }} as canceled_at,
    {{ growthos_try_cast(json_text_field('properties', "'started_at'"), dbt.type_timestamp()) }} as started_at
from {{ ref('entities') }}
where schema_name = 'stripe_subscription'
