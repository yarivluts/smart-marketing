-- A dbt test query returning zero rows passes. Every `days_active_bucket`
-- must fall within [1, engagement_window_days] (the model's own full spine
-- range), and `customer_count` — a count — must never be negative.
select *
from {{ ref('fact_engagement_depth_histogram') }}
where customer_count < 0
   or days_active_bucket < 1
   or days_active_bucket > {{ var('engagement_window_days', 28) }}
