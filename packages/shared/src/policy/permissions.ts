/**
 * Granular permission catalog (plan 08 §5.3, 06 §3, task breakdown E1.3).
 * Role bundles compose from this list; API keys and future custom roles
 * carry an explicit subset (least privilege).
 */
export const PERMISSIONS = [
  'project.manage',
  'members.manage',
  'billing.manage',
  'sources.manage',
  'resources.manage',
  'keys.manage',
  'schema.write',
  'ingest.write',
  'metrics.write',
  'dashboards.write',
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
