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

## Drift is now detected, not prevented

`.github/workflows/prod-drift.yml` runs hourly and compares production's
`/v1/health` `buildSha` with `main` (KAN-180). Once a merged commit has waited
more than six hours undeployed, the run goes red and a single tracking issue -
*"Production api-prod has drifted behind main"* - opens, updates as the gap
grows, and closes itself once production catches up.

It holds **no production credentials**: it reads a public endpoint and git
history, and cannot deploy anything. That is deliberate, and a test pins it.

What it does not do is deploy. Nothing deploys on merge, so a red drift run
still needs a human to run the sequence above. Deploy-on-merge would remove
that step, but it means giving CI write access to production - a decision to
make on purpose, not something to slide into by extending this workflow.
