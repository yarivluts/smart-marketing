'use client';

import * as React from 'react';
import { useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { useOrgContext } from '@/lib/orgs/org-context';
import { isActiveMembershipStatus } from '@/lib/orgs/membership-status';
import { Button } from '@/components/ui/button';
import { ArrowRight, LogOut, Mail } from 'lucide-react';
import { PageGuideButton } from '@/components/guides/page-guide-button';
import { PpPage, PpPageHeader } from '@/components/pastel/primitives';

import {
  DashboardTelemetryGrid,
} from '@/components/dashboard/dashboard-telemetry-grid';
import {
  DashboardQuickCockpit,
} from '@/components/dashboard/dashboard-quick-cockpit';
import {
  OperationalActivityTicker,
  type FeedEventItem,
} from '@/components/dashboard/operational-activity-ticker';
import {
  WorkspaceLaunchpads,
  computeWorkspaceReadiness,
  type WorkspaceCardData,
} from '@/components/dashboard/workspace-launchpads';
import type {
  BusinessModel,
  PlatformType,
  PrimaryStack,
} from '@/lib/projects/project-profile';

export interface DashboardTelemetryMetrics {
  ingestUptime?: string;
  ingestLatency?: string;
  connectedPipelinesCount?: number;
  totalPipelinesCount?: number;
}

export interface DashboardContentProps {
  initialWorkspaces?: WorkspaceCardData[];
  telemetryMetrics?: DashboardTelemetryMetrics;
  initialFeedEvents?: FeedEventItem[];
  userEmail?: string;
}

export function DashboardContent({
  initialWorkspaces,
  telemetryMetrics,
  initialFeedEvents,
  userEmail,
}: DashboardContentProps = {}): React.ReactElement | null {
  const t = useTranslations('DashboardPage');
  const router = useRouter();
  const { user, loading, signOut } = useAuth();
  const { memberships, loading: orgsLoading } = useOrgContext();

  useEffect(() => {
    // The middleware already gated this route on the session cookie, but the
    // client's own Firebase Auth state is the source of truth once it
    // resolves (e.g. a stale/cleared cookie from another tab).
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [loading, user, router]);

  async function handleSignOut(): Promise<void> {
    await signOut();
    router.replace('/login');
  }

  const activeMemberships = useMemo(
    () => memberships.filter((membership) => isActiveMembershipStatus(membership.status)),
    [memberships],
  );

  const pendingInvites = useMemo(
    () => memberships.filter((membership) => membership.status === 'invited'),
    [memberships],
  );

  const primaryOrgId = activeMemberships[0]?.organizationId;

  // Build rich WorkspaceCardData items from active memberships or initialWorkspaces
  const workspaces: WorkspaceCardData[] = useMemo(() => {
    if (initialWorkspaces && initialWorkspaces.length > 0) {
      return initialWorkspaces;
    }

    return activeMemberships.map((membership, idx) => {
      const raw = membership as unknown as Partial<WorkspaceCardData> & {
        projects?: Array<{
          id: string;
          name: string;
          platformType?: PlatformType;
          businessModel?: BusinessModel;
          primaryStack?: PrimaryStack;
          verifiedRequirements?: string[];
        }>;
      };
      const firstProj = raw.projects?.[0];
      const platformType: PlatformType =
        raw.platformType || (firstProj?.platformType as PlatformType) || 'web';
      const businessModel: BusinessModel =
        raw.businessModel || (firstProj?.businessModel as BusinessModel) || 'saas_subscription';
      const primaryStack: PrimaryStack =
        raw.primaryStack || (firstProj?.primaryStack as PrimaryStack) || 'stripe';
      const verifiedRequirements =
        raw.verifiedRequirements ||
        firstProj?.verifiedRequirements || [
          'req_web_sdk',
          'req_stripe_billing',
          'req_ad_attribution',
        ];
      const setupReadiness =
        raw.setupReadiness ||
        computeWorkspaceReadiness(businessModel, platformType, verifiedRequirements);

      return {
        id: membership.membershipId || membership.organizationId,
        organizationId: membership.organizationId,
        organizationName: membership.organizationName,
        projectId: firstProj?.id || raw.projectId || `proj-${idx + 1}`,
        projectName: firstProj?.name || raw.projectName || `${membership.organizationName} Core`,
        role: membership.role,
        status: 'active',
        platformType,
        businessModel,
        primaryStack,
        verifiedRequirements,
        setupReadiness,
      };
    });
  }, [activeMemberships, initialWorkspaces]);

  const primaryProjectId =
    workspaces.find((w) => Boolean(w.projectId))?.projectId ||
    workspaces[0]?.projectId ||
    'proj-1';

  const overallReadinessPercent = useMemo(() => {
    if (workspaces.length === 0) return 100;
    const sum = workspaces.reduce((acc, ws) => acc + ws.setupReadiness.percentage, 0);
    return Math.round(sum / workspaces.length);
  }, [workspaces]);

  if (!user && !userEmail) {
    return null;
  }

  return (
    <PpPage className="gap-8">
      {/* Top Executive Header */}
      <PpPageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2 text-xs font-semibold text-primary uppercase tracking-wider">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            <span>{t('executivePulseBadge')}</span>
          </span>
        }
        title={
          <span className="inline-flex items-center gap-2">
            <span>{t('title')}</span>
            <PageGuideButton pageKey="pulse" />
          </span>
        }
        description={t('welcome', { email: user?.email ?? userEmail ?? '' })}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={handleSignOut}
            className="gap-2 text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            <span>{t('signOut')}</span>
          </Button>
        }
      />

      {/* R1: Executive KPI & Health Telemetry Grid */}
      <DashboardTelemetryGrid
        activeWorkspacesCount={workspaces.length}
        overallReadinessPercent={overallReadinessPercent}
        ingestUptime={telemetryMetrics?.ingestUptime}
        ingestLatency={telemetryMetrics?.ingestLatency}
        connectedPipelinesCount={telemetryMetrics?.connectedPipelinesCount}
        totalPipelinesCount={telemetryMetrics?.totalPipelinesCount}
        pendingInvitesCount={pendingInvites.length}
      />

      {/* Pending Invites Notification Card */}
      {pendingInvites.length > 0 ? (
        <section
          aria-label="Pending Invitations"
          className="rounded-2xl border border-pp-warning/40 bg-pp-warning-wash/50 p-5 shadow-pp-sm"
        >
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pp-warning/15 text-pp-warning">
                <Mail className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  {t('pendingInvitesCardTitle')}
                </h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  <Link
                    href="/orgs"
                    className="font-medium text-amber-600 dark:text-amber-400 underline underline-offset-4 hover:opacity-80"
                  >
                    {t('pendingInvites', { count: pendingInvites.length })}
                  </Link>
                </p>
              </div>
            </div>
            <Button
              asChild
              size="sm"
              variant="outline"
              className="border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
            >
              <Link href="/orgs" className="flex items-center gap-1.5">
                <span>{t('reviewInviteAction')}</span>
                <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
              </Link>
            </Button>
          </div>
        </section>
      ) : null}

      {/* R4: Quick-Action Cockpit */}
      <DashboardQuickCockpit
        primaryOrgId={primaryOrgId}
        primaryProjectId={primaryProjectId}
      />

      {/* R3: Live Operational Activity Feed */}
      <OperationalActivityTicker
        initialEvents={initialFeedEvents}
        orgId={primaryOrgId}
        projectId={primaryProjectId}
      />

      {/* R2: Interactive Workspace Launchpads & Setup Readiness */}
      <WorkspaceLaunchpads workspaces={workspaces} loading={orgsLoading} />
    </PpPage>
  );
}
