/**
 * Local type stub for `@arbel/firebase-orm/admin`, wired via this package's
 * tsconfig `paths`. The real subpath is only reachable through the package's
 * `exports` map, which our Node10 (`moduleResolution: "Node"`) setup cannot
 * see — worse, Node10 resolution finds the package's raw `admin.ts` source
 * and pulls it into our build. The emitted `require('@arbel/firebase-orm/admin')`
 * stays literal, so webpack/Next file tracing and runtime resolution (which
 * all honour `exports` maps) work correctly. Consumers of this package get
 * the real types via their own exports-aware resolution.
 */
import type { App } from './firebase-admin-app';

export function initializeAdminApp(adminApp: App, key?: string): Promise<App>;
