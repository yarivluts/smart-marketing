-- A dbt test query returning zero rows passes. KAN-58 AC: "CAC by channel
-- computable; model labeled in API response." `seeds/raw_records.csv` carries
-- a hand-built two-channel journey under `proj_10`:
--
--   anon_j1 touches via paid_search (utm_campaign=spring_search) on 04-01.
--   anon_j2 touches via paid_social (utm_campaign=spring_social) on 04-03,
--   then directly declares `anon_id=anon_j2` on a signup a few minutes
--   later -- `bridge_identity` links anon_j2 to cust_j1 directly, and
--   anon_j1 to cust_j1 via the device id the signup and anon_j1's own
--   touchpoint share. A purchase follows two days later with no further
--   touchpoint.
--
-- Both conversions (signup, purchase) therefore see the *same* two
-- candidate touchpoints, so first-touch (earliest: paid_search) and
-- last-touch (most recent: paid_social) genuinely diverge for each one --
-- the concrete proof that the two models aren't computing the same number
-- twice under different labels.
with expected(conversion_event, model, channel_id, campaign_id, occurred_at) as (
    values
        ('signup', 'first_touch', 'paid_search', 'spring_search', timestamp '2026-04-03 09:10:00'),
        ('signup', 'last_touch', 'paid_social', 'spring_social', timestamp '2026-04-03 09:10:00'),
        ('purchase', 'first_touch', 'paid_search', 'spring_search', timestamp '2026-04-05 12:00:00'),
        ('purchase', 'last_touch', 'paid_social', 'spring_social', timestamp '2026-04-05 12:00:00')
),
actual as (
    select conversion_event, model, channel_id, campaign_id, occurred_at
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
