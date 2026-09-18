/**
 * Splits an over-fetched feed into the page it renders and whether more existed.
 *
 * The caller asks the service for `cap + 1` rows; this returns the first `cap`
 * and reports whether the extra one came back. That extra row is evidence, never
 * an entry - it is not returned and must not be rendered.
 *
 * Measuring beats inferring, for the reason KAN-138 established: `rows.length ===
 * cap` cannot tell "exactly `cap` exist" from "thousands exist", and those read
 * very differently. The first is a complete list; the second is a window onto
 * one, and a reader reconciling anything against it needs to know which.
 *
 * Lives here rather than beside any one feed because this is the eighth surface
 * to need it (KAN-114, 124, 132, 137, 138, 140, 146 and the record/audit/cost
 * lists). At that count it stopped being a fix and became a missing primitive.
 */
export function splitOverFetchedFeed<T>(rows: readonly T[], cap: number): { rows: T[]; truncated: boolean } {
  return { rows: rows.slice(0, cap), truncated: rows.length > cap };
}
