-- Sales-assist workflows: demos pipeline (KAN-92, plan `14 §Gap 9`): one
-- row per landed `demo_event`, flattening the payload's
-- `demo_id`/`stage`/`rep_org_person_id`/`account_name` into real columns,
-- the same "no generic JSON extraction in the compiler" posture
-- `fact_support_ticket_event`/`fact_experiment_event` establish. Feeds the
-- Sales Pipeline pack's `demos_scheduled`/`demos_held`/`demos_no_show`
-- metrics (each filtering this mart's own `stage` column), broken down by
-- `rep_org_person_id`.
--
-- No joins, same shape `fact_support_ticket_event` established: the
-- connector (or admin action) that lands each stage event already knows
-- the demo id, its own stage, and the owning rep, so this mart needs no
-- self-join against a demo's own earlier `scheduled`-stage event.

select
    {{ surrogate_key(['organization_id', 'project_id', 'environment_id', 'event_id']) }} as demo_event_key,
    organization_id,
    project_id,
    environment_id,
    {{ json_text_field('properties', "'demo_id'") }} as demo_id,
    {{ json_text_field('properties', "'stage'") }} as stage,
    {{ json_text_field('properties', "'rep_org_person_id'") }} as rep_org_person_id,
    {{ json_text_field('properties', "'account_name'") }} as account_name,
    occurred_at as ts
from {{ ref('events') }}
where event_type = 'demo_event'
