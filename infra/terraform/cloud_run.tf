# The four Cloud Run services already running (built interactively per
# TASKS.md KAN-18): web-dev, web-prod, api-dev, api-prod, all in var.region.
# A "staging" environment doesn't exist yet (explicitly remaining KAN-18
# scope) — add a "web-staging"/"api-staging" entry to local.cloud_run_services
# once a human provisions it, rather than modeling it speculatively here.
locals {
  cloud_run_services = {
    web-dev     = { app = "web", environment = "dev" }
    web-preprod = { app = "web", environment = "preprod" }
    web-prod    = { app = "web", environment = "prod" }
    api-dev     = { app = "api", environment = "dev" }
    api-preprod = { app = "api", environment = "preprod" }
    api-prod    = { app = "api", environment = "prod" }
  }
}

resource "google_cloud_run_v2_service" "services" {
  for_each = local.cloud_run_services

  project  = var.project_id
  name     = each.key
  location = var.region

  # deploy/cloudbuild.*.yaml pushes new images and updates the running
  # revision directly (`gcloud run deploy`) outside Terraform; deploys would
  # otherwise fight this resource over the container image on every apply.
  # IAM invoker bindings aren't modeled either — this environment has no
  # credentials to read back the real policy per service (public web ingress
  # vs. a locked-down api-to-api call), so guessing here risks silently
  # tightening or loosening access on the next apply. See README.md.
  lifecycle {
    ignore_changes = [
      client,
      client_version,
      template[0].containers[0].image,
      template[0].labels,
      template[0].annotations,
    ]
  }

  labels = {
    app         = each.value.app
    environment = each.value.environment
  }

  template {
    containers {
      # Placeholder only — see the ignore_changes note above for why this
      # never actually drives a real deploy.
      image = "${var.region}-docker.pkg.dev/${var.project_id}/${var.artifact_registry_repository_id}/${each.value.app}:latest"

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }
    }
  }
}
