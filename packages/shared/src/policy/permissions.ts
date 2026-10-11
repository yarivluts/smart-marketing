/**
 * Granular permission catalog (plan 08 §5.3, 06 §3, task breakdown E1.3).
 * Role bundles compose from this list; API keys and future custom roles
 * carry an explicit subset (least privilege).
 *
 * `project.manage` vs `project.configure`: the first is project
 * ADMINISTRATION — who has access, which connectors exist, minting keys —
 * and stays withheld from machine principals. The second is project
 * SELF-DESCRIPTION: the declared name/vertical/currency/timezone and
 * archiving a project the caller already owns. Splitting them is what lets a
 * headless agent finish its own project setup (the EasySign audit's P-08:
 * every documented onboarding step ended in a tool no issued key could ever
 * call) without also handing a long-lived bearer token the ability to
 * reshape access.
 */
export const PERMISSIONS = [
  'project.manage',
  'project.configure',
  'members.manage',
  'billing.manage',
  'sources.manage',
  'resources.manage',
  'keys.manage',
  'schema.write',
  'ingest.write',
  'metrics.write',
  'dashboards.write',
  'dashboards.read',
  'automation.approve',
  'automation.execute',
  'data.export',
  'pii.read',
  'ai.use',
  'plugin.install',
  'audit.read',
  'mcp.read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}
