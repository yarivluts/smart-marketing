# Secret *containers* only — Terraform never sees or stores secret values.
# Versions are added out-of-band (`gcloud secrets versions add ...` or the
# deploy pipeline), same as today.
resource "google_secret_manager_secret" "managed" {
  for_each  = toset(var.secret_ids)
  project   = var.project_id
  secret_id = each.value

  replication {
    auto {}
  }
}
