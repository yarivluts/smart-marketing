WITH
leaf_lp_conversions_current AS (
  SELECT
    CAST(@time_start_current AS DATE) AS bucket_date,
    `campaign` AS `campaign`,
    COUNT(*) AS value_lp_conversions
  FROM `fact_funnel_event`
  WHERE DATE(`ts`) >= @time_start_current AND DATE(`ts`) <= @time_end_current AND `step` = @filter_lp_conversions_0
  GROUP BY `campaign`
),
leaf_lp_visitors_current AS (
  SELECT
    CAST(@time_start_current AS DATE) AS bucket_date,
    `campaign` AS `campaign`,
    COUNT(*) AS value_lp_visitors
  FROM `fact_funnel_event`
  WHERE DATE(`ts`) >= @time_start_current AND DATE(`ts`) <= @time_end_current AND `step` = @filter_lp_visitors_0
  GROUP BY `campaign`
)
SELECT
  bucket_date,
  `campaign`,
  SAFE_DIVIDE(value_lp_conversions, value_lp_visitors) AS `lp_conversion_rate`
FROM leaf_lp_conversions_current
  FULL JOIN leaf_lp_visitors_current USING (bucket_date, `campaign`)
ORDER BY bucket_date, `campaign`
