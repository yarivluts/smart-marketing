WITH
leaf_signups_current AS (
  SELECT
    DATE_TRUNC(DATE(`ts`), MONTH) AS bucket_date,
    `geo` AS `geo`,
    COUNT(DISTINCT `customer_id`) AS value_signups
  FROM `fact_funnel_event`
  WHERE `ts` >= @time_start_current AND `ts` <= @time_end_current AND `step` = @filter_signups_0 AND `geo` = @qfilter_0
  GROUP BY bucket_date, `geo`
)
SELECT
  bucket_date,
  `geo`,
  value_signups AS `signups`
FROM leaf_signups_current
ORDER BY bucket_date, `geo`
