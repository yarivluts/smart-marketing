-- A dbt test query returning zero rows passes. `fact_cohort_retention.
-- retention_rate` is `retained_count / cohort_size` — it should never fall
-- outside [0, 1], `retained_count` should never exceed `cohort_size`, and
-- `cohort_size`/`period_number` should never be negative.
select *
from {{ ref('fact_cohort_retention') }}
where retention_rate < 0
   or retention_rate > 1
   or retained_count > cohort_size
   or cohort_size <= 0
   or period_number < 0
