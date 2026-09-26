WITH
leaf_lp_conversions_current AS (
  SELECT
    CAST(@time_start_current AS DATE) AS bucket_date,
    COUNT(*) AS value_lp_conversions
  FROM `fact_funnel_event`
  WHERE DATE(`ts`) >= @time_start_current AND DATE(`ts`) <= @time_end_current AND `step` = @filter_lp_conversions_0
  HAVING COUNT(*) > 0
),
leaf_lp_visitors_current AS (
  SELECT
    CAST(@time_start_current AS DATE) AS bucket_date,
    COUNT(*) AS value_lp_visitors
  FROM `fact_funnel_event`
  WHERE DATE(`ts`) >= @time_start_current AND DATE(`ts`) <= @time_end_current AND `step` = @filter_lp_visitors_0
  HAVING COUNT(*) > 0
),
leaf_lp_conversions_previous AS (
  SELECT
    CAST(@time_start_previous AS DATE) AS bucket_date,
    COUNT(*) AS value_lp_conversions
  FROM `fact_funnel_event`
  WHERE DATE(`ts`) >= @time_start_previous AND DATE(`ts`) <= @time_end_previous AND `step` = @filter_lp_conversions_0
  HAVING COUNT(*) > 0
),
leaf_lp_visitors_previous AS (
  SELECT
    CAST(@time_start_previous AS DATE) AS bucket_date,
    COUNT(*) AS value_lp_visitors
  FROM `fact_funnel_event`
  WHERE DATE(`ts`) >= @time_start_previous AND DATE(`ts`) <= @time_end_previous AND `step` = @filter_lp_visitors_0
  HAVING COUNT(*) > 0
)
SELECT
  'current' AS period,
  bucket_date,
  SAFE_DIVIDE(value_lp_conversions, value_lp_visitors) AS `lp_conversion_rate`
FROM leaf_lp_conversions_current
  FULL JOIN leaf_lp_visitors_current USING (bucket_date)
UNION ALL
SELECT
  'previous' AS period,
  bucket_date,
  SAFE_DIVIDE(value_lp_conversions, value_lp_visitors) AS `lp_conversion_rate`
FROM leaf_lp_conversions_previous
  FULL JOIN leaf_lp_visitors_previous USING (bucket_date)
ORDER BY period, bucket_date
