WITH
leaf_signups_current AS (
  SELECT
    DATE_TRUNC(DATE(`ts`), MONTH) AS bucket_date,
    COUNT(DISTINCT `customer_id`) AS value_signups
  FROM `fact_funnel_event`
  WHERE `ts` >= @time_start_current AND `ts` <= @time_end_current AND `step` = @filter_signups_0
  GROUP BY bucket_date
),
leaf_signups_previous AS (
  SELECT
    DATE_TRUNC(DATE(`ts`), MONTH) AS bucket_date,
    COUNT(DISTINCT `customer_id`) AS value_signups
  FROM `fact_funnel_event`
  WHERE `ts` >= @time_start_previous AND `ts` <= @time_end_previous AND `step` = @filter_signups_0
  GROUP BY bucket_date
)
SELECT
  'current' AS period,
  bucket_date,
  value_signups AS `signups`
FROM leaf_signups_current
UNION ALL
SELECT
  'previous' AS period,
  bucket_date,
  value_signups AS `signups`
FROM leaf_signups_previous
ORDER BY period, bucket_date
