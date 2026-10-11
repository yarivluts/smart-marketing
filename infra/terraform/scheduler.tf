# The hourly warehouse refresh — the two resources every number in the product
# depends on, and the only production infrastructure that was declared nowhere.
#
# What runs today (read back from the live project, not assumed):
#
#   Cloud Scheduler  dbt-refresh-hourly   cron "0 * * * *"  Etc/UTC  ENABLED
#     -> POSTs the Cloud Run Admin API to start
#   Cloud Run Job    dbt-refresh          (dbt build --target prod)
#
# Why this matters more than an ordinary undeclared resource: every metric,
# cohort, funnel and attribution figure the product renders is a query against
# tables this job rebuilds. If it stops, no page errors — every page keeps
# rendering yesterday's numbers, and `ingest-health` keeps stating "Refreshed
# hourly by the scheduled warehouse job", which was true when written and would
# not be. A rebuild from this directory would also simply not recreate it.
#
# Same class as the Firestore composite-index drift (KAN-129/130): the repo and
# the live project disagreeing, with nothing that notices. `terraform plan` is
# the detector here, which is exactly why these need to be IN the configuration.
#
# ADOPTION — READ BEFORE APPLYING. Both resources already exist, so the `import`
# blocks below adopt them rather than creating them. Run `terraform plan` and
# confirm it reports **no changes** to either resource before any apply. These
# values were transcribed from the live project, but a field this configuration
# omits that the live resource sets would show up as a diff, and applying it
# would change a job the whole warehouse depends on.
#
# TODO(human): run `terraform plan` against real credentials and confirm the two
# resources below import clean. This environment has no terraform binary and no
# state backend (see versions.tf), so only `fmt`/`validate` have been checked.

import {
  to = google_cloud_run_v2_job.dbt_refresh
  id = "projects/growthos-g2w84/locations/me-west1/jobs/dbt-refresh"
}

import {
  to = google_cloud_scheduler_job.dbt_refresh_hourly
  id = "projects/growthos-g2w84/locations/me-west1/jobs/dbt-refresh-hourly"
}

resource "google_cloud_run_v2_job" "dbt_refresh" {
  project  = var.project_id
  name     = "dbt-refresh"
  location = var.region

  # Same reasoning as cloud_run.tf's services: deploy/cloudbuild.dbt.yaml pushes
  # a new image and updates the job outside Terraform, so modelling the image
  # here would make every deploy a drift to be reverted on the next apply.
  # Only the image is ignored. cloud_run.tf's services also ignore client,
  # labels and annotations, but those attributes differ between the service and
  # job resources and this environment cannot run `terraform validate` to check
  # — listing one that does not exist would fail the plan for whoever adopts
  # this. Narrow and correct beats broad and guessed.
  lifecycle {
    ignore_changes = [template[0].template[0].containers[0].image]
  }

  template {
    template {
      containers {
        # Placeholder only — see the ignore_changes note above.
        image = "${var.region}-docker.pkg.dev/${var.project_id}/${var.artifact_registry_repository_id}/dbt-refresh:latest"

        resources {
          limits = {
            cpu    = "1000m"
            memory = "512Mi"
          }
        }

        # The three the live job sets. Values are not modelled: they name the
        # BigQuery project/dataset/location and are the same env vars
        # `query-executor.ts` reads, so a mismatch here would point the refresh
        # at a different warehouse than the app queries.
        env {
          name  = "GOOGLE_CLOUD_PROJECT"
          value = var.project_id
        }

        env {
          name  = "GROWTHOS_BIGQUERY_CORE_DATASET"
          value = "growthos_core"
        }

        env {
          name  = "GROWTHOS_BIGQUERY_LOCATION"
          value = var.region
        }
      }

      timeout     = "600s"
      max_retries = 1

      # The live job runs as the project's DEFAULT compute service account with
      # full cloud-platform scope. That is broader than this job needs — it
      # reads Firestore-exported raw tables and writes one BigQuery dataset —
      # and it is shared with anything else defaulting to that identity. Left
      # as-is here so this configuration matches reality and imports clean;
      # narrowing it to a dedicated service account is a deliberate change a
      # human should make and apply, not a silent correction (KAN-148).
      service_account = "1098891924957-compute@developer.gserviceaccount.com"
    }
  }
}

resource "google_cloud_scheduler_job" "dbt_refresh_hourly" {
  project     = var.project_id
  name        = "dbt-refresh-hourly"
  region      = var.region
  description = "Hourly BigQuery warehouse refresh (dbt build --target prod) - KAN-18/KAN-38"
  schedule    = "0 * * * *"
  time_zone   = "Etc/UTC"

  # 180s is shorter than the job's own 600s timeout on purpose: this deadline
  # bounds the API call that STARTS the job, not the run itself. Cloud Run
  # returns as soon as the execution is created.
  attempt_deadline = "180s"

  retry_config {
    min_backoff_duration = "5s"
    max_backoff_duration = "3600s"
    max_doublings        = 5
    max_retry_duration   = "0s"
  }

  http_target {
    http_method = "POST"
    uri         = "https://${var.region}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${var.project_id}/jobs/dbt-refresh:run"

    oauth_token {
      service_account_email = "1098891924957-compute@developer.gserviceaccount.com"
      scope                 = "https://www.googleapis.com/auth/cloud-platform"
    }
  }
}
