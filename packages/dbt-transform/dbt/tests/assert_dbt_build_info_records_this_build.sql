-- KAN-204: `dbt_build_info` holds exactly one row, and it names the build that
-- just ran - the SHA this process was given when that is a git hash, NULL when it
-- is not (unset, empty, an unsubstituted `${_GIT_SHA}`). A second row would make
-- "the" build ambiguous to the API that reports it; a SHA that disagrees with the
-- environment would make the drift check compare the wrong commit.
--
-- Runs on every target: on BigQuery it scans a one-row table.
{%- set raw_sha = env_var('GIT_SHA', '') | trim | lower -%}
{%- set expected = raw_sha if modules.re.fullmatch('[0-9a-f]{7,40}', raw_sha) else '' %}

with info as (
    select * from {{ ref('dbt_build_info') }}
),

row_count as (
    select count(*) as n from info
)

select 'expected exactly one row' as failure
from row_count
where n <> 1

union all

select 'build_sha does not match GIT_SHA' as failure
from info
where coalesce(build_sha, '') <> '{{ expected }}'
