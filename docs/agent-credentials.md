# Credentials for local agents

Read this before you go looking for an API key, token, or password. It applies to every
agent working in this repo — Claude Code, Gemini CLI, Codex / ChatGPT Code — and to humans.

## The one rule

**Every GrowthOS credential lives in Google Secret Manager, project `growthos-g2w84`, and
nowhere else.** Not in `.env`, not in a dotfile, not in `settings.local.json`, not pasted
into a chat. Fetch it at the moment you need it and let it die with the process.

```bash
# bash / git-bash / WSL
TOKEN="$(scripts/secrets/get-secret.sh jira-api-token)"
```

```powershell
# PowerShell
$token = ./scripts/secrets/get-secret.ps1 jira-api-token
```

Both read the same store, so a rotation is one command in one place and every agent and
every environment picks it up on the next call.

## What is in there

| Secret | What it is |
|---|---|
| `jira-api-token` | Atlassian API token for the KAN backlog (see below) |
| `google-ads-developer-token` | Google Ads API developer token |
| `meta-user-access-token` | Meta Marketing API user access token |
| `growthos-vault-keys-dev` / `-preprod` / `-prod` | envelope-encryption keys the app's own credential vault uses (`GROWTHOS_VAULT_KEYS`) |

`gcloud secrets list --project growthos-g2w84` is the live list; this table will drift.

## Prerequisites

The helpers use your own Google identity, so once per machine:

```bash
gcloud auth application-default login
```

If a helper fails, it says which of the three things is missing: gcloud on PATH,
authentication, or `roles/secretmanager.secretAccessor` on that secret.

## Non-secret configuration

Some things are needed alongside a secret but are not themselves secret — a site URL, an
account email, a customer id. Those belong in this file or in the code, never in Secret
Manager, so an agent can read them without an access round trip.

| Name | Value |
|---|---|
| `JIRA_SITE` | _not yet recorded — the `https://<site>.atlassian.net` for the KAN project_ |
| `JIRA_EMAIL` | _not yet recorded — the Atlassian account the API token belongs to_ |
| GCP project | `growthos-g2w84` |
| Region | `me-west1` |

## Rules that are not negotiable

- **Never print a secret.** No `echo "$TOKEN"`, no `curl -v`, no writing it into a report,
  a commit message, a PR description, a test fixture, or a message to another agent or
  session. A value that reaches a terminal reaches a transcript, and a transcript is a file
  on disk that syncs.
- **Never write one to disk.** Not even to a temp file, not even briefly.
- **Never ask a human to paste one into a chat.** Give them the command to run in their own
  terminal instead:
  ```bash
  printf '%s' 'THE_VALUE' | gcloud secrets versions add <secret-name> --project growthos-g2w84 --data-file=-
  ```
  (and remind them to clear that line from their shell history afterwards).
- **A secret that has been seen in a transcript is burned.** Say so plainly and rotate it;
  do not quietly keep using it.
- **Adding a new secret** is `gcloud secrets create <name> --project growthos-g2w84
  --replication-policy=automatic --data-file=-`, then a row in the table above.

## For scheduled and cloud runs

The same store serves Cloud Run: grant the runtime service account
`roles/secretmanager.secretAccessor` on the specific secret, and read it either through
these helpers or through a Cloud Run secret env binding. That is why the store is Secret
Manager rather than a file in a home directory — a machine-local file cannot serve a
scheduled run, and `CLAUDE.md` requires those runs to work headless.
