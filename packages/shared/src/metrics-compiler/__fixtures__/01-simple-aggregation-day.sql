WITH
leaf_ad_spend_current AS (
  SELECT
    DATE_TRUNC(DATE(`date`), DAY) AS bucket_date,
    SUM(`reporting_spend`) AS value_ad_spend
  FROM `fact_ad_spend`
  WHERE `date` >= @time_start_current AND `date` <= @time_end_current
  GROUP BY bucket_date
)
SELECT
  bucket_date,
  value_ad_spend AS `ad_spend`
FROM leaf_ad_spend_current
ORDER BY bucket_date
