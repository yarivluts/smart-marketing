-- A dbt test query returning zero rows passes. `cohort_retention.retention_rate`
-- is `converted_customers / cohort_size` — it should never fall outside
-- [0, 1], and `converted_customers` (a subset of the cohort by construction)
-- should never exceed `cohort_size` itself.
select *
from {{ ref('cohort_retention') }}
where retention_rate < 0
   or retention_rate > 1
   or converted_customers > cohort_size
   or period_index < 0
