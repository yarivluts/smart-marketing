-- A dbt test query returning zero rows passes. `proj_1`'s `cust_1` signup
-- and activated events (`seeds/raw_records.csv`) have no registered identity
-- keys and no touchpoint ever landed for that project at all, so
-- `bridge_identity` has zero rows there -- every conversion must still fall
-- back to one `unattributed` row per model rather than being silently
-- dropped (a channel breakdown's denominator has to include every
-- conversion, not just the ones with captured marketing entry).
with expected(conversion_event, model, channel_id, campaign_id) as (
    values
        ('signup', 'first_touch', 'unattributed', cast(null as varchar)),
        ('signup', 'last_touch', 'unattributed', cast(null as varchar)),
        ('activated', 'first_touch', 'unattributed', cast(null as varchar)),
        ('activated', 'last_touch', 'unattributed', cast(null as varchar))
),
actual as (
    select conversion_event, model, channel_id, campaign_id
    from {{ ref('fact_attribution') }}
    where project_id = 'proj_1' and customer_id = 'cust_1'
)
select * from actual
except
select * from expected

union all

select * from expected
except
select * from actual
