# GrowthOS API (NestJS) — built for Cloud Run.
# Build context is the monorepo root (see deploy/cloudbuild.api.yaml).
# Only the TS packages the API needs are built — NOT @growthos/dbt-transform
# (a Python/dbt project) and NOT the web app.
FROM node:22-slim AS base
RUN npm install -g pnpm@9.15.9
WORKDIR /app

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @growthos/shared build \
 && pnpm --filter @growthos/firebase-orm-models build \
 && pnpm --filter @growthos/api build

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=8080
COPY --from=build /app /app
WORKDIR /app/apps/api
EXPOSE 8080
# main.ts reads process.env.PORT (Cloud Run injects PORT=8080).
CMD ["node", "dist/main.js"]
