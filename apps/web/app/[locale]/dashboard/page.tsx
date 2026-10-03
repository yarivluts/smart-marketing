import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { DashboardContent } from '@/components/auth/dashboard-content';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { isActiveMembershipStatus } from '@/lib/orgs/membership-status';
import { NavShell } from '@/components/shell/nav-shell';
import type { NavShellItem, NavShellSection } from '@/components/shell/nav-types';
import {
  listActiveAttachmentsForProject,
  listAuditLogEntriesForOrg,
  listOrgProjects,
  listRecentIngestBatchesForProject,
  listSharedCredentials,
} from '@/lib/orgs/queries';
import { computeIngestHealthSummary, toIngestBatchView } from '@/lib/orgs/ingest-health-view';
import type { DashboardTelemetryMetrics } from '@/components/auth/dashboard-content';
import type { FeedEventItem } from '@/components/dashboard/operational-activity-ticker';
import { parseProjectProfile } from '@/lib/projects/project-profile';
import {
  computeWorkspaceReadiness,
  type WorkspaceCardData,
} from '@/lib/projects/workspace-readiness';

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'DashboardPage' });
  return { title: t('title') };
}

export default async function DashboardPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);

  // The middleware only checks that a session cookie is present (it can't
  // run the Admin SDK on the Edge runtime); this is the real verification
  // that makes /dashboard an actually-protected route, not just a UX-level
  // redirect. See lib/auth/get-server-session.ts.
  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Fdashboard`);
  }

  const { memberships } = await resolveOrgSessionContext(session);
  const activeMemberships = memberships.filter((m) => isActiveMembershipStatus(m.status));

  const [t, tShell, tOrgs] = await Promise.all([
    getTranslations({ locale, namespace: 'DashboardPage' }),
    getTranslations({ locale, namespace: 'AppShell' }),
    getTranslations({ locale, namespace: 'OrgsPage' }),
  ]);

  const initialWorkspaces: WorkspaceCardData[] = await Promise.all(
    activeMemberships.map(async (m) => {
      try {
        const projects = await listOrgProjects(m.organizationId);
        const firstProject = projects[0];
        const profile = firstProject ? parseProjectProfile(firstProject) : undefined;
        const platformType = profile?.platformType || 'web';
        const businessModel = profile?.businessModel || 'saas_subscription';
        const primaryStack = profile?.primaryStack || 'custom_web';
        const verifiedRequirements = firstProject?.verified_requirements || [];
        const setupReadiness = computeWorkspaceReadiness(
          businessModel,
          platformType,
          verifiedRequirements,
        );

        return {
          id: m.membershipId || m.organizationId,
          organizationId: m.organizationId,
          organizationName: m.organizationName,
          projectId: firstProject?.id,
          projectName: firstProject?.name || `${m.organizationName} Core`,
          role: m.role,
          status: 'active' as const,
          platformType,
          businessModel,
          primaryStack,
          verifiedRequirements,
          setupReadiness,
        };
      } catch {
        return {
          id: m.membershipId || m.organizationId,
          organizationId: m.organizationId,
          organizationName: m.organizationName,
          projectId: undefined,
          projectName: undefined,
          role: m.role,
          status: 'active' as const,
          platformType: 'web' as const,
          businessModel: 'saas_subscription' as const,
          primaryStack: 'custom_web' as const,
          verifiedRequirements: [],
          setupReadiness: computeWorkspaceReadiness('saas_subscription', 'web', []),
        };
      }
    }),
  );

  let telemetryMetrics: DashboardTelemetryMetrics | undefined = undefined;
  let initialFeedEvents: FeedEventItem[] = [];

  const primaryMembership = activeMemberships[0];
  if (primaryMembership) {
    try {
      const primaryProjects = await listOrgProjects(primaryMembership.organizationId);
      const firstProject = primaryProjects[0];
      if (firstProject) {
        const [batches, sharedCreds, activeAttachments, auditLogs] = await Promise.all([
          listRecentIngestBatchesForProject(primaryMembership.organizationId, firstProject.id, 20).catch(() => []),
          listSharedCredentials(primaryMembership.organizationId).catch(() => []),
          listActiveAttachmentsForProject(primaryMembership.organizationId, firstProject.id).catch(() => []),
          listAuditLogEntriesForOrg(primaryMembership.organizationId, 15).catch(() => []),
        ]);

        const ingestHealth = computeIngestHealthSummary(batches.map(toIngestBatchView), Date.now());
        const overallRollup = ingestHealth.overall;
        const ingestUptime =
          overallRollup && overallRollup.batchCount > 0
            ? `${(100 - overallRollup.errorRatePercent).toFixed(2)}%`
            : undefined;
        const ingestLatency =
          overallRollup?.freshnessMinutes !== null && overallRollup?.freshnessMinutes !== undefined
            ? `${Math.round(overallRollup.freshnessMinutes)}m ago`
            : undefined;
        const connectedPipelinesCount =
          activeAttachments.length > 0 || sharedCreds.length > 0
            ? activeAttachments.length
            : undefined;
        const totalPipelinesCount =
          connectedPipelinesCount !== undefined
            ? Math.max(connectedPipelinesCount, sharedCreds.length)
            : undefined;

        if (ingestUptime !== undefined || ingestLatency !== undefined || connectedPipelinesCount !== undefined) {
          telemetryMetrics = {
            ingestUptime,
            ingestLatency,
            connectedPipelinesCount,
            totalPipelinesCount,
          };
        }

        const batchEvents: FeedEventItem[] = batches.map((batch) => {
          const isQuarantine = (batch.quarantined_count ?? 0) > 0;
          const diffMs = Math.max(0, Date.now() - new Date(batch.created_at).getTime());
          const diffMinutes = Math.floor(diffMs / (1000 * 60));
          const diffHours = Math.floor(diffMinutes / 60);
          const timestamp =
            diffMinutes < 1
              ? 'Just now'
              : diffMinutes < 60
                ? `${diffMinutes}m ago`
                : `${diffHours}h ago`;

          return {
            id: `batch-${batch.id}`,
            timestamp,
            category: isQuarantine ? 'guardrail' : 'touchpoint',
            title: `Batch Ingest: ${(batch.kind || 'records').toUpperCase()}`,
            description: isQuarantine
              ? `${batch.quarantined_count} quarantined of ${batch.total_count} records`
              : `Ingested ${batch.total_count} records with 0 errors`,
            source: batch.environment_id ? `${batch.environment_id} stream` : 'SDK Stream',
            sourceType: 'sdk',
            severity: isQuarantine ? 'warning' : 'info',
            amount: `${batch.total_count} records`,
            details: batch.kind,
          };
        });

        const auditEvents: FeedEventItem[] = auditLogs.map((entry) => {
          const actionLower = entry.action.toLowerCase();
          const isGuardrail =
            actionLower.includes('kill_switch') ||
            actionLower.includes('guardrail') ||
            actionLower.includes('pause');
          const isConversion =
            actionLower.includes('conversion') ||
            actionLower.includes('billing') ||
            actionLower.includes('stripe') ||
            actionLower.includes('checkout');
          const diffMs = Math.max(0, Date.now() - new Date(entry.created_at).getTime());
          const diffMinutes = Math.floor(diffMs / (1000 * 60));
          const diffHours = Math.floor(diffMinutes / 60);
          const timestamp =
            diffMinutes < 1
              ? 'Just now'
              : diffMinutes < 60
                ? `${diffMinutes}m ago`
                : `${diffHours}h ago`;

          let severity: 'info' | 'success' | 'warning' = 'info';
          if (
            actionLower.includes('fail') ||
            actionLower.includes('error') ||
            actionLower.includes('kill')
          ) {
            severity = 'warning';
          } else if (isConversion) {
            severity = 'success';
          }

          let sourceType: FeedEventItem['sourceType'] = 'sdk';
          if (actionLower.includes('stripe')) sourceType = 'stripe';
          else if (actionLower.includes('google')) sourceType = 'google';
          else if (actionLower.includes('meta')) sourceType = 'meta';
          else if (isGuardrail) sourceType = 'copilot';

          const isMcp = entry.client_type?.startsWith('mcp') || entry.actor_type === 'service_account';

          return {
            id: `audit-${entry.id}`,
            timestamp,
            category: isGuardrail ? 'guardrail' : isConversion ? 'conversion' : 'touchpoint',
            title: entry.summary || entry.action.replace(/\./g, ' ').toUpperCase(),
            description: entry.summary || `${entry.actor_type} performed ${entry.action}`,
            source: isMcp ? 'Copilot Guardrail' : entry.target_type,
            sourceType,
            severity,
            details: entry.action,
          };
        });

        initialFeedEvents = [...batchEvents, ...auditEvents].slice(0, 20);
      }
    } catch {
      // Telemetry remains undefined / honest empty
    }
  }

  const orgItems: NavShellItem[] = activeMemberships.map((m) => ({
    id: `org-${m.organizationId}`,
    href: `/orgs/${m.organizationId}`,
    label: m.organizationName,
    icon: 'Building2',
  }));

  const sections: NavShellSection[] = [
    { heading: tOrgs('title'), items: orgItems },
  ];

  const mobileTabItems: NavShellItem[] = [
    { id: 'tab-dashboard', href: '/dashboard', label: t('title'), icon: 'LayoutGrid' },
    { id: 'tab-orgs', href: '/orgs', label: tOrgs('title'), icon: 'Building2' },
  ];

  return (
    <NavShell
      brandName={tShell('brandName')}
      organizations={activeMemberships.map((m) => ({ id: m.organizationId, name: m.organizationName }))}
      userEmail={session.email ?? undefined}
      sections={sections}
      mobileTabItems={mobileTabItems}
    >
      <DashboardContent
        initialWorkspaces={initialWorkspaces}
        telemetryMetrics={telemetryMetrics}
        initialFeedEvents={initialFeedEvents}
        userEmail={session.email ?? undefined}
      />
    </NavShell>
  );
}
