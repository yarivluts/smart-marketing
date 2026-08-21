-- DuckDB-only (KAN-18): asserts exact hand-computed values against the
-- fixture seed's synthetic `proj_13` scenario, which only exists in the
-- DuckDB dev target.
{{ config(enabled=(target.type == 'duckdb')) }}
-- A dbt test query returning zero rows passes. 2026-08-21 KAN-59
-- follow-up AC-equivalent: "mrr_movements/expansion_mrr/churned_mrr/
-- collected_revenue/total_charges/failed_charges/new_paying all countable
-- straight off a real warehouse table." `seeds/raw_records.csv`'s `proj_13`
-- scenario (see `raw_records.yml`'s own description) grouped by `type`,
-- since asserting every row's own `ts` would be far more verbose than the
-- aggregates the SaaS pack's own metrics actually read:
--
--   charge (4 rows, all of sub_1301/sub_1302's charges regardless of
--     status): amounts 100 + 150 + 80 (failed) + 80 = 410.
--   first_charge (2 rows, one per customer's earliest succeeded charge):
--     amounts 100 (cust_1301) + 80 (cust_1302) = 180.
--   new (5 rows: sub_1301's trial->active convert, sub_1302's initial
--     activation, sub_1302's reactivation, sub_1303's initial activation,
--     sub_1303's past_due->active reactivation): mrr_delta
--     100 + 80 + 80 + 60 + 60 = 380.
--   upgrade (1 row: sub_1301's mrr 100 -> 150): mrr_delta 50.
--   downgrade (3 rows: sub_1301's cancellation losing 150, sub_1302's
--     cancellation losing 80, sub_1303's lapse into past_due losing 60):
--     mrr_delta -150 + -80 + -60 = -290.
with expected(type, row_count, total_mrr_delta, total_amount) as (
    values
        ('charge', 4, 0.0, 410.0),
        ('first_charge', 2, 0.0, 180.0),
        ('new', 5, 380.0, 0.0),
        ('upgrade', 1, 50.0, 0.0),
        ('downgrade', 3, -290.0, 0.0)
),
actual as (
    select
        type,
        count(*) as row_count,
        coalesce(sum(mrr_delta), 0.0) as total_mrr_delta,
        coalesce(sum(amount), 0.0) as total_amount
    from {{ ref('fact_revenue_event') }}
    where project_id = 'proj_13'
    group by 1
)
select * from actual
except
select * from expected

union all

select * from expected
except
select * from actual
