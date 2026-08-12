-- A dbt test query returning zero rows passes. `seeds/raw_records.csv`
-- carries a hand-built landing-page test under `proj_11`, all on
-- 2026-05-01 — the exact shape the feature exists to answer ("two pages,
-- one campaign: which converts better?"), plus the two edge rows that are
-- easy to get wrong:
--
--   lp-a x summer_search: 3 visitors, 2 convert   (the strong page)
--   lp-b x summer_search: 3 visitors, 1 converts  (same campaign, weak page)
--   lp-a x summer_social: 2 visitors, 0 convert   (same page, other campaign;
--                                                  a zero-conversion row must
--                                                  still be emitted)
--   (unknown) x summer_social: 1 visitor, 0       (a touchpoint that carried
--                                                  no landing_page at all)
--
-- Each converting customer declares its own `anon_id` on the signup, so
-- `bridge_identity` links exactly one anon per customer and every
-- conversion credits the page that anon actually landed on.
with expected(landing_page, campaign_id, channel_id, visitors, conversions) as (
    values
        ('https://example.com/lp-a', 'summer_search', 'paid_search', 3, 2),
        ('https://example.com/lp-b', 'summer_search', 'paid_search', 3, 1),
        ('https://example.com/lp-a', 'summer_social', 'paid_social', 2, 0),
        ('(unknown)', 'summer_social', 'paid_social', 1, 0)
),
actual as (
    select landing_page, campaign_id, channel_id, visitors, conversions
    from {{ ref('fact_landing_page_performance') }}
    where project_id = 'proj_11'
      and activity_date = date '2026-05-01'
)
select * from actual
except
select * from expected

union all

select * from expected
except
select * from actual
