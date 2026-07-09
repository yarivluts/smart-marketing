-- A dbt test query returning zero rows passes. KAN-56 AC: "Synthetic
-- fixtures: anon -> signup -> purchase stitched correctly." `seeds/raw_records.csv`
-- carries a hand-built identity journey under `proj_2` covering every branch
-- of `bridge_identity`'s conflict rule (see that model's own doc comment):
--
--   anon_abc  -> cust_3 : anon->signup->purchase, the AC's own scenario —
--                         direct `anon_id_cooccurrence` wins over a
--                         conflicting weaker `click_id` link to cust_4,
--                         confidence stays 1.0, is_conflicted still flagged
--                         so the losing candidate is auditable.
--   anon_xyz  -> cust_4 : direct and shared-key evidence agree -> unconflicted.
--   anon_qrs  -> cust_5 : no direct declaration at all; two customers
--                         (cust_5, cust_6) share `device_id = dev_1` ->
--                         resolved by earliest evidence, confidence drops
--                         to the documented 0.5 tie-break value.
--   anon_lmn  -> cust_7 : a single, unconflicted shared `email_hash` link
--                         with no direct declaration -> confidence 1.0.
--   anon_other5/6/7      : each customer's own first-party anon_id, clean.
--
-- Expressed as an EXCEPT diff against the expected table rather than one
-- assertion per row, so any unexpected row (missing, extra, or with a wrong
-- field) fails the test.
with expected(anon_id, customer_id, method, confidence, is_conflicted) as (
    values
        ('anon_abc', 'cust_3', 'anon_id_cooccurrence', 1.0, true),
        ('anon_xyz', 'cust_4', 'anon_id_cooccurrence', 1.0, false),
        ('anon_qrs', 'cust_5', 'shared_key:device_id', 0.5, true),
        ('anon_lmn', 'cust_7', 'shared_key:email_hash', 1.0, false),
        ('anon_other5', 'cust_5', 'anon_id_cooccurrence', 1.0, false),
        ('anon_other6', 'cust_6', 'anon_id_cooccurrence', 1.0, false),
        ('anon_other7', 'cust_7', 'anon_id_cooccurrence', 1.0, false)
),
actual as (
    select anon_id, customer_id, method, confidence, is_conflicted
    from {{ ref('bridge_identity') }}
    where project_id = 'proj_2'
)
select * from actual
except
select * from expected

union all

select * from expected
except
select * from actual
