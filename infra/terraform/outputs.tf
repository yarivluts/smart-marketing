output "cloud_run_service_urls" {
  description = "URLs of the managed Cloud Run services, once applied against the real project."
  value       = { for k, v in google_cloud_run_v2_service.services : k => v.uri }
}

output "artifact_registry_repository" {
  description = "Fully-qualified Artifact Registry repository name."
  value       = google_artifact_registry_repository.images.name
}
