-- Flattens `survey_response` events' JSON `properties` into real columns
-- (KAN-82, plan `14 §Gap 1`) so the metrics compiler -- which only ever
-- emits bare column references against a mart's own flat columns, never
-- generic JSON extraction (see `metrics-compiler/compiler.ts`'s own
-- documented "denormalized mart" assumption) -- can filter/aggregate NPS
-- promoter/detractor counts. Same posture `fact_funnel_event` established
-- for its own `step` column. `survey_type` defaults to `'nps'` when a
-- payload omits it (every survey this codebase's own in-app SDK helper
-- sends today is NPS; a future CSAT survey would send its own explicit
-- `survey_type`, not rely on this fallback). `score` parses to null (not an
-- error) for a malformed/missing value, via the same tolerant
-- `growthos_try_cast` every other mart's own numeric column uses.
select
    {{ surrogate_key(['organization_id', 'project_id', 'environment_id', 'event_id']) }} as survey_response_key,
    organization_id,
    project_id,
    environment_id,
    entity_id as customer_id,
    coalesce({{ json_text_field('properties', "'survey_type'") }}, 'nps') as survey_type,
    {{ growthos_try_cast(json_text_field('properties', "'score'"), dbt.type_float()) }} as score,
    occurred_at as ts
from {{ ref('events') }}
where event_type = 'survey_response'
