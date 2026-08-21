-- DuckDB-only (KAN-18): asserts exact hand-computed values against the
-- fixture seed's synthetic `proj_13` scenario, which only exists in the
-- DuckDB dev target.
{{ config(enabled=(target.type == 'duckdb')) }}
-- A dbt test query returning zero rows passes. 2026-08-21 KAN-59
-- follow-up AC-equivalent: "trial_starts/trial_conversions/reactivations
-- countable straight off a real warehouse table." `seeds/raw_records.csv`'s
-- `proj_13` scenario (see `raw_records.yml`'s own description):
--
--   sub_1301: first snapshot lands `trialing` -> `trial_start`; next
--             snapshot lands `active` -> `convert`. No further lifecycle
--             transition on its `upgrade`/`cancel` snapshots (see
--             `stg_stripe_subscription_history`'s own doc comment for why
--             a cancellation isn't itself a lifecycle-event type).
--   sub_1302: first snapshot lands `active` directly (no trial observed)
--             -> no lifecycle row. Cancels, then reactivates -> `reactivate`.
--   sub_1303: first snapshot lands `active` directly -> no lifecycle row.
--             Lapses to `past_due` (not itself a lifecycle event — see
--             `stg_stripe_subscription_history`'s own doc comment), then
--             recovers to `active` -> `reactivate` (the generalized rule
--             this fixture exists to prove: not just `canceled` -> `active`).
with expected(subscription_id, type) as (
    values
        ('sub_1301', 'trial_start'),
        ('sub_1301', 'convert'),
        ('sub_1302', 'reactivate'),
        ('sub_1303', 'reactivate')
),
actual as (
    select subscription_id, type
    from {{ ref('fact_subscription_event') }}
    where project_id = 'proj_13'
)
select * from actual
except
select * from expected

union all

select * from expected
except
select * from actual
