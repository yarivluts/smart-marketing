terraform {
  required_version = ">= 1.9.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }

  # Remote state is not wired up yet — this repo has no GCS bucket dedicated to
  # Terraform state. Configure a `backend "gcs"` block (or run `terraform init
  # -backend-config=...`) once a human provisions one; until then this is
  # deliberately local-backend so `terraform validate`/`plan` work without
  # real GCP credentials.
}
