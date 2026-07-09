-- One row per (raw_record_key, field_name) where the record's project has
-- registered `field_name` as an identity key for that (kind, schema_name)
-- (plan `08 §1`: "any event can carry one or more identity keys ... the
-- stitching engine works off registered identity keys, not hard-coded
-- ones") and the payload actually carries a non-null value for it.
-- `schema_identity_fields` stands in for a warehouse export of KAN-31's
-- `SchemaDefModel.field_defs` filtered to `is_identity_key = true` — see
-- that seed's own description.
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
        try_cast(r.payload ->> 'ts' as timestamp),
        r.landed_at
    ) as observed_at,
    f.field_name,
    json_extract_string(r.payload, '$.' || f.field_name) as field_value
from {{ ref('stg_raw_records') }} r
inner join {{ ref('schema_identity_fields') }} f
    on r.organization_id = f.organization_id
    and r.project_id = f.project_id
    and r.kind = f.kind
    and r.schema_name = f.schema_name
where json_extract_string(r.payload, '$.' || f.field_name) is not null
