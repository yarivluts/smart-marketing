# GEMINI.md — GrowthOS

Working rules for any agent in this repo (Gemini CLI / Gemini Code, and any tool that reads
`GEMINI.md`). They are the same rules for every agent, so they live in one file:

**→ Read [`CLAUDE.md`](./CLAUDE.md) first, in full. It is the contract.**

It covers: reading `PROGRESS.md` + `TASKS.md` at the start of a run and updating
`PROGRESS.md` at the end; the non-negotiable engineering rules (tests ship with every
change, Firestore only through `@growthos/firebase-orm-models`, no hard-coded UI strings,
no Hebrew outside translation files, an admin surface for anything user-manageable); the
branch-and-PR git workflow; the monorepo layout; and the commands.

## Credentials

Never look for a token in a `.env`, a dotfile, or this repo — there are none, by design.
Every credential is in Google Secret Manager and is fetched at the moment of use:

```bash
TOKEN="$(scripts/secrets/get-secret.sh <secret-name>)"
```

**→ [`docs/agent-credentials.md`](./docs/agent-credentials.md)** has the catalogue, the
PowerShell twin, the prerequisites, and the rules about never printing or persisting a
value. Read it before handling any credential.
