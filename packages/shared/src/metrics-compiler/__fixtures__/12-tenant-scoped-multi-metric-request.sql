WITH
leaf_ad_spend_current AS (
  SELECT
    DATE_TRUNC(DATE(`date`), DAY) AS bucket_date,
    `channel` AS `channel`,
    SUM(`reporting_spend`) AS value_ad_spend
  FROM `fact_ad_spend`
  WHERE DATE(`date`) >= @time_start_current AND DATE(`date`) <= @time_end_current AND `organization_id` = @tenant_organization_id AND `project_id` = @tenant_project_id
  GROUP BY bucket_date, `channel`
),
leaf_new_paying_current AS (
  SELECT
    DATE_TRUNC(DATE(`ts`), DAY) AS bucket_date,
    `channel` AS `channel`,
    COUNT(DISTINCT `customer_id`) AS value_new_paying
  FROM `fact_revenue_event`
  WHERE DATE(`ts`) >= @time_start_current AND DATE(`ts`) <= @time_end_current AND `organization_id` = @tenant_organization_id AND `project_id` = @tenant_project_id AND `type` = @filter_new_paying_0
  GROUP BY bucket_date, `channel`
)
SELECT
  bucket_date,
  `channel`,
  value_ad_spend AS `ad_spend`,
  value_new_paying AS `new_paying`
FROM leaf_ad_spend_current
  FULL JOIN leaf_new_paying_current USING (bucket_date, `channel`)
ORDER BY bucket_date, `channel`
