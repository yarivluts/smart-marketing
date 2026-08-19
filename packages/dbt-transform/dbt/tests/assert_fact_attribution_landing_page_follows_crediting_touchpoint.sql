-- BigQuery-disabled alongside the identity/attribution chain it tests --
-- see stg_identity_key_observations.sql's own config comment.
{{ config(enabled=(target.type == 'duckdb')) }}
-- A dbt test query returning zero rows passes. Guards that
-- `fact_attribution.landing_page` is the *crediting* touchpoint's own entry
-- URL, not just any touchpoint the conversion could reach — the whole point
-- of the column for landing-page reporting.
--
-- `proj_10`'s fixture (see
-- `assert_fact_attribution_fixture_matches_expected.sql` for its full
-- journey) has one customer reached by two touchpoints on different pages:
-- lp-a first (paid_search), lp-b last (paid_social). So for every one of
-- its conversions the two models must disagree on landing_page in exactly
-- the same direction they already disagree on channel — if the column were
-- wired to the wrong CTE, or coalesced from the wrong row, both models
-- would report the same page.
with expected(conversion_event, model, landing_page) as (
    values
        ('signup', 'first_touch', 'https://example.com/lp-a'),
        ('signup', 'last_touch', 'https://example.com/lp-b'),
        ('purchase', 'first_touch', 'https://example.com/lp-a'),
        ('purchase', 'last_touch', 'https://example.com/lp-b')
),
actual as (
    select conversion_event, model, landing_page
    from {{ ref('fact_attribution') }}
    where project_id = 'proj_10'
)
select * from actual
except
select * from expected

union all

select * from expected
except
select * from actual
