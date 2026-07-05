// Vitest stand-in for Next.js's `server-only`/`client-only` boundary markers
// (see vitest.config.ts aliases). Both packages unconditionally throw when
// imported — Next.js's own build tooling special-cases them to a no-op for
// genuine server/client code, but Vitest has no equivalent, so tests would
// fail even for modules that are legitimately server- or client-only.
export {};
