-- BigQuery-disabled (KAN-18 follow-up): this model transitively depends on
-- the `schema_identity_fields` seed, a DuckDB-only fixture whose real
-- warehouse export (SchemaDefModel.field_defs where is_identity_key) has
-- not been built yet -- see dbt_project.yml's seeds.+enabled note. Until
-- that export exists, the whole identity/attribution chain (this model and
-- everything downstream of it) builds only against the DuckDB dev target.
{{ config(enabled=(target.type == 'duckdb')) }}
-- Landing-page performance: visitors and attributed conversions per
-- (day x landing page x campaign x channel), the grain a "which landing
-- page converts best in which campaign?" board queries.
--
-- Why a dedicated fact table rather than two metrics over two tables: the
-- metrics compiler (KAN-41) has no join graph — every metric's aggregation
-- names exactly one table (see `metrics-compiler/compiler.ts`). A
-- conversion *rate* per landing page therefore needs its numerator and
-- denominator pre-joined onto one row here, which is also what makes the
-- rate honest: both sides are resolved from the same touchpoint population
-- rather than two independently-filtered queries a consumer might
-- accidentally misalign.
--
-- **Visitors** are distinct anonymous ids that *landed* on that page from
-- that campaign that day — straight off `touchpoint` events, no identity
-- resolution. This is deliberately the raw entry population: it is the
-- denominator a marketer means by "conversion rate of this page", and it is
-- available even for pages that never converted anyone (which is exactly
-- the row you need to see).
--
-- **Conversions** come from `fact_attribution` filtered to `last_touch`.
-- Last-touch is the right (and only defensible cheap) model for a landing
-- page question: it credits the page the visitor was actually on before
-- converting. Counting both models here would double every conversion;
-- exposing first-touch as well would need a `model` column in the grain,
-- which would then double the `visitors` side too — so this model commits
-- to one, and says so, rather than shipping a number whose meaning depends
-- on a filter the board might forget to set. First-touch remains available
-- on `fact_attribution` itself for channel-level questions.
--
-- Conversions are dated by **conversion time**, not by the landing time of
-- the touchpoint that earned the credit. A page's row for a given day
-- therefore mixes visitors who landed that day with conversions that
-- happened that day from possibly-earlier landings. That is the standard
-- reporting-period convention (and the only one computable without picking
-- an attribution window), but it means the rate is only a true
-- visitor-to-conversion rate once a period is long enough to swallow the
-- typical lag — a genuinely delayed funnel (signup today, paid in two
-- weeks) will read low on short ranges. Documented rather than "fixed":
-- cohorting conversions back to landing day is a real modeling decision
-- (which window? which event?), not a detail to guess at here.
--
-- Rows are emitted for every (day, page, campaign, channel) that had
-- EITHER visitors or conversions — a full outer join — so a page with
-- traffic and zero conversions is a visible zero-conversion row rather
-- than a silently missing one, and a conversion whose touchpoint predates
-- the reporting window still appears rather than vanishing.

with landings as (
    select
        organization_id,
        project_id,
        environment_id,
        cast(occurred_at as date) as activity_date,
        coalesce({{ json_text_field('properties', "'landing_page'") }}, '(unknown)') as landing_page,
        coalesce({{ json_text_field('properties', "'utm_campaign'") }}, '(none)') as campaign_id,
        coalesce({{ json_text_field('properties', "'channel'") }}, 'unknown') as channel_id,
        entity_id as anon_id
    from {{ ref('events') }}
    where event_type = 'touchpoint'
),

visitors as (
    select
        organization_id,
        project_id,
        environment_id,
        activity_date,
        landing_page,
        campaign_id,
        channel_id,
        count(distinct anon_id) as visitors
    from landings
    group by 1, 2, 3, 4, 5, 6, 7
),

-- `channel_id = 'unattributed'` rows are conversions with no touchpoint at
-- all; they have no landing page to report on and are excluded rather than
-- piled into `(unknown)`, which is reserved for touchpoints that DID
-- happen but carried no `landing_page` value.
conversions as (
    select
        organization_id,
        project_id,
        environment_id,
        cast(occurred_at as date) as activity_date,
        coalesce(landing_page, '(unknown)') as landing_page,
        coalesce(campaign_id, '(none)') as campaign_id,
        channel_id,
        count(*) as conversions
    from {{ ref('fact_attribution') }}
    where model = 'last_touch'
      and channel_id != 'unattributed'
    group by 1, 2, 3, 4, 5, 6, 7
)

select
    {{ surrogate_key([
        'coalesce(v.organization_id, c.organization_id)',
        'coalesce(v.project_id, c.project_id)',
        'coalesce(v.environment_id, c.environment_id)',
        'coalesce(v.activity_date, c.activity_date)',
        'coalesce(v.landing_page, c.landing_page)',
        'coalesce(v.campaign_id, c.campaign_id)',
        'coalesce(v.channel_id, c.channel_id)'
    ]) }} as landing_page_performance_key,
    coalesce(v.organization_id, c.organization_id) as organization_id,
    coalesce(v.project_id, c.project_id) as project_id,
    coalesce(v.environment_id, c.environment_id) as environment_id,
    coalesce(v.activity_date, c.activity_date) as activity_date,
    coalesce(v.landing_page, c.landing_page) as landing_page,
    coalesce(v.campaign_id, c.campaign_id) as campaign_id,
    coalesce(v.channel_id, c.channel_id) as channel_id,
    coalesce(v.visitors, 0) as visitors,
    coalesce(c.conversions, 0) as conversions
from visitors v
full outer join conversions c
    on c.organization_id = v.organization_id
    and c.project_id = v.project_id
    and c.environment_id = v.environment_id
    and c.activity_date = v.activity_date
    and c.landing_page = v.landing_page
    and c.campaign_id = v.campaign_id
    and c.channel_id = v.channel_id
