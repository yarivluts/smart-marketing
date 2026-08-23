{{ config(enabled=(target.type == 'duckdb')) }}
-- DuckDB-only (KAN-18): asserts exact hand-computed values against the
-- fixture seed's synthetic `proj_14` NPS journey, which only exists in the
-- DuckDB dev target.
--
-- Six landed responses: promoters (score 10, 9, 9), one passive (8), one
-- detractor (4), and one malformed response with no `score` field at all --
-- exercising `growthos_try_cast`'s null-on-failure tolerance (KAN-82) rather
-- than erroring the model build.
--
--   promoter: 3, passive: 1, detractor: 1, unclassified (null score): 1.
with expected(category, response_count) as (
    values
        ('promoter', 3),
        ('passive', 1),
        ('detractor', 1),
        ('unclassified', 1)
),
actual as (
    select
        case
            when score is null then 'unclassified'
            when score >= 9 then 'promoter'
            when score >= 7 then 'passive'
            else 'detractor'
        end as category,
        count(*) as response_count
    from {{ ref('fact_survey_response') }}
    where project_id = 'proj_14'
    group by 1
)
select * from actual
except
select * from expected

union all

select * from expected
except
select * from actual
