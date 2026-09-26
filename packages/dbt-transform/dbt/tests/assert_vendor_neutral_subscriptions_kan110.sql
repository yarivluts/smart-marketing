-- DuckDB-only (KAN-18): hand-computed expectations for `proj_27`, the KAN-110 fixture - a billing
-- source with no PSP connector sending the vendor-neutral `subscription_state_change` contract
-- (`properties.mrr` + `currency`, keyed by customer_id). A dbt test returning zero rows passes.
--
--   cust_2701: pro 199 -> unlimited 399 -> pro 199, delivered out of order (the first change
--              landed last). Ordered by the event's own ts: new +199, upgrade +200, downgrade
--              -200. Ordered by landed_at it would read new +399, downgrade -200: the check that
--              changes are dated by when they happened, not when they arrived.
--   cust_2702: pro 199 -> canceled (mrr 0) -> pro 199 again (the source re-sends first_charge):
--              new +199, downgrade -199, new +199, and a reactivate transition.
--   cust_2703: basic 99 -> cancel sent WITHOUT a status field: mrr 0 derives canceled.
--   cust_2704: a v1-only record (mrr_ils, no mrr) - not a state under the contract, so it has
--              no subscription row and no movement.
{{ config(enabled=(target.type == 'duckdb')) }}

with expected_dim(subscription_id, customer_id, status, mrr, currency, canceled_at) as (
    values
        ('cust_2701', 'cust_2701', 'active', 199.0, 'ILS', cast(null as timestamp)),
        ('cust_2702', 'cust_2702', 'active', 199.0, 'ILS', cast(null as timestamp)),
        ('cust_2703', 'cust_2703', 'canceled', 0.0, 'ILS', cast('2026-09-04 12:00:00' as timestamp))
),
actual_dim as (
    select subscription_id, customer_id, status, mrr, currency, canceled_at
    from {{ ref('dim_subscription') }}
    where project_id = 'proj_27'
),
expected_movements(customer_id, type, plan, mrr_delta, ts) as (
    values
        ('cust_2701', 'new', 'pro', 199.0, cast('2026-09-01 10:00:00' as timestamp)),
        ('cust_2701', 'upgrade', 'unlimited', 200.0, cast('2026-09-02 10:00:00' as timestamp)),
        ('cust_2701', 'downgrade', 'pro', -200.0, cast('2026-09-05 10:00:00' as timestamp)),
        ('cust_2702', 'new', 'pro', 199.0, cast('2026-09-01 11:00:00' as timestamp)),
        ('cust_2702', 'downgrade', 'free', -199.0, cast('2026-09-03 11:00:00' as timestamp)),
        ('cust_2702', 'new', 'pro', 199.0, cast('2026-09-06 11:00:00' as timestamp)),
        ('cust_2703', 'new', 'basic', 99.0, cast('2026-09-01 12:00:00' as timestamp)),
        ('cust_2703', 'downgrade', 'free', -99.0, cast('2026-09-04 12:00:00' as timestamp))
),
actual_movements as (
    select customer_id, type, plan, mrr_delta, cast(ts as timestamp) as ts
    from {{ ref('fact_revenue_event') }}
    where project_id = 'proj_27'
),
expected_transitions(customer_id, type, ts) as (
    values ('cust_2702', 'reactivate', cast('2026-09-06 11:00:00' as timestamp))
),
actual_transitions as (
    select customer_id, type, cast(ts as timestamp) as ts
    from {{ ref('fact_subscription_event') }}
    where project_id = 'proj_27'
)

select 'dim_subscription unexpected' as problem, subscription_id as detail from (select * from actual_dim except select * from expected_dim) extra
union all
select 'dim_subscription missing', subscription_id from (select * from expected_dim except select * from actual_dim) missing
union all
select 'fact_revenue_event unexpected', customer_id || ':' || type from (select * from actual_movements except select * from expected_movements) extra
union all
select 'fact_revenue_event missing', customer_id || ':' || type from (select * from expected_movements except select * from actual_movements) missing
union all
select 'fact_subscription_event unexpected', customer_id || ':' || type from (select * from actual_transitions except select * from expected_transitions) extra
union all
select 'fact_subscription_event missing', customer_id || ':' || type from (select * from expected_transitions except select * from actual_transitions) missing
