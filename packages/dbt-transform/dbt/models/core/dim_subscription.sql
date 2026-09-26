-- Subscription dimension (plan `04 §1`'s `dim_subscription`, 2026-08-21
-- KAN-59 follow-up): current-state snapshot per subscription, from two
-- sources (KAN-110):
--
--   stripe:    straight off the generic `entities` core table filtered to
--              `schema_name = 'stripe_subscription'` (KAN-49's Stripe connector
--              - see `mapSubscriptionToEntityRecord`'s own doc comment for
--              exactly what each attribute means and where
--              `started_at`/`plan_interval` come from).
--   canonical: the latest state per subscription from
--              `stg_subscription_history`'s vendor-neutral
--              `subscription_state_change` rows - any billing source without a
--              PSP connector. Keyed by subscription_id, else customer_id.
--              `plan_interval` is null (the contract's `mrr` is already
--              monthly; the plan name is not an interval), `started_at` is the
--              subscription's first observed change, and `canceled_at` is the
--              change that made the latest state canceled.
--
-- `mrr`/`started_at` are the columns the SaaS metric pack's own `mrr`/
-- `trials_active` aggregations target
-- (`packages/firebase-orm-models/.../saas-metric-pack/metrics.ts`).

with stripe as (
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
),

canonical_ranked as (
    select
        *,
        row_number() over (
            partition by organization_id, project_id, environment_id, subscription_id
            order by changed_at desc, raw_record_key desc
        ) as recency_rank,
        min(changed_at) over (
            partition by organization_id, project_id, environment_id, subscription_id
        ) as first_changed_at
    from {{ ref('stg_subscription_history') }}
    where source = 'canonical'
),

canonical as (
    select
        {{ surrogate_key(['organization_id', 'project_id', 'environment_id', "'subscription_state_change'", 'subscription_id']) }} as subscription_key,
        organization_id,
        project_id,
        environment_id,
        subscription_id,
        customer_id,
        status,
        currency,
        mrr_normalized as mrr,
        plan_interval,
        cast(null as {{ dbt.type_timestamp() }}) as current_period_end,
        false as cancel_at_period_end,
        case when status = 'canceled' then changed_at end as canceled_at,
        first_changed_at as started_at
    from canonical_ranked
    where recency_rank = 1
)

select * from stripe
union all
select * from canonical
