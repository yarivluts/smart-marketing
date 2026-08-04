variable "project_id" {
  description = "GCP project id. The real project (human-confirmed, see TASKS.md KAN-18) is growthos-g2w84."
  type        = string
  default     = "growthos-g2w84"
}

variable "region" {
  description = "GCP region the Cloud Run services and Artifact Registry repository run in."
  type        = string
  default     = "me-west1"
}

variable "artifact_registry_repository_id" {
  description = "Docker Artifact Registry repository id that holds the web/api images built by deploy/cloudbuild.*.yaml."
  type        = string
  default     = "growthos"
}

variable "firestore_location_id" {
  description = "Firestore Native-mode database location. Firestore location ids are a separate namespace from Cloud Run/Artifact Registry regions (Firestore has no me-west1 location as of writing), so this defaults to the nearest supported multi-region and MUST be confirmed against the real database before this resource is imported."
  type        = string
  default     = "me-west1" # TODO(human): confirm actual Firestore location before `terraform import`; see README.
}

variable "secret_ids" {
  description = "Secret Manager secret ids to manage (container only — no secret values live in Terraform state or this repo)."
  type        = list(string)
  default = [
    "google-ads-developer-token",
    "meta-user-access-token",
  ]
}
