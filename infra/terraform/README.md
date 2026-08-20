# GrowthOS infra (Terraform) — KAN-18

Terraform-izes the GCP resources that already exist for project `growthos-g2w84`
(built interactively, human-confirmed 2026-07-20 — see `TASKS.md` KAN-18 and
`PROGRESS.md`). This is a **partial** delivery of KAN-18: it covers the
resources that are already live and documented (Cloud Run, Artifact Registry,
the default Firestore database, the two Secret Manager secret containers).
BigQuery, Pub/Sub, Redis, and a staging environment are still `remaining for
done` on KAN-18 and are deliberately **not** modeled here — provisioning them
needs a human decision on shape (datasets/topics/instance sizing) this repo
has no way to make blind.

## Why this doesn't just `terraform apply`

Every resource in this directory already exists, created by hand outside
Terraform. Running `terraform apply` fresh against a real backend would try
to *create* them again and fail (or, worse, succeed against slightly
different arguments and drift the real resources). Before ever applying:

1. Point the backend and provider at the real project (`gcloud auth
   application-default login`, then either configure a `backend "gcs"` block
   in `versions.tf` or run with `-backend=false` and local state you archive
   yourself — no state bucket exists yet).
2. **Import every resource** so Terraform's state matches reality first:

   ```bash
   terraform import google_artifact_registry_repository.images \
     projects/growthos-g2w84/locations/me-west1/repositories/growthos   # confirm the real repository_id first

   terraform import google_firestore_database.default \
     projects/growthos-g2w84/databases/\(default\)

   terraform import 'google_secret_manager_secret.managed["google-ads-developer-token"]' \
     projects/growthos-g2w84/secrets/google-ads-developer-token
   terraform import 'google_secret_manager_secret.managed["meta-user-access-token"]' \
     projects/growthos-g2w84/secrets/meta-user-access-token

   terraform import 'google_cloud_run_v2_service.services["web-dev"]' \
     projects/growthos-g2w84/locations/me-west1/services/web-dev
   # ...repeat for web-prod, api-dev, api-prod
   ```

3. Run `terraform plan` and read the diff carefully. A clean plan (no
   changes, or only changes you intended) is the signal state matches
   reality. **Do not `apply` a plan that shows unexpected deletes/recreates**
   — that means an assumption in this code (region, image path, resource
   name) doesn't match the real resource; fix the code, not the plan.

## What's deliberately not modeled

- **IAM invoker bindings** (who can call each Cloud Run service). This
  environment has no credentials to read back the real policy, and guessing
  it risks tightening or loosening real access on the first apply. A human
  with `gcloud run services get-iam-policy` access should add
  `google_cloud_run_v2_service_iam_member` resources once confirmed.
- **Collection-group Firestore index field exemptions** ("CG index
  exemptions" per TASKS.md). Same reason — needs `gcloud firestore indexes
  fields list` against the real project to get right.
- **Container images.** `deploy/cloudbuild.*.yaml` + `gcloud run deploy` own
  the running image; `template[0].containers[0].image` is `ignore_changes`d
  in `cloud_run.tf` so Terraform never fights that pipeline.
- **BigQuery, Pub/Sub, Redis, staging environment** — the rest of KAN-18's
  scope; needs a human design decision before this repo can build it blind
  (dataset/topic naming, instance sizing/tier, whether staging is a second
  GCP project or another `-staging` suffix like the existing `-dev`/`-prod`
  split).

## Validating without real credentials

```bash
cd infra/terraform
terraform fmt -check -recursive
terraform init -backend=false   # downloads the google provider, no GCP auth needed
terraform validate
```

CI runs exactly this (`fmt -check` + `validate`) on every PR that touches
`infra/terraform/**` — it proves the HCL is syntactically/type valid, not
that it matches the real project. Only a human with real GCP credentials can
verify that via the import + plan steps above.

## Firestore composite indexes — `firestore.indexes.json` (repo root)

The repo's single source of truth for every composite index the codebase's
compound queries need is [`../../firestore.indexes.json`](../../firestore.indexes.json)
(with a minimal `firebase.json` beside it so `firebase deploy --only
firestore:indexes` works). It was seeded 2026-08-20 by reading back the
**live** index set (`gcloud firestore indexes composite list`) after the
missing-composite-index production crash had recurred **seven times** —
each index in that file was originally discovered as a `FAILED_PRECONDITION`
crash in a deployed environment, because the Firestore **emulator does not
enforce composite indexes**, so CI can never catch a missing one.

The standing rule for new code: any compound query (a `.where(...)` equality
plus an `.orderBy(...)` on a *different* field, or 2+ `.where(...)`s with an
`.orderBy(...)`) **must add its index to `firestore.indexes.json` in the same
PR**, and whoever deploys runs:

```bash
firebase deploy --only firestore:indexes --project growthos-g2w84
# or, per index, the gcloud equivalent:
gcloud firestore indexes composite create --project growthos-g2w84 \
  --collection-group=<collection> --query-scope=COLLECTION \
  --field-config field-path=<f1>,order=ascending \
  --field-config field-path=<f2>,order=descending
```

Composite indexes are deliberately *not* modeled in Terraform: the
`firestore.indexes.json` format is the canonical, tooling-supported home for
them, and mixing the two would give the same index two competing sources of
truth.
