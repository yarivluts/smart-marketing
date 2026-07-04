# GrowthOS

Multi-vertical growth-analytics platform. This repository is built **autonomously, run-by-run**, by a
scheduled Claude agent following [`CLAUDE.md`](./CLAUDE.md), [`TASKS.md`](./TASKS.md), and
[`PROGRESS.md`](./PROGRESS.md).

## Quick start

```bash
corepack enable          # or: npm i -g pnpm@9
pnpm install             # Node >= 20
pnpm build               # build all packages (turbo)
pnpm test                # run all tests
pnpm dev                 # run web (:3000) + api (:3001) in dev
```

## Monorepo layout

| Path | What |
| ---- | ---- |
| `apps/web` | Next.js (App Router) + TypeScript + Tailwind + shadcn/ui |
| `apps/api` | NestJS API |
| `packages/shared` | Cross-cutting TypeScript types + helpers |
| `packages/firebase-orm-models` | The **only** sanctioned Firestore access layer (wraps `@arbel/firebase-orm`) |
| `packages/eslint-config` | Shared flat ESLint config |
| `docs/plan` | The GrowthOS product + architecture plan (15 docs) |

## How the build proceeds

The backlog lives in Jira project **KAN** and is mirrored in [`TASKS.md`](./TASKS.md). Each scheduled
run reads `PROGRESS.md` + `TASKS.md`, picks the next unblocked story in sprint order, implements it
with tests, opens a PR, and updates `PROGRESS.md`. A human reviews and merges — **the agent never
merges to `main`**.

See [`CLAUDE.md`](./CLAUDE.md) for the full engineering rules.
