# The project's single Native-mode Firestore database. Already exists (built
# interactively per TASKS.md KAN-18) — this resource exists so the database's
# configuration is reviewable/diffable in code, not to create it fresh.
# `prevent_destroy` guards against an accidental `terraform destroy` wiping the
# only Firestore database every collection in @growthos/firebase-orm-models
# reads/writes through.
resource "google_firestore_database" "default" {
  project     = var.project_id
  name        = "(default)"
  location_id = var.firestore_location_id
  type        = "FIRESTORE_NATIVE"

  lifecycle {
    prevent_destroy = true
  }
}

# Collection-group index exemptions ("CG index exemptions" in TASKS.md KAN-18)
# are per-field and depend on the exact fields firebase-orm-models queries
# across collection groups (e.g. the cross-org membership listing query added
# in KAN-25). None are modeled here yet: doing so accurately requires reading
# them back from the real project (`gcloud firestore indexes fields list`),
# which this environment has no credentials to do. Import known exemptions as
# `google_firestore_field` resources once that's done — see README.md.
