-- A dbt test query returning zero rows passes. `bridge_identity.confidence`
-- is a probability-like score (KAN-56's model doc comment: 1.0 for a direct
-- or unconflicted match, 0.5 for a tie-broken purely-shared-key conflict) —
-- it should never fall outside [0, 1].
select *
from {{ ref('bridge_identity') }}
where confidence < 0 or confidence > 1
