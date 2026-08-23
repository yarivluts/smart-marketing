-- DuckDB-only (KAN-18): asserts exact hand-computed values against the
-- fixture seed's synthetic `proj_20` scenario, which only exists in the
-- DuckDB dev target (`bridge_identity`'s registered-identity-key path is
-- itself DuckDB-only, see `stg_identity_key_observations`'s own doc
-- comment).
{{ config(enabled=(target.type == 'duckdb')) }}
-- KAN-84 AC-equivalent: "churn-reason breakdown joined to plan/channel/
-- cohort matches a hand-computed fixture." `seeds/raw_records.csv`'s
-- `proj_20` scenario (see `raw_records.yml`'s own description): a
-- `tiktok`-channel touchpoint (`anon_c1`) linked via a `signup` event's own
-- `anon_id` property to `cust_2001` (registered as an identity key in
-- `schema_identity_fields.csv`), a `month`-interval subscription for that
-- customer, and one `churn_reason` event (`too_expensive`, with free text).
-- Expected: channel resolves to `tiktok` (the only touchpoint), plan
-- resolves to `month` (the only subscription), and cohort_month is
-- `2026-06-01` (the customer's earliest event, the `signup` on 2026-06-02).
with expected(customer_id, category, channel_id, plan, cohort_month) as (
    values
        ('cust_2001', 'too_expensive', 'tiktok', 'month', timestamp '2026-06-01')
),
actual as (
    select customer_id, category, channel_id, plan, cohort_month
    from {{ ref('fact_churn_reason') }}
    where project_id = 'proj_20'
)
select * from actual
except
select * from expected

union all

select * from expected
except
select * from actual
