-- One row per (raw_record_key, field_name) where the record carries a
-- non-null identity-key value — the evidence stream `bridge_identity`
-- stitches anon visitors to customers from.
--
-- TWO LEGS, split at compile time (same pattern as `stg_raw_records`):
--
-- DuckDB (dev/CI): the full registered-identity-key design (plan `08 §1`:
-- "the stitching engine works off registered identity keys, not hard-coded
-- ones") — joins the `schema_identity_fields` seed (a fixture standing in
-- for a warehouse export of `SchemaDefModel.field_defs` where
-- `is_identity_key = true`) and extracts each registered field by a
-- DATA-DRIVEN JSON path.
--
-- BigQuery (the real warehouse): restricted to the tracking snippet's own
-- identity ENVELOPE — `anon_id` and `customer_id`, the two fields
-- `buildTrackedEvent` attaches to every event (and ingest accepts
-- implicitly on every event schema, see `IMPLICIT_EVENT_ENVELOPE_FIELDS`).
-- Their JSON paths are FIXED literals, which sidesteps the dynamic-path
-- extraction the DuckDB leg leans on. This is a deliberate, documented
-- narrowing, not parity: a snippet-instrumented site (the EasySign case)
-- produces exactly these two fields, so `bridge_identity`'s primary
-- `anon_id_cooccurrence` path and the whole downstream attribution /
-- landing-page chain work on the real warehouse; PROJECT-REGISTERED custom
-- identity keys (user_id/email_hash/...) only participate on the DuckDB
-- leg until the registered-fields export exists (KAN-18 follow-up).
{% if target.type == 'bigquery' %}

with event_records as (
    select
        raw_record_key,
        organization_id,
        project_id,
        environment_id,
        kind,
        schema_name,
        client_id,
        landed_at,
        coalesce(
            {{ growthos_try_cast(json_text_field('payload', "'ts'"), dbt.type_timestamp()) }},
            landed_at
        ) as observed_at,
        {{ json_text_field('payload', "'anon_id'") }} as anon_id_value,
        {{ json_text_field('payload', "'customer_id'") }} as customer_id_value
    from {{ ref('stg_raw_records') }}
    where kind = 'event'
)

select
    raw_record_key,
    organization_id,
    project_id,
    environment_id,
    kind,
    schema_name,
    client_id,
    landed_at,
    observed_at,
    'anon_id' as field_name,
    anon_id_value as field_value
from event_records
where anon_id_value is not null

union all

select
    raw_record_key,
    organization_id,
    project_id,
    environment_id,
    kind,
    schema_name,
    client_id,
    landed_at,
    observed_at,
    'customer_id' as field_name,
    customer_id_value as field_value
from event_records
where customer_id_value is not null

{% else %}

select
    r.raw_record_key,
    r.organization_id,
    r.project_id,
    r.environment_id,
    r.kind,
    r.schema_name,
    r.client_id,
    r.landed_at,
    -- Same "prefer the record's own client-reported `ts`, fall back to
    -- ingest-time `landed_at`" rule `stg_events.occurred_at` already uses,
    -- applied generically here since an identity key can be registered on
    -- any kind, not just events.
    coalesce(
        {{ growthos_try_cast(json_text_field('r.payload', "'ts'"), dbt.type_timestamp()) }},
        r.landed_at
    ) as observed_at,
    f.field_name,
    {{ json_text_field('r.payload', 'f.field_name') }} as field_value
from {{ ref('stg_raw_records') }} r
inner join {{ ref('schema_identity_fields') }} f
    on r.organization_id = f.organization_id
    and r.project_id = f.project_id
    and r.kind = f.kind
    and r.schema_name = f.schema_name
where {{ json_text_field('r.payload', 'f.field_name') }} is not null

{% endif %}
