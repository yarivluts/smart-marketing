import { NextResponse, type NextRequest } from 'next/server';
import { listAuditLogEntriesForOrg, verifyAuditLogChainForOrg } from '@/lib/orgs/queries';
import { requireOrgPermission } from '@/lib/orgs/access';
import { toAuditLogEntryView } from '@/lib/orgs/audit-log-view';

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

/**
 * Lists an org's audit log, newest first, plus a hash-chain integrity check
 * (KAN-44 AC: "tamper-evident; visible in admin UI (basic list)") — an admin
 * surface gated on `audit.read`. There is no POST here: entries are written
 * internally by the services that perform an audited action
 * (`recordAuditLogEntry`), never directly by a caller of this route.
 */
export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId } = await params;
  const { error } = await requireOrgPermission(orgId, 'audit.read');
  if (error) {
    return error;
  }

  const [entries, chain] = await Promise.all([listAuditLogEntriesForOrg(orgId), verifyAuditLogChainForOrg(orgId)]);

  return NextResponse.json({ entries: entries.map(toAuditLogEntryView), chain });
}
