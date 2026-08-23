{{ config(enabled=(target.type == 'duckdb')) }}
-- DuckDB-only (KAN-18): asserts exact hand-computed values against the
-- fixture seed's synthetic `proj_17` firmographic-enrichment journey, which
-- only exists in the DuckDB dev target.
--
-- `cust_fm1` self-reports a firmographic profile and has an active monthly
-- `stripe_subscription` (mrr_normalized=200) starting the same day, so its
-- row must resolve mrr=200 from `dim_subscription`.
--
-- `cust_fm2` self-reports a profile with no subscription ever landed for
-- it -- proving the left join never drops a firmographic row for a missing
-- dimension: mrr is null (no `dim_subscription` join match), while
-- `industry`/`employee_count_range`/`region` still land fine.
with expected(customer_id, company_name, industry, employee_count_range, region, mrr) as (
    values
        ('cust_fm1', 'Acme Software Labs', 'saas_software', '51-200', 'north_america', 200.0),
        ('cust_fm2', 'Sunrise Health Clinic', 'healthcare', '11-50', 'europe', cast(null as double))
),
actual as (
    select customer_id, company_name, industry, employee_count_range, region, mrr
    from {{ ref('fact_company_firmographic') }}
    where project_id = 'proj_17'
)
select * from actual
except
select * from expected

union all

select * from expected
except
select * from actual
