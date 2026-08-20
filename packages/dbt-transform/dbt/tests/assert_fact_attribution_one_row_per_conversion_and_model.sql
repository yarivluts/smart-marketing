-- A dbt test query returning zero rows passes. Every (conversion_event_id,
-- model) pair must resolve to exactly one attribution row -- more than one
-- would double- (or under-) count a conversion in a channel breakdown; the
-- model's own join (a `bridge_identity` fan-out to multiple candidate
-- touchpoints) is exactly the kind of bug that would silently duplicate
-- rows here.
select conversion_event_id, model, count(*) as row_count
from {{ ref('fact_attribution') }}
group by 1, 2
having count(*) != 1
