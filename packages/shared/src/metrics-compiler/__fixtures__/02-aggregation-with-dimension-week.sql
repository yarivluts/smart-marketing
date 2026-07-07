WITH
leaf_ad_spend_current AS (
  SELECT
    DATE_TRUNC(DATE(`date`), WEEK) AS bucket_date,
    `channel` AS `channel`,
    SUM(`reporting_spend`) AS value_ad_spend
  FROM `fact_ad_spend`
  WHERE `date` >= @time_start_current AND `date` <= @time_end_current
  GROUP BY bucket_date, `channel`
)
SELECT
  bucket_date,
  `channel`,
  value_ad_spend AS `ad_spend`
FROM leaf_ad_spend_current
ORDER BY bucket_date, `channel`
