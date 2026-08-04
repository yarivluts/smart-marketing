# The Docker repository deploy/cloudbuild.*.yaml pushes web/api images to.
# Already exists (built interactively per TASKS.md KAN-18) — see README.md for
# the `terraform import` command before ever running `terraform apply` here.
resource "google_artifact_registry_repository" "images" {
  project       = var.project_id
  location      = var.region
  repository_id = var.artifact_registry_repository_id
  format        = "DOCKER"
  description   = "GrowthOS web/api container images (dev + prod)."
}
