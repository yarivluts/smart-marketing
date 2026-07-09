-- Deterministic identity stitching (plan `04 §4`, KAN-56): resolves each
-- anonymous visitor id to the customer identity it shares registered
-- identity-key evidence with. No probabilistic fallback — plan `04 §4`'s
-- "probabilistic fallback with a confidence score" is explicitly a separate,
-- later story; every row here is a deterministic key match.
--
-- "Anonymous" is defined structurally, not by a field: a `client_id` counts
-- as anonymous when it's the client_id of a `touchpoint`-kind-event record
-- (plan `04 §1`'s `fact_touchpoint`, the platform's fixed anonymous-click
-- stream — the one schema name this model treats as a convention rather
-- than reading generically, the same way `stg_raw_records.kind` is a fixed
-- vocabulary elsewhere in this project). Everything else observed under a
-- registered identity key is a "customer-side" identity.
--
-- Two kinds of evidence link an anon_id to a customer_id:
--   1. `anon_id_cooccurrence` (precedence 0, strongest): a record's own
--      payload declares `anon_id`, so that record's own `client_id` is an
--      explicit, first-party assertion of the resolved identity.
--   2. `shared_key:<field_name>` (precedence 10+, ranked by field): an
--      anon-side record and a customer-side record independently carry the
--      same value for some other registered identity key (email_hash,
--      click_id, device_id, ...).
--
-- Conflict rule: an anon_id can accumulate evidence toward more than one
-- distinct customer_id (e.g. a shared device, or two visitors clicking the
-- same ad link). Resolve by (a) lowest precedence wins — any direct
-- `anon_id_cooccurrence` evidence beats every shared-key candidate,
-- regardless of how many shared-key links disagree with it; (b) among
-- links tied at the winning precedence, earliest `observed_at` wins; (c)
-- among those, lowest `customer_id` wins (full determinism, no ties left).
-- `is_conflicted` stays true whenever more than one distinct customer_id had
-- evidence at all, even when the winner is unambiguous by precedence, so a
-- human can audit the losing candidate(s). `confidence` only drops (to a
-- documented 0.5) when the winner itself had to be tie-broken among purely
-- shared-key evidence (no direct declaration exists for that anon_id at
-- all) — a direct declaration keeps full confidence even when disagreeing
-- shared-key evidence also exists.

with observations as (
    select * from {{ ref('stg_identity_key_observations') }}
),

-- client_ids that are structurally anonymous (see doc comment above).
anon_client_ids as (
    select distinct organization_id, project_id, environment_id, client_id
    from {{ ref('stg_raw_records') }}
    where kind = 'event' and schema_name = 'touchpoint'
),

direct_links as (
    select
        organization_id,
        project_id,
        environment_id,
        field_value as anon_id,
        client_id as customer_id,
        'anon_id_cooccurrence' as method,
        0 as precedence,
        observed_at
    from observations
    where field_name = 'anon_id'
),

-- Relative strength of a non-`anon_id` identity-key field as stitching
-- evidence (lower = stronger). A directly-declared `user_id` is treated as
-- strong as an explicit identity assertion; `email_hash` next; click ids
-- (a shared link, not a shared person) next; device ids (a shared device,
-- not necessarily a shared person) weakest of the named types; any other
-- registered/custom field falls back to the weakest tier. Offset by 10 so
-- no shared-key link can ever outrank a `direct_links` (precedence 0) row.
field_precedence as (
    select
        field_name,
        10 + case field_name
            when 'user_id' then 1
            when 'email_hash' then 2
            when 'click_id' then 3
            when 'gclid' then 3
            when 'fbclid' then 3
            when 'ttclid' then 3
            when 'device_id' then 4
            else 5
        end as precedence
    from (select distinct field_name from observations where field_name != 'anon_id') distinct_fields
),

shared_key_links as (
    select
        a.organization_id,
        a.project_id,
        a.environment_id,
        a.client_id as anon_id,
        b.client_id as customer_id,
        'shared_key:' || a.field_name as method,
        p.precedence,
        b.observed_at
    from observations a
    inner join anon_client_ids ac
        on ac.organization_id = a.organization_id
        and ac.project_id = a.project_id
        and ac.environment_id = a.environment_id
        and ac.client_id = a.client_id
    inner join observations b
        on b.organization_id = a.organization_id
        and b.project_id = a.project_id
        and b.environment_id = a.environment_id
        and b.field_name = a.field_name
        and b.field_value = a.field_value
        and b.client_id != a.client_id
    inner join field_precedence p on p.field_name = a.field_name
    left join anon_client_ids bc
        on bc.organization_id = b.organization_id
        and bc.project_id = b.project_id
        and bc.environment_id = b.environment_id
        and bc.client_id = b.client_id
    where a.field_name != 'anon_id'
      -- The other side of the match must be a genuine customer-side
      -- identity, not another anonymous session (two anon visitors sharing
      -- a click id isn't evidence either resolves to a customer).
      and bc.client_id is null
),

all_links as (
    select organization_id, project_id, environment_id, anon_id, customer_id, method, precedence, observed_at
    from direct_links
    union all
    select organization_id, project_id, environment_id, anon_id, customer_id, method, precedence, observed_at
    from shared_key_links
),

-- Collapse every link between one (anon_id, customer_id) pair down to its
-- single best (lowest-precedence, then earliest) piece of evidence.
pair_best as (
    select
        organization_id, project_id, environment_id, anon_id, customer_id,
        min(precedence) as precedence,
        min(observed_at) as observed_at
    from all_links
    group by 1, 2, 3, 4, 5
),

pair_method as (
    select
        organization_id, project_id, environment_id, anon_id, customer_id, method,
        row_number() over (
            partition by organization_id, project_id, environment_id, anon_id, customer_id
            order by precedence asc, observed_at asc
        ) as rn
    from all_links
),

pairs as (
    select
        b.organization_id, b.project_id, b.environment_id, b.anon_id, b.customer_id,
        b.precedence, b.observed_at, m.method
    from pair_best b
    inner join pair_method m
        on m.organization_id = b.organization_id
        and m.project_id = b.project_id
        and m.environment_id = b.environment_id
        and m.anon_id = b.anon_id
        and m.customer_id = b.customer_id
        and m.rn = 1
),

conflict_counts as (
    select organization_id, project_id, environment_id, anon_id, count(distinct customer_id) as candidate_count
    from pairs
    group by 1, 2, 3, 4
),

ranked as (
    select
        p.*,
        cc.candidate_count,
        row_number() over (
            partition by p.organization_id, p.project_id, p.environment_id, p.anon_id
            order by p.precedence asc, p.observed_at asc, p.customer_id asc
        ) as rnk
    from pairs p
    inner join conflict_counts cc
        on cc.organization_id = p.organization_id
        and cc.project_id = p.project_id
        and cc.environment_id = p.environment_id
        and cc.anon_id = p.anon_id
)

select
    -- Deterministic surrogate key, one row per resolved anon_id (same
    -- "fold every column that makes a row distinct into an md5" convention
    -- `stg_raw_records.raw_record_key` already establishes).
    md5(organization_id || '|' || project_id || '|' || environment_id || '|' || anon_id) as bridge_identity_key,
    organization_id,
    project_id,
    environment_id,
    anon_id,
    customer_id,
    method,
    case when candidate_count > 1 and precedence > 0 then 0.5 else 1.0 end as confidence,
    candidate_count > 1 as is_conflicted,
    observed_at as resolved_at
from ranked
where rnk = 1
