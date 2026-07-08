# GrowthOS web (Next.js standalone) — built for Cloud Run.
# Build context is the monorepo root (see deploy/cloudbuild.web.yaml).
FROM node:22-slim AS base
RUN npm install -g pnpm@9.15.9
WORKDIR /app

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @growthos/shared build \
 && pnpm --filter @growthos/firebase-orm-models build \
 && pnpm --filter @growthos/web build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV HOSTNAME=0.0.0.0
# Next.js standalone output (traced from the monorepo root).
COPY --from=build /app/apps/web/public ./apps/web/public
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
EXPOSE 8080
CMD ["node", "apps/web/server.js"]
