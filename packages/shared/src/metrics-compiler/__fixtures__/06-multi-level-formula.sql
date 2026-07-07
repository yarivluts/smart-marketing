WITH
leaf_arpa_current AS (
  SELECT
    DATE_TRUNC(DATE(`ts`), QUARTER) AS bucket_date,
    AVG(`amount`) AS value_arpa
  FROM `fact_revenue_event`
  WHERE `ts` >= @time_start_current AND `ts` <= @time_end_current
  GROUP BY bucket_date
),
leaf_gross_margin_current AS (
  SELECT
    DATE_TRUNC(DATE(`ts`), QUARTER) AS bucket_date,
    AVG(`margin_pct`) AS value_gross_margin
  FROM `fact_revenue_event`
  WHERE `ts` >= @time_start_current AND `ts` <= @time_end_current
  GROUP BY bucket_date
),
leaf_revenue_churn_rate_current AS (
  SELECT
    DATE_TRUNC(DATE(`started_at`), QUARTER) AS bucket_date,
    AVG(`churn_rate`) AS value_revenue_churn_rate
  FROM `dim_subscription`
  WHERE `started_at` >= @time_start_current AND `started_at` <= @time_end_current
  GROUP BY bucket_date
),
leaf_ad_spend_current AS (
  SELECT
    DATE_TRUNC(DATE(`date`), QUARTER) AS bucket_date,
    SUM(`reporting_spend`) AS value_ad_spend
  FROM `fact_ad_spend`
  WHERE `date` >= @time_start_current AND `date` <= @time_end_current
  GROUP BY bucket_date
),
leaf_new_paying_current AS (
  SELECT
    DATE_TRUNC(DATE(`ts`), QUARTER) AS bucket_date,
    COUNT(DISTINCT `customer_id`) AS value_new_paying
  FROM `fact_revenue_event`
  WHERE `ts` >= @time_start_current AND `ts` <= @time_end_current AND `type` = @filter_new_paying_0
  GROUP BY bucket_date
)
SELECT
  bucket_date,
  SAFE_DIVIDE(SAFE_DIVIDE((value_arpa * value_gross_margin), value_revenue_churn_rate), SAFE_DIVIDE(value_ad_spend, value_new_paying)) AS `ltv_to_cac`
FROM leaf_arpa_current
  FULL JOIN leaf_gross_margin_current USING (bucket_date)
  FULL JOIN leaf_revenue_churn_rate_current USING (bucket_date)
  FULL JOIN leaf_ad_spend_current USING (bucket_date)
  FULL JOIN leaf_new_paying_current USING (bucket_date)
ORDER BY bucket_date
