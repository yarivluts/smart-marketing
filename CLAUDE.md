# GrowthOS — working rules

GrowthOS is a multi-vertical growth-analytics platform, built autonomously run-by-run by a
scheduled Claude agent. This file is the contract every run follows. Read it first, every time.

## Start / end of every run

1. **Read [`PROGRESS.md`](./PROGRESS.md) and [`TASKS.md`](./TASKS.md) first.** They are the source of
   truth for where work stands and what to do next.
2. Pick the **next unblocked task** in sprint order (respect `blocked-by`). Skip anything marked
   `needs-human` or `blocked-by` an unfinished task.
3. At the **end of every run, update `PROGRESS.md`**: what you completed, the exact stopping point if
   mid-task, anything blocked and why, the next step, and anything waiting on a human.

## Engineering rules (non-negotiable)

- **Tests ship with every change.** No change is "done" until its tests are written and verified
  green locally (`pnpm test`). CI must be green before a PR is opened.
- **Firestore only via `@growthos/firebase-orm-models`** (which wraps `@arbel/firebase-orm`). Never
  import the raw Firebase SDK in app/feature code. New collections = new models in that package.
- **No hard-coded UI strings.** All user-facing text lives in translation resource files
  (`next-intl`, en + he). A lint rule enforces this.
- **No Hebrew in code files.** Hebrew belongs only in translation resource files, never in `.ts`/
  `.tsx`/config/source.
- **Everything user-manageable gets an admin surface.** If a human needs to view or change it, build
  the admin UI for it in the same change.

## Git workflow

- Work on a **branch**, open a **PR**. **Never merge to `main` autonomously** — a human reviews and
  merges.
- Keep PRs scoped to one task (one KAN story) where possible.

## Monorepo layout

```
apps/
  web/    Next.js (App Router) + TS + Tailwind + shadcn/ui
  api/    NestJS
packages/
  shared/                cross-cutting TS types + helpers
  firebase-orm-models/   the ONLY sanctioned Firestore access layer
  eslint-config/         shared flat ESLint config
docs/plan/  the 15 GrowthOS plan documents (product + architecture spec)
```

## Commands

```bash
pnpm install       # install workspace deps (Node >= 20, pnpm 9)
pnpm build         # turbo build across all packages
pnpm test          # turbo test across all packages
pnpm lint          # eslint across all packages
pnpm typecheck     # tsc --noEmit across all packages
```

`pnpm build && pnpm test` must be green before every PR.

## Backlog & Jira

- The backlog lives in the Jira project **KAN** (GrowthOS). Epics KAN-1..KAN-16, stories
  KAN-17..KAN-78. [`TASKS.md`](./TASKS.md) mirrors it.
- Jira sync from scheduled/headless runs should use the Jira REST API with an API-token secret
  (claude.ai MCP connectors may be unavailable headless). Otherwise sync statuses from an
  interactive session.
