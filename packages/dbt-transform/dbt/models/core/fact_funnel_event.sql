-- Generic funnel-event fact (plan `04 §1`'s `fact_funnel_event`, 2026-08-21
-- KAN-59 follow-up): append-only, one row per non-touchpoint event, labeled
-- the same way `fact_attribution.conversion_event`/`fact_funnel_step.
-- event_label` already derive their own label — the payload's own
-- `event_name` field when the schema carries one, falling back to the
-- schema/event_type itself otherwise.
--
-- Unlike `fact_funnel_step` this does NOT require a human-confirmed funnel
-- (`funnel_step_mappings`) — every qualifying event gets a row here, so the
-- SaaS pack's `signups` metric (and the engagement pack's `dau`/`wau`/`mau`,
-- which read this same table unfiltered) work in a project that hasn't gone
-- through the KAN-68 onboarding-wizard funnel-confirmation flow yet.
-- `fact_funnel_step`'s "which stages has this customer reached in MY
-- confirmed funnel" question is a distinct, narrower one this table doesn't
-- replace.

select
    {{ surrogate_key(['organization_id', 'project_id', 'environment_id', 'event_id']) }} as funnel_event_key,
    organization_id,
    project_id,
    environment_id,
    entity_id as customer_id,
    coalesce({{ json_text_field('properties', "'event_name'") }}, event_type) as step,
    occurred_at as ts
from {{ ref('events') }}
where event_type != 'touchpoint'
