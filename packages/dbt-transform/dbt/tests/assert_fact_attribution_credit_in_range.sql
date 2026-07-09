-- A dbt test query returning zero rows passes. `credit` is a share of a
-- conversion's total attribution weight -- both models here award a single
-- touchpoint the whole conversion, but the column exists for the linear/
-- time-decay/position-based models plan `04 §4` lists as future work, so it
-- should never fall outside [0, 1] even as those are added.
select *
from {{ ref('fact_attribution') }}
where credit < 0 or credit > 1
