-- DuckDB-only: asserts the fixture seed (proj_24).
{{ config(enabled=(target.type == 'duckdb')) }}
-- B12 (2026-09-25): an integrator following the documented ingest contract
-- ({event_id, event, ts, properties}, identity in properties) got zero
-- landing-page conversions. `proj_24` reproduces EasySign's browser E2E:
--
--   v1: touchpoint (per-event id, anon_id in properties) on "/" from camp_x,
--       two page_views and a CTA click (anonymous), then a signup declaring
--       anon_id v1 + customer_id u1, then a document_created for u1.
--   v2: same page and campaign, a page_view, never signs up.
--
-- Expected: 2 visitors, 1 conversion. Not 0 (the bug: identity never
-- resolved), and not 5 or 6 (every attributed event counted, which is what
-- fixing the join alone would have produced). v2's anonymous page_view must
-- not mint a phantom customer.
with expected_lp(landing_page, campaign_id, channel_id, visitors, conversions) as (
    values ('/', 'camp_x', 'paid_search', 2, 1)
),
actual_lp as (
    select landing_page, campaign_id, channel_id, visitors, conversions
    from {{ ref('fact_landing_page_performance') }}
    where project_id = 'proj_24'
),
expected_bridge(anon_id, customer_id, is_conflicted) as (
    values ('v1', 'u1', false)
),
actual_bridge as (
    select anon_id, customer_id, is_conflicted
    from {{ ref('bridge_identity') }}
    where project_id = 'proj_24'
),
-- The signup is credited to camp_x through identity; the anonymous
-- page_views reach the touchpoint only directly, never through identity.
signup_credit as (
    select count(*) as n
    from {{ ref('fact_attribution') }}
    where project_id = 'proj_24'
      and model = 'last_touch'
      and conversion_event = 'signup'
      and customer_id = 'u1'
      and campaign_id = 'camp_x'
      and via_identity
),
anonymous_via_identity as (
    select count(*) as n
    from {{ ref('fact_attribution') }}
    where project_id = 'proj_24'
      and conversion_event in ('page_view', 'cta_click')
      and via_identity
)
select 'lp_missing' as failure, landing_page as detail from (select * from expected_lp except select * from actual_lp) m
union all
select 'lp_unexpected', landing_page from (select * from actual_lp except select * from expected_lp) u
union all
select 'bridge_missing', anon_id from (select * from expected_bridge except select * from actual_bridge) bm
union all
select 'bridge_unexpected', anon_id from (select * from actual_bridge except select * from expected_bridge) bu
union all
select 'signup_not_credited', cast(n as varchar) from signup_credit where n != 1
union all
select 'anonymous_event_resolved_as_customer', cast(n as varchar) from anonymous_via_identity where n != 0
