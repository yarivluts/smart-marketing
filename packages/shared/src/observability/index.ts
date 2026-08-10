/**
 * Server-only observability exports (KAN-20). Deliberately NOT re-exported from
 * the package root: `trace-context.ts` imports `node:async_hooks`/`node:crypto`,
 * which webpack can't bundle for the browser — pulling them into `@growthos/shared`'s
 * root barrel broke apps/web's client bundle the moment any "use client" component
 * imported anything from `@growthos/shared` (the whole CommonJS barrel loads as one
 * module, so there's no tree-shaking one unused export away). Import this subpath
 * only from server-side code (apps/api, or apps/web server components/routes).
 */
export * from './trace-context';
export * from './logger';
