WITH
leaf_ad_spend_current AS (
  SELECT
    DATE_TRUNC(DATE(`date`), DAY) AS bucket_date,
    SUM(`reporting_spend`) AS value_ad_spend
  FROM `fact_ad_spend`
  WHERE `date` >= @time_start_current AND `date` <= @time_end_current AND `organization_id` = @tenant_organization_id AND `project_id` = @tenant_project_id
  GROUP BY bucket_date
)
SELECT
  bucket_date,
  value_ad_spend AS `ad_spend`
FROM leaf_ad_spend_current
ORDER BY bucket_date