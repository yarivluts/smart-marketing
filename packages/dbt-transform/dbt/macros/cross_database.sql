-- Cross-database SQL portability helpers (KAN-18 phase 4: DuckDB<->BigQuery
-- dialect port). This project runs the exact same model SQL against
-- dbt-duckdb (the CI-tested default, see profiles.yml) and, once KAN-18
-- provisions real BigQuery infra, against dbt-bigquery — nothing in
-- models/seeds/tests needs to change when that flag flips, same posture the
-- rest of this repo's provider-agnostic seams already establish. `dbt.hash`
-- and `dbt.date_trunc` are used directly at model call sites (both have
-- self-contained, non-recursive BigQuery overrides in dbt-bigquery 1.11.3 —
-- verified by reading its shipped macros, not assumed); everything below is
-- either not covered by dbt-core's own built-in cross-database macros, or
-- (for `safe_cast`/`try_cast`) deliberately NOT reused from dbt-core because
-- its behavior differs from what this project needs — see each macro's own
-- comment.
--
-- None of this has been run against a live BigQuery project (KAN-18 is
-- still `needs-human`) — every BigQuery branch is written to documented
-- GoogleSQL syntax and validated by `dbt parse --target prod` (Jinja/SQL
-- renders without error), not by an actual `dbt build`. The DuckDB branch
-- is the one CI actually executes (`dbt build`) on every change.

-- dbt-core's own `dbt.safe_cast` falls back to a plain, throwing `cast()`
-- for any adapter without its own override (see dbt-core's safe_cast.sql:
-- "most databases don't support this function yet so we just need to use
-- cast") — DuckDB has no such override, so `dbt.safe_cast` would silently
-- turn every one of this project's null-tolerant `try_cast`s into a
-- throwing `cast`, a real behavior change. This project's own values are
-- genuinely malformed sometimes (e.g. a payload missing a `ts` field), and
-- relying on a null-on-failure cast rather than an error is the point, so
-- this macro reaches for each adapter's own real tolerant-cast keyword
-- directly instead: DuckDB's `try_cast`, BigQuery's `safe_cast`.
{% macro growthos_try_cast(field, type) %}
  {{ return(adapter.dispatch('growthos_try_cast', 'growthos_transform')(field, type)) }}
{% endmacro %}

{% macro default__growthos_try_cast(field, type) %}
    try_cast({{ field }} as {{ type }})
{% endmacro %}

{% macro bigquery__growthos_try_cast(field, type) %}
    safe_cast({{ field }} as {{ type }})
{% endmacro %}

-- Extracts a JSON object field as text, tolerating a missing/non-string
-- value (returns null rather than erroring) the same way this project's
-- DuckDB-native `json_extract_string` already does. `field_name` is a bare
-- SQL expression for the key — either a quoted literal (`"'ts'"`) or a
-- column reference (`f.field_name`) for the one call site
-- (`stg_identity_key_observations`) that pivots over a dynamic, registered
-- set of identity-key field names. BigQuery's `JSON_VALUE`/`JSON_EXTRACT`
-- family requires a literal JSONPath, which a dynamic field name can't
-- satisfy, so the BigQuery leg uses the JSON subscript operator
-- (`json_col[key_expr]`, which does accept a non-literal STRING key) plus
-- `LAX_STRING` to convert the resulting JSON value to text-or-null.
{% macro json_text_field(json_column, field_name) %}
  {{ return(adapter.dispatch('json_text_field', 'growthos_transform')(json_column, field_name)) }}
{% endmacro %}

{% macro default__json_text_field(json_column, field_name) %}
    json_extract_string({{ json_column }}, '$.' || {{ field_name }})
{% endmacro %}

{% macro bigquery__json_text_field(json_column, field_name) %}
    lax_string({{ json_column }}[{{ field_name }}])
{% endmacro %}

-- The nested JSON OBJECT at `field_name` (not its text value) — used to
-- reach inside a raw record's ingest envelope, whose real shape is
-- `{event, event_id, ts, properties:{...}}` for events,
-- `{id, attributes:{...}}` for entities and
-- `{measure, ts, value, dimensions:{...}}` for measures (see
-- `checkRecordEnvelope` in @growthos/firebase-orm-models). Returns a JSON
-- value on both adapters, so downstream `json_text_field` calls compose on
-- top of it unchanged.
{% macro json_object_field(json_column, field_name) %}
  {{ return(adapter.dispatch('json_object_field', 'growthos_transform')(json_column, field_name)) }}
{% endmacro %}

{% macro default__json_object_field(json_column, field_name) %}
    json_extract({{ json_column }}, '$.' || {{ field_name }})
{% endmacro %}

{% macro bigquery__json_object_field(json_column, field_name) %}
    {{ json_column }}[{{ field_name }}]
{% endmacro %}

-- `first_date`/`second_date` difference in `datepart` units (result =
-- second - first, matching this project's original DuckDB
-- `date_diff(part, first, second)` call convention). NOT built on
-- dbt-core's own `dbt.datediff`: as shipped in dbt-bigquery 1.11.3,
-- `bigquery__datediff` itself calls `dbt.datediff(...)` — the very
-- dispatcher macro that resolved to it in the first place — which would
-- recurse straight back into `bigquery__datediff` again. Verified by
-- reading the shipped macro source, not assumed; sidestepped entirely by
-- hand-rolling the BigQuery leg here with `DATETIME_DIFF` instead of
-- trusting that path.
{% macro growthos_datediff(first_date, second_date, datepart) %}
  {{ return(adapter.dispatch('growthos_datediff', 'growthos_transform')(first_date, second_date, datepart)) }}
{% endmacro %}

{% macro default__growthos_datediff(first_date, second_date, datepart) %}
    date_diff('{{ datepart }}', {{ first_date }}, {{ second_date }})
{% endmacro %}

{% macro bigquery__growthos_datediff(first_date, second_date, datepart) %}
    datetime_diff(cast({{ second_date }} as datetime), cast({{ first_date }} as datetime), {{ datepart }})
{% endmacro %}

-- A `lower_bound..upper_bound` (inclusive) integer row spine, joined
-- directly into the FROM clause so the bounds can be *correlated* — a
-- per-row expression referencing columns from an earlier item in the same
-- FROM clause (`fact_cohort_retention`'s elapsed-periods spine and
-- `fact_engagement_depth_histogram`'s day-bucket spine both need this: the
-- upper bound is a per-project value computed in a prior CTE, not a fixed
-- constant). This is NOT the same problem dbt-core's own
-- `dbt.generate_series` solves — that macro's default implementation needs
-- `upper_bound` as a real Python int at Jinja-compile time (it drives a
-- `range()`-based loop building a binary-CTE cross join), so it cannot
-- take a runtime, row-correlated SQL expression at all. Emitted as a raw
-- join fragment (not wrapped in a `(select ...)` subquery) because BigQuery
-- only correlates an `UNNEST(...)` against earlier FROM-clause columns when
-- it appears directly in the FROM/JOIN clause itself — wrapping it in an
-- extra SELECT would silently break that correlation. Every call site
-- aliases the produced column as a bare (unqualified) name so the same
-- downstream `select` list works unchanged against either shape: DuckDB's
-- `... as gs(<alias>)` (a table-function alias with a column list) and
-- BigQuery's `... as <alias>` (an UNNEST column alias, no wrapping table
-- alias) both resolve `<alias>` as an unqualified column reference.
{% macro int_range_join(lower_bound, upper_bound, alias) %}
  {{ return(adapter.dispatch('int_range_join', 'growthos_transform')(lower_bound, upper_bound, alias)) }}
{% endmacro %}

{% macro default__int_range_join(lower_bound, upper_bound, alias) %}
    generate_series({{ lower_bound }}, {{ upper_bound }}) as gs({{ alias }})
{% endmacro %}

{% macro bigquery__int_range_join(lower_bound, upper_bound, alias) %}
    unnest(generate_array({{ lower_bound }}, {{ upper_bound }})) as {{ alias }}
{% endmacro %}

-- This project's standard "fold every column that makes a row distinct into
-- a hash" surrogate-key convention (every core model's own primary key uses
-- it), built from a Jinja list of column/expression strings. Each field is
-- explicitly cast to a string before concatenating: DuckDB's `||` silently
-- coerces a DATE/TIMESTAMP/INTEGER operand to text, but BigQuery's `||`
-- (a `CONCAT` alias) requires every operand to already be a STRING and
-- errors otherwise — casting every field up front, not just the ones that
-- happen to need it on one adapter, keeps every call site identical
-- regardless of which columns a given key happens to fold in.
{% macro surrogate_key(field_list) %}
{%- set parts = [] -%}
{%- for field in field_list -%}
  {%- do parts.append('cast(' ~ field ~ ' as ' ~ dbt.type_string() ~ ')') -%}
{%- endfor -%}
{{ dbt.hash(parts | join(" || '|' || ")) }}
{%- endmacro %}

-- Extracts a nested JSON OBJECT (not
