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
| `packages/mcp-headless-example` | Runnable example: a headless agent talking to GrowthOS over MCP |
| `docs/plan` | The GrowthOS product + architecture plan (15 docs) |
| `docs/mcp` | Connect an MCP client (Claude Desktop, claude.ai, a headless agent) to GrowthOS — see [`docs/mcp/README.md`](./docs/mcp/README.md) |

## How the build proceeds

The backlog lives in Jira project **KAN** and is mirrored in [`TASKS.md`](./TASKS.md). Each scheduled
run reads `PROGRESS.md` + `TASKS.md`, picks the next unblocked story in sprint order, implements it
with tests, opens a PR, **reviews its own diff and fixes the findings**, ensures all checks are green,
then **merges into `main`** and updates `PROGRESS.md`.

See [`CLAUDE.md`](./CLAUDE.md) for the full engineering rules.
