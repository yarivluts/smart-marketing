// Vitest stand-in for the `server-only` package (see vitest.config.ts alias).
// The real package unconditionally throws when imported — Next.js's own
// build tooling special-cases it to a no-op for genuine server code, but
// Vitest has no equivalent, so tests would fail even for modules that are
// legitimately server-only.
export {};
