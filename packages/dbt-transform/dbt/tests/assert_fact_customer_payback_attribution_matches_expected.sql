{{ config(enabled=(target.type == 'duckdb')) }}
-- DuckDB-only (KAN-18): asserts the `channel_id`/`campaign_id` columns
-- (2026-08-25 KAN-86 follow-up) against the fixture seed's synthetic
-- `proj_23` acquisition journey.
--
-- `cust_k1`'s signup declares `anon_id: anon_k1` directly, and `anon_k1`'s
-- own touchpoint (`channel: paid_search`, `utm_campaign: fall_search`)
-- lands before the signup — the customer's only, and therefore last-touch,
-- touchpoint — so `cust_k1`'s acquisition resolves to that campaign.
--
-- `cust_k2` signs up with no touchpoint at all (organic), proving an
-- unattributed acquisition still gets a row (`channel_id = 'unattributed'`,
-- `campaign_id = null`) rather than being dropped or crashing the join.
with expected(customer_id, channel_id, campaign_id) as (
    values
        ('cust_k1', 'paid_search', 'fall_search'),
        ('cust_k2', 'unattributed', cast(null as {{ dbt.type_string() }}))
),
actual as (
    select customer_id, channel_id, campaign_id
    from {{ ref('fact_customer_payback') }}
    where project_id = 'proj_23'
)
select * from actual
except
select * from expected

union all

select * from expected
except
select * from actual
