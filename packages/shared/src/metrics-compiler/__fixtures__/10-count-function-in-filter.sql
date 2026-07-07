WITH
leaf_orders_current AS (
  SELECT
    DATE_TRUNC(DATE(`placed_at`), DAY) AS bucket_date,
    COUNT(*) AS value_orders
  FROM `fact_order`
  WHERE `placed_at` >= @time_start_current AND `placed_at` <= @time_end_current AND `channel` IN UNNEST(@qfilter_0)
  GROUP BY bucket_date
)
SELECT
  bucket_date,
  value_orders AS `orders`
FROM leaf_orders_current
ORDER BY bucket_date
