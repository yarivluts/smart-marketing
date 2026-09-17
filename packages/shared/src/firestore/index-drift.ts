/**
 * Compares the composite indexes this repo declares against the ones a live
 * Firestore project actually has.
 *
 * Why this exists: `infra/terraform/README.md` records that the missing-index
 * production crash recurred **seven times** before `firestore.indexes.json` was
 * seeded from the live set, and the reason it keeps happening is structural —
 * *the Firestore emulator does not enforce composite indexes*, so CI passes
 * whether or not the index exists. The declared file and the live project can
 * therefore drift apart indefinitely and nothing says so until a real query
 * fails in production with `FAILED_PRECONDITION`.
 *
 * It recurred an eighth time: `raw_records (environment_id, kind, schema_name,
 * landed_at)` was declared when `getMostRecentRawRecordForSchema` gained its
 * environment split, but never deployed — so that function and the schema
 * registry page's per-event volume section were both broken in production while
 * every test passed.
 *
 * Both directions matter, for different reasons:
 * - **Declared but not deployed** is a latent production crash: some query needs
 *   it and will fail the moment it runs.
 * - **Deployed but not declared** is a latent *deletion*: `firebase deploy
 *   --only firestore:indexes` treats the file as the desired state, so an index
 *   the file omits is one a future deploy can remove out from under a query that
 *   still needs it.
 */

export interface IndexField {
  fieldPath: string;
  /** `ASCENDING` / `DESCENDING`, or undefined for an array-contains field. */
  order?: string;
  arrayConfig?: string;
}

export interface CompositeIndex {
  collectionGroup: string;
  fields: IndexField[];
}

export interface IndexDrift {
  /** In the repo's file, absent from the project — a query that will fail when it runs. */
  declaredNotDeployed: CompositeIndex[];
  /** In the project, absent from the repo's file — removable by the next full deploy. */
  deployedNotDeclared: CompositeIndex[];
}

/**
 * Firestore appends a `__name__` field to every composite index it stores, which
 * the declaration file never lists. Dropping it is what makes the two sides
 * comparable at all; without this every index looks like drift.
 */
function significantFields(fields: readonly IndexField[]): IndexField[] {
  return fields.filter((field) => field.fieldPath !== '__name__');
}

/** Order matters in a composite index — `(a, b)` and `(b, a)` serve different queries — so this key is deliberately order-sensitive. */
export function indexKey(index: CompositeIndex): string {
  const fields = significantFields(index.fields)
    .map((field) => `${field.fieldPath}:${(field.order ?? field.arrayConfig ?? '').toUpperCase()}`)
    .join(',');
  return `${index.collectionGroup}[${fields}]`;
}

export function compareIndexes(declared: readonly CompositeIndex[], deployed: readonly CompositeIndex[]): IndexDrift {
  const deployedKeys = new Set(deployed.map(indexKey));
  const declaredKeys = new Set(declared.map(indexKey));
  return {
    declaredNotDeployed: declared.filter((index) => !deployedKeys.has(indexKey(index))),
    deployedNotDeclared: deployed.filter((index) => !declaredKeys.has(indexKey(index))),
  };
}

export function formatIndexDrift(drift: IndexDrift): string {
  const lines: string[] = [];
  if (drift.declaredNotDeployed.length > 0) {
    lines.push(`DECLARED BUT NOT DEPLOYED (${drift.declaredNotDeployed.length}) — a query needs each of these and will fail with FAILED_PRECONDITION:`);
    for (const index of drift.declaredNotDeployed) lines.push(`  ${indexKey(index)}`);
  }
  if (drift.deployedNotDeclared.length > 0) {
    lines.push(`DEPLOYED BUT NOT DECLARED (${drift.deployedNotDeclared.length}) — a full deploy treats the file as desired state and can delete these:`);
    for (const index of drift.deployedNotDeclared) lines.push(`  ${indexKey(index)}`);
  }
  if (lines.length === 0) lines.push('No drift: every declared index is deployed and every deployed index is declared.');
  return lines.join('\n');
}

export function hasIndexDrift(drift: IndexDrift): boolean {
  return drift.declaredNotDeployed.length > 0 || drift.deployedNotDeclared.length > 0;
}
