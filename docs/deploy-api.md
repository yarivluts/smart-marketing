# Deploying `api-prod`

The API is deployed by hand. `deploy/cloudbuild.api.yaml` builds and pushes an
image and documents that half in its own header; this file is the other half —
the `gcloud run deploy` that points the service at it, plus how to check the
deploy did what you think and how to undo it.

Written after performing the deploy of `main@d89ff93` on 2026-09-18, and every
command below is one that was actually run rather than one that ought to work.
The gap it closed was **151 commits** (KAN-170): `dry_run` had been merged for a
day and was missing in production the whole time, because nothing deploys on
merge and nothing reports the drift.

The same `_GIT_SHA` rule applies to the other two production images, `web-prod`
and the `dbt-refresh` job - see [Deploying web-prod](#deploying-web-prod) and
[Deploying dbt-refresh](#deploying-dbt-refresh) below (KAN-204).

## Every image carries `_GIT_SHA`

All three production images are watched hourly by
`.github/workflows/prod-drift.yml`, each through a public endpoint that reports
the commit it was built from:

| Service | Build config | Reports its build on |
| --- | --- | --- |
| `api-prod` (and `api-preprod`) | `deploy/cloudbuild.api.yaml` | `/v1/health` |
| `web-prod` | `deploy/cloudbuild.web.yaml` | `/api/health` |
| `dbt-refresh` (Cloud Run Job) | `deploy/cloudbuild.dbt.yaml` | api-prod's `/v1/health/dbt-refresh` |

**Every `gcloud builds submit` for any of them passes `_GIT_SHA=$SHA`.** Each
config defaults it to `''`, which the service reports as `buildSha: null` - the
drift check then says it cannot tell (a warning), never that production is
current.

`dbt-refresh` has no endpoint of its own: each run writes its `GIT_SHA` into the
one-row `dbt_build_info` table and api-prod reads that back. So it reports the
build that **last ran**, not merely the one the job is configured with - it
updates on the job's next hourly execution after you repoint it.

## Before you start

Check how far behind production is, and that what you are about to ship is
green:

```bash
git fetch origin
SHA=$(git rev-parse --short origin/main)

# What is running right now — keep this, it is your rollback target.
gcloud run services describe api-prod --region me-west1 --project growthos-g2w84 \
  --format="value(status.latestReadyRevisionName,spec.template.spec.containers[0].image)"

# How far behind it is. The image tag ends in the commit it was built from.
git rev-list --count <deployed-sha>..origin/main

# CI must be green on the exact SHA you are shipping, not merely on "main".
gh run list --branch main --limit 3 --json headSha,status,conclusion \
  --jq '.[] | "\(.headSha[0:7]) \(.status) \(.conclusion)"'
```

## Build

Cloud Build uploads the **working directory**, not `origin/main` — so check out
the tree you intend to ship first. In a second worktree, make a branch at
`origin/main` rather than checking out `main` itself, which may be in use
elsewhere:

```bash
git checkout -b deploy/main-$SHA origin/main
git status --porcelain      # must be empty; a stray file ships too

gcloud builds submit --async \
  --config deploy/cloudbuild.api.yaml \
  --substitutions _IMAGE=me-west1-docker.pkg.dev/growthos-g2w84/growthos/api:main-$SHA,_GIT_SHA=$SHA \
  --project growthos-g2w84 .
```

**Always pass `_GIT_SHA`.** It is stamped into the image and reported on
`/v1/health` as `buildSha`, which is what `.github/workflows/prod-drift.yml`
compares against `main` every hour (KAN-180). Omit it and production reports
`buildSha: null` - honest, but the drift check can then only say it cannot tell.

`--async` returns a build id immediately. Follow it with:

```bash
gcloud builds log --stream <build-id> --project growthos-g2w84
gcloud builds describe <build-id> --project growthos-g2w84 --format="value(status)"   # SUCCESS
```

Stream rather than poll: repeated `describe` calls return instantly and tell you
nothing while the build sits in `QUEUED`.

There is no `.gcloudignore`, so gcloud falls back to git semantics and the upload
excludes `node_modules`, `.next` and friends (~10k files, ~190 MiB). It does not
write a `.gcloudignore` into the tree.

## Deploy

```bash
gcloud run deploy api-prod --region me-west1 --project growthos-g2w84 \
  --image me-west1-docker.pkg.dev/growthos-g2w84/growthos/api:main-$SHA
```

**Pass `--image` and nothing else.** A `run deploy` with only an image clones the
current revision's configuration — env vars, service account, scaling — and swaps
the image. Adding other flags silently resets anything you did not restate, and
the service's env vars are not in this repo.

## Verify — the artefact, not the exit code

A successful deploy is not evidence the change you wanted is live.

```bash
# Serving revision, traffic split and image should all be the new ones.
gcloud run services describe api-prod --region me-west1 --project growthos-g2w84 \
  --format="value(status.latestReadyRevisionName,status.traffic[0].revisionName,status.traffic[0].percent,spec.template.spec.containers[0].image)"

curl -s -o /dev/null -w "%{http_code}\n" https://api-prod-1098891924957.me-west1.run.app/v1/health   # 200
```

Then check the *specific thing* you deployed for is actually in the image. The
tag carries the commit, so this is answerable without credentials:

```bash
git merge-base --is-ancestor <fix-merge-commit> $SHA && echo "in the image"
git grep -c "<the symbol you shipped>" $SHA -- <path>
```

That is how the 2026-09-18 deploy was confirmed to contain `dry_run`: the MCP
tool list needs an API key to read, but the merge commit being an ancestor of
the deployed SHA, plus the symbol being present in that tree, settles it.

## Rollback

Cloud Run keeps every revision, so rolling back is a traffic change and takes
seconds — no rebuild:

```bash
gcloud run services update-traffic api-prod --region me-west1 --project growthos-g2w84 \
  --to-revisions <previous-revision>=100
```

The previous revision is the one you recorded before starting. On 2026-09-18 that
was `api-prod-00015-msw` (image `api:main-6f50355`), superseded by
`api-prod-00016-jqx`.

## Deploying web-prod

Same shape as the API: build from a clean branch at `origin/main`, then point
the service at the image with `--image` and nothing else.

`NEXT_PUBLIC_*` values are inlined at build time, so the web build takes seven
more substitutions (see the header of `deploy/cloudbuild.web.yaml`). They are
per-environment and not in this repo; copy them from web-prod's previous build
(`gcloud builds list --project growthos-g2w84` to find it, then
`gcloud builds describe <build-id> --project growthos-g2w84 --format="value(substitutions)"`).
Add `_GIT_SHA`:

```bash
gcloud builds submit --async \
  --config deploy/cloudbuild.web.yaml \
  --substitutions _IMAGE=me-west1-docker.pkg.dev/growthos-g2w84/growthos/web:main-$SHA,_GIT_SHA=$SHA,_FIREBASE_API_KEY=...,_FIREBASE_AUTH_DOMAIN=...,_FIREBASE_PROJECT_ID=...,_FIREBASE_APP_ID=...,_INGEST_API_URL=...,_HOOK_API_URL=...,_MCP_API_URL=... \
  --project growthos-g2w84 .

gcloud run deploy web-prod --region me-west1 --project growthos-g2w84 \
  --image me-west1-docker.pkg.dev/growthos-g2w84/growthos/web:main-$SHA

curl -s https://web-prod-1098891924957.me-west1.run.app/api/health   # "buildSha":"<SHA>"
```

## Deploying dbt-refresh

The scheduled warehouse refresh is a Cloud Run **Job**, started hourly by Cloud
Scheduler (`infra/terraform/scheduler.tf`). It runs a baked image and every model
is a full table rebuild, so a stale image does not merely lag - each hourly run
overwrites correct tables with the old logic. On 2026-09-25 it was found running
a 2026-09-10 image (KAN-204). Rebuild and repoint it in the same breath as any
merged dbt change:

```bash
gcloud builds submit --async \
  --config deploy/cloudbuild.dbt.yaml \
  --substitutions _IMAGE=me-west1-docker.pkg.dev/growthos-g2w84/growthos/dbt-refresh:main-$SHA,_GIT_SHA=$SHA \
  --project growthos-g2w84 .

# Record the current image first - it is the rollback target.
gcloud run jobs describe dbt-refresh --region me-west1 --project growthos-g2w84 \
  --format="value(spec.template.spec.template.spec.containers[0].image)"

gcloud run jobs update dbt-refresh --region me-west1 --project growthos-g2w84 \
  --image me-west1-docker.pkg.dev/growthos-g2w84/growthos/dbt-refresh:main-$SHA
```

Verify from a **job execution**, not a local `dbt build`: either wait for the next
hourly run or start one with `gcloud run jobs execute dbt-refresh --region me-west1
--project growthos-g2w84 --wait`. Then:

```bash
curl -s https://api-prod-1098891924957.me-west1.run.app/v1/health/dbt-refresh
# {"status":"ok","service":"dbt-refresh","buildSha":"<SHA>","recordedAt":"..."}
```

api-prod caches that read for up to five minutes. Rollback is another
`jobs update --image <previous image>`.

## Drift is now detected, not prevented

`.github/workflows/prod-drift.yml` runs hourly and compares each production
service's reported `buildSha` with `main` (KAN-180, KAN-204): `api-prod`,
`api-preprod`, `web-prod` and `dbt-refresh`. Once a merged commit has waited
more than six hours undeployed, the run goes red and a single tracking issue per
service - *"Production api-prod has drifted behind main"* - opens, updates as
the gap grows, and closes itself once production catches up.

`dbt-refresh` is held only to commits touching what its image is built from
(`packages/dbt-transform/{dbt,Dockerfile,requirements*.txt}` and
`deploy/cloudbuild.dbt.yaml`), so a web or API merge does not make it owe a
deploy. The other three are held to every commit on `main`.

It holds **no production credentials**: it reads public endpoints and git
history, and cannot deploy anything. That is deliberate, and a test pins it.
The dbt job's build is read *inside* production by api-prod, whose service
account already queries the warehouse, and published on a public endpoint - so
watching it did not require giving the workflow any access.

What it does not do is deploy. Nothing deploys on merge, so a red drift run
still needs a human to run the sequence above. Deploy-on-merge would remove
that step, but it means giving CI write access to production - a decision to
make on purpose, not something to slide into by extending this workflow.
