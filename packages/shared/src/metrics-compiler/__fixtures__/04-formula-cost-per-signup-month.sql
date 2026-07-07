WITH
leaf_ad_spend_current AS (
  SELECT
    DATE_TRUNC(DATE(`date`), MONTH) AS bucket_date,
    SUM(`reporting_spend`) AS value_ad_spend
  FROM `fact_ad_spend`
  WHERE `date` >= @time_start_current AND `date` <= @time_end_current
  GROUP BY bucket_date
),
leaf_signups_current AS (
  SELECT
    DATE_TRUNC(DATE(`ts`), MONTH) AS bucket_date,
    COUNT(DISTINCT `customer_id`) AS value_signups
  FROM `fact_funnel_event`
  WHERE `ts` >= @time_start_current AND `ts` <= @time_end_current AND `step` = @filter_signups_0
  GROUP BY bucket_date
)
SELECT
  bucket_date,
  SAFE_DIVIDE(value_ad_spend, value_signups) AS `cost_per_signup`
FROM leaf_ad_spend_current
  FULL JOIN leaf_signups_current USING (bucket_date)
ORDER BY bucket_date
