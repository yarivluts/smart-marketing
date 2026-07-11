-- A dbt test query returning zero rows passes. `dau_mau_ratio` is
-- `dau / active_customers_l_n`; by construction (see the model's own doc
-- comment) `dau` can never exceed `active_customers_l_n`, and neither raw
-- count can be zero or negative for any row this model emits, so the ratio
-- should never fall outside (0, 1].
select *
from {{ ref('fact_engagement_daily') }}
where dau_mau_ratio <= 0
   or dau_mau_ratio > 1
   or dau > active_customers_l_n
   or dau <= 0
   or active_customers_l_n <= 0
