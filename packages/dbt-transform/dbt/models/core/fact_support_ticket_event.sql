-- Customer-support analytics & team leaderboards (KAN-90, plan `14 §Gap 6`):
-- one row per landed `support_ticket_event`, flattening the payload's
-- `ticket_id`/`stage`/`agent_org_person_id` plus the connector-computed
-- `first_response_seconds`/`resolution_seconds`/`csat_score` deltas into
-- real columns, the same "no generic JSON extraction in the compiler"
-- posture `fact_experiment_event`/`fact_survey_response` establish. Feeds
-- the Customer Support pack's `support_tickets_opened`/
-- `support_tickets_resolved`/`support_avg_first_response_seconds`/
-- `support_avg_resolution_seconds`/`support_avg_csat_score` metrics (each
-- filtering this mart's own `stage` column), broken down by
-- `agent_org_person_id` where meaningful.
--
-- No joins, same shape `fact_experiment_event` established: the connector
-- (or admin action) that lands a `resolved`-stage event already knows the
-- elapsed-time deltas and the resolving agent, so this mart needs no
-- self-join against a ticket's own earlier `opened`-stage event to compute
-- them (see the schema's own doc comment, `packages/shared/src/support/
-- support-ticket-schema.ts`, for the tradeoff that buys).

select
    {{ surrogate_key(['organization_id', 'project_id', 'environment_id', 'event_id']) }} as support_ticket_event_key,
    organization_id,
    project_id,
    environment_id,
    {{ json_text_field('properties', "'ticket_id'") }} as ticket_id,
    {{ json_text_field('properties', "'stage'") }} as stage,
    {{ json_text_field('properties', "'agent_org_person_id'") }} as agent_org_person_id,
    {{ growthos_try_cast(json_text_field('properties', "'first_response_seconds'"), dbt.type_float()) }} as first_response_seconds,
    {{ growthos_try_cast(json_text_field('properties', "'resolution_seconds'"), dbt.type_float()) }} as resolution_seconds,
    {{ growthos_try_cast(json_text_field('properties', "'csat_score'"), dbt.type_float()) }} as csat_score,
    occurred_at as ts
from {{ ref('events') }}
where event_type = 'support_ticket_event'
