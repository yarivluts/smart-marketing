-- DuckDB-only (KAN-18): asserts exact hand-computed values against the
-- fixture seed's synthetic `proj_13` scenario, which only exists in the
-- DuckDB dev target.
{{ config(enabled=(target.type == 'duckdb')) }}
-- A dbt test query returning zero rows passes. 2026-08-21 KAN-59
-- follow-up AC-equivalent: "current subscription state matches a
-- hand-computed fixture." `seeds/raw_records.csv`'s `proj_13` scenario
-- (see `raw_records.yml`'s own description):
--
--   sub_1301: trialing (mrr 0) -> active (mrr 100) -> active (mrr 150,
--             upgrade) -> canceled. Current state: canceled, mrr 150
--             (the last-observed rate before cancellation — `dim_subscription`
--             reports the latest landed snapshot's own value, it doesn't
--             zero out a canceled subscription's `mrr` column).
--   sub_1302: active (mrr 80) -> canceled -> active (mrr 80, reactivated).
--             Current state: active, mrr 80.
--   sub_1303: active (mrr 60) -> past_due -> active (mrr 60, reactivated
--             from `past_due`, not `canceled`). Current state: active, mrr 60.
with expected(subscription_id, status, mrr, plan_interval) as (
    values
        ('sub_1301', 'canceled', 150.0, 'month'),
        ('sub_1302', 'active', 80.0, 'year'),
        ('sub_1303', 'active', 60.0, 'month')
),
actual as (
    select subscription_id, status, mrr, plan_interval
    from {{ ref('dim_subscription') }}
    where project_id = 'proj_13'
)
select * from actual
except
select * from expected

union all

select * from expected
except
select * from actual
