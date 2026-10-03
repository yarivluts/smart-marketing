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

import {
  DashboardTelemetryGrid,
} from '@/components/dashboard/dashboard-telemetry-grid';
import {
  DashboardQuickCockpit,
} from '@/components/dashboard/dashboard-quick-cockpit';
import {
  OperationalActivityTicker,
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
}

export function DashboardContent({
  initialWorkspaces,
  telemetryMetrics,
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

  if (!user) {
    return null;
  }

  return (
    <main className="container mx-auto flex max-w-7xl flex-col gap-10 py-10 px-4 sm:px-6 lg:px-8">
      {/* Top Executive Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-6 border-b border-border/50">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-primary uppercase tracking-wider">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            <span>{t('executivePulseBadge')}</span>
          </div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
              {t('title')}
            </h1>
            <PageGuideButton pageKey="pulse" />
          </div>
          <p className="text-muted-foreground text-sm sm:text-base">
            {t('welcome', { email: user.email ?? '' })}
          </p>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-center">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSignOut}
            className="gap-2 text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            <span>{t('signOut')}</span>
          </Button>
        </div>
      </header>

      {/* R1: Executive KPI & Health Telemetry Grid */}
      <DashboardTelemetryGrid
        activeWorkspacesCount={workspaces.length}
        overallReadinessPercent={overallReadinessPercent}
        ingestUptime={telemetryMetrics?.ingestUptime ?? '99.98%'}
        ingestLatency={telemetryMetrics?.ingestLatency ?? '<18ms'}
        connectedPipelinesCount={telemetryMetrics?.connectedPipelinesCount ?? 3}
        totalPipelinesCount={telemetryMetrics?.totalPipelinesCount ?? 3}
        pendingInvitesCount={pendingInvites.length}
      />

      {/* Pending Invites Notification Card */}
      {pendingInvites.length > 0 ? (
        <section
          aria-label="Pending Invitations"
          className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 shadow-soft"
        >
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
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
      <OperationalActivityTicker orgId={primaryOrgId} projectId={primaryProjectId} />

      {/* R2: Interactive Workspace Launchpads & Setup Readiness */}
      <WorkspaceLaunchpads workspaces={workspaces} loading={orgsLoading} />
    </main>
  );
}
