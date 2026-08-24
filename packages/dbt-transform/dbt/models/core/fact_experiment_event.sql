-- Experimentation & A/B (Gap 3, KAN-89 slice 1): one row per landed
-- `experiment_exposure`/`experiment_conversion` event, flattening each
-- event's JSON `experiment_key`/`variant_key` into real columns so the
-- metrics compiler (which only ever emits bare column references, never
-- generic JSON extraction) can count/group by them. Feeds the Experiment
-- pack's `experiment_exposures`/`experiment_conversions` metrics, each
-- filtering this mart's own `event_type` column to tell exposures and
-- conversions apart, broken down by `experiment_key`/`variant_key`.
--
-- Both event types carry the same two fields, deliberately: the client
-- library that already bucketed a visitor into a variant is the same one
-- that later fires the goal/conversion event, and is expected to stamp the
-- variant it already knows on both calls (see this story's own schema doc
-- comment, `packages/shared/src/experiments/experiment-schema.ts`, for the
-- tradeoff that buys). That means this mart needs no touchpoint/
-- attribution-style join to know which variant a conversion belongs to —
-- unlike `fact_survey_response`/`fact_cancellation_reason`, which join out
-- to `dim_subscription`/`fact_attribution` for their own breakdown axes,
-- this one is a bare projection over `events` with no joins at all.

select
    {{ surrogate_key(['organization_id', 'project_id', 'environment_id', 'event_id']) }} as experiment_event_key,
    organization_id,
    project_id,
    environment_id,
    entity_id as customer_id,
    event_type,
    {{ json_text_field('properties', "'experiment_key'") }} as experiment_key,
    {{ json_text_field('properties', "'variant_key'") }} as variant_key,
    occurred_at as ts
from {{ ref('events') }}
where event_type in ('experiment_exposure', 'experiment_conversion')
