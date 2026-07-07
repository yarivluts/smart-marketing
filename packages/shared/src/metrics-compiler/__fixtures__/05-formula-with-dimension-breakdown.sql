WITH
leaf_ad_spend_current AS (
  SELECT
    DATE_TRUNC(DATE(`date`), WEEK) AS bucket_date,
    `channel` AS `channel`,
    SUM(`reporting_spend`) AS value_ad_spend
  FROM `fact_ad_spend`
  WHERE `date` >= @time_start_current AND `date` <= @time_end_current
  GROUP BY bucket_date, `channel`
),
leaf_new_paying_current AS (
  SELECT
    DATE_TRUNC(DATE(`ts`), WEEK) AS bucket_date,
    `channel` AS `channel`,
    COUNT(DISTINCT `customer_id`) AS value_new_paying
  FROM `fact_revenue_event`
  WHERE `ts` >= @time_start_current AND `ts` <= @time_end_current AND `type` = @filter_new_paying_0
  GROUP BY bucket_date, `channel`
)
SELECT
  bucket_date,
  `channel`,
  SAFE_DIVIDE(value_ad_spend, value_new_paying) AS `cac`
FROM leaf_ad_spend_current
  FULL JOIN leaf_new_paying_current USING (bucket_date, `channel`)
ORDER BY bucket_date, `channel`
