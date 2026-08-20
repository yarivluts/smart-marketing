-- BigQuery-disabled (KAN-18/KAN-75 follow-up): this model transitively
-- depends on the `funnel_step_mappings` seed, a DuckDB-only fixture whose
-- real warehouse export (OnboardingStateModel.funnel_steps) has not been
-- built yet -- see that seed's own description and dbt_project.yml's
-- seeds.+enabled note. Same posture as bridge_identity/fact_attribution.
{{ config(enabled=(target.type == 'duckdb')) }}
-- Step-conversion funnel (plan `04 §1`'s `fact_funnel_event`, generalized;
-- KAN-75's `query_funnel` follow-up): one row per (customer, funnel stage)
-- the customer ever reached, keyed to a human-confirmed funnel
-- (`funnel_step_mappings`, standing in for KAN-68's onboarding-wizard
-- `OnboardingStateModel.funnel_steps` export).
--
-- Every non-touchpoint event is labeled the same way
-- `fact_attribution.conversion_event` already derives its own label:
-- the payload's own `event_name` field when the schema carries one,
-- falling back to the schema/event_type itself otherwise. That label is
-- matched against the project's confirmed funnel; an event whose label
-- isn't part of the confirmed funnel contributes no row here (a project
-- can log plenty of events that aren't funnel steps at all).
--
-- Grain is "first time a customer reached a stage", not raw event count:
-- a customer re-firing the same step event (e.g. logging in again after
-- `activated` already fired) must not inflate a step-conversion count.
-- `event_count` keeps the raw firing count alongside, for anyone who wants
-- it. A customer can reach a later stage without an earlier one ever
-- firing for them (e.g. a signup that happened before this funnel was
-- confirmed) -- this model doesn't require or synthesize the missing step,
-- it just reports whatever stages were actually observed; `query_funnel`'s
-- own step-conversion counting is what makes "how many of stage N-1's
-- customers reached stage N" meaningful, not a constraint enforced here.

with labeled_events as (
    select
        organization_id,
        project_id,
        environment_id,
        entity_id as customer_id,
        coalesce({{ json_text_field('properties', "'event_name'") }}, event_type) as event_label,
        occurred_at
    from {{ ref('events') }}
    where event_type != 'touchpoint'
),

mapped_events as (
    select
        le.organization_id,
        le.project_id,
        le.environment_id,
        le.customer_id,
        fsm.stage_key,
        fsm.step_order,
        le.occurred_at
    from labeled_events le
    inner join {{ ref('funnel_step_mappings') }} fsm
        on fsm.organization_id = le.organization_id
        and fsm.project_id = le.project_id
        and fsm.event_label = le.event_label
),

first_reached as (
    select
        organization_id,
        project_id,
        environment_id,
        customer_id,
        stage_key,
        step_order,
        min(occurred_at) as reached_at,
        count(*) as event_count
    from mapped_events
    group by 1, 2, 3, 4, 5, 6
)

select
    -- One row per (project_id, environment_id, customer_id, stage_key), the
    -- same "fold every column that makes a row distinct into an md5"
    -- convention `bridge_identity_key`/`attribution_key` already use.
    {{ surrogate_key(['organization_id', 'project_id', 'environment_id', 'customer_id', 'stage_key']) }} as funnel_step_key,
    organization_id,
    project_id,
    environment_id,
    customer_id,
    stage_key,
    step_order,
    reached_at,
    event_count
from first_reached
