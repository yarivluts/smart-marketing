#!/usr/bin/env bash
# Reads one secret from this project's Secret Manager and writes the value to stdout.
#
# The single sanctioned way for a local agent (Claude Code, Gemini CLI, Codex/ChatGPT
# Code, or a human) to obtain a GrowthOS credential. No credential is ever committed,
# written to a dotfile, or pasted into a chat transcript: the value lives in exactly one
# place, and this fetches it at the moment of use.
#
#   usage:  scripts/secrets/get-secret.sh <secret-name>
#   assign: TOKEN="$(scripts/secrets/get-secret.sh jira-api-token)"
#
# Never pipe the output into a file, a log, or another agent's context. Assign it to a
# shell variable in the process that needs it and let it die with that process.
set -euo pipefail

PROJECT="${GROWTHOS_GCP_PROJECT:-growthos-g2w84}"
SECRET="${1:-}"

if [ -z "$SECRET" ]; then
  echo "usage: $0 <secret-name>" >&2
  echo "known secrets: $(gcloud secrets list --project "$PROJECT" --format='value(name.basename())' 2>/dev/null | tr '\n' ' ')" >&2
  exit 2
fi

if ! command -v gcloud >/dev/null 2>&1; then
  echo "gcloud is not on PATH. Install the Google Cloud CLI, then run: gcloud auth application-default login" >&2
  exit 1
fi

if ! gcloud secrets versions access latest --secret="$SECRET" --project="$PROJECT" 2>/dev/null; then
  echo "Could not read secret \"$SECRET\" from project $PROJECT." >&2
  echo "Check that you are authenticated (gcloud auth application-default login), that the secret exists" >&2
  echo "(gcloud secrets list --project $PROJECT), and that your account holds roles/secretmanager.secretAccessor on it." >&2
  exit 1
fi
