{#-
  Which build of this project last ran (KAN-204): one row, rebuilt by every
  `dbt build`, holding the commit the runner image was built from.

  The scheduled dbt-refresh Cloud Run Job has no HTTP endpoint, so unlike the API
  and the web app it cannot report its own build SHA to the credential-free drift
  check (.github/workflows/prod-drift.yml). Instead every run records it here, and
  api-prod - which already queries this dataset - reports it publicly on
  /v1/health/dbt-refresh. On 2026-09-25 dbt-refresh was found running a
  2026-09-10 image: fifteen days of merged model changes had never reached
  production and nothing noticed.

  It records the build that actually RAN, not merely the image the job is
  configured with: a job whose runs never start (scheduler paused, image broken
  before dbt starts) keeps reporting the old SHA, and the drift check sees that as
  the drift it is.

  No `ref()`s, so a failing upstream model never stops this one from being
  written - dbt build skips only a failed node's descendants.

  `GIT_SHA` comes from packages/dbt-transform/Dockerfile (stamped by
  deploy/cloudbuild.dbt.yaml's `_GIT_SHA`). Only something shaped like a git hash
  is recorded - the same rule as `readBuildSha` in @growthos/shared - so an empty or
  unsubstituted build arg lands as NULL ("not stamped"), never as a fake commit,
  and nothing from the environment is ever spliced into SQL unvalidated.
-#}
{%- set raw_sha = env_var('GIT_SHA', '') | trim | lower -%}
{%- set build_sha = raw_sha if modules.re.fullmatch('[0-9a-f]{7,40}', raw_sha) else none -%}

select
    {% if build_sha is not none -%}
    '{{ build_sha }}'
    {%- else -%}
    cast(null as {{ dbt.type_string() }})
    {%- endif %} as build_sha,
    current_timestamp as recorded_at
