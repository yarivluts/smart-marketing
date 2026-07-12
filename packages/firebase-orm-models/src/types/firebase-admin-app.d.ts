/**
 * Local type stub for `firebase-admin/app` (see the sibling stub for why:
 * exports-map-only subpath invisible to Node10 TS resolution). Only the
 * minimal surface this package touches is declared. The emitted
 * `require('firebase-admin/app')` stays literal for file tracing.
 */
export interface App {
  name: string;
}

export function getApps(): App[];
export function initializeApp(options?: { projectId?: string }): App;
