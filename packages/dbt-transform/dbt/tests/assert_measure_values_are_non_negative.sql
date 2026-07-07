-- A dbt test query returning zero rows passes. Spend/measure values in this
-- domain should never be negative (a negative `ad_spend` is a data bug, not
-- a legitimate value — refunds/credits belong in `fact_revenue_event`, plan
-- `04 §1`, not folded into a spend measure as a negative number).
select *
from {{ ref('measures') }}
where measure_value < 0
