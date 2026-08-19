{#-
  On BigQuery, collapse every custom schema into the target dataset itself.

  dbt's built-in generate_schema_name CONCATENATES target.schema with a
  model's `+schema` config (`growthos_core` + `core` -> dataset
  `growthos_core_core`), which scatters the project across three
  side-datasets (`growthos_core_core`/`_staging`/`_seed`) — discovered the
  hard way on the first real `dbt build --target prod` run (2026-08-19).
  The app's BigQueryWarehouseQueryExecutor runs compiled metric SQL with
  `defaultDataset = GROWTHOS_BIGQUERY_CORE_DATASET` and the compiler emits
  UNQUALIFIED table names (`FROM \`fact_engagement_daily\``), so the fact
  tables must land in exactly the one dataset that env var names — the
  terraform-declared `growthos_core` (infra/terraform/bigquery.tf).

  On DuckDB (the dev/CI target) the default concatenation behavior is kept
  unchanged: the fixture tests and scripts/read_freshness.py all address
  `main_core.<table>`/`main_staging.<table>` and stay untouched by this
  override.
-#}
{% macro generate_schema_name(custom_schema_name, node) -%}
    {%- if target.type == 'bigquery' -%}
        {{ target.schema }}
    {%- elif custom_schema_name is none -%}
        {{ target.schema }}
    {%- else -%}
        {{ target.schema }}_{{ custom_schema_name | trim }}
    {%- endif -%}
{%- endmacro %}
