{{ config(enabled=(target.type == 'duckdb')) }}
-- DuckDB-only (KAN-18): asserts exact hand-computed values against the
-- fixture seed's synthetic `proj_20` A/B experiment journey — one
-- `lp_headline_v2` experiment with two `control` visitors (one converts,
-- one doesn't) and two `treatment` visitors (both convert):
--
--   control: 2 exposures, 1 conversion. treatment: 2 exposures, 2 conversions.
with expected(event_type, variant_key, row_count) as (
    values
        ('experiment_exposure', 'control', 2),
        ('experiment_conversion', 'control', 1),
        ('experiment_exposure', 'treatment', 2),
        ('experiment_conversion', 'treatment', 2)
),
actual as (
    select event_type, variant_key, count(*) as row_count
    from {{ ref('fact_experiment_event') }}
    where project_id = 'proj_20'
    group by 1, 2
)
select * from actual
except
select * from expected

union all

select * from expected
except
select * from actual
