import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Activity, Building2, CheckCircle2, FolderKanban, Gauge, LayoutDashboard, Mail, Plus, TrendingUp } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/ui/stat-card';
import { ChartCard } from '@/components/viz/chart-card';
import { DonutChart } from '@/components/viz/donut-chart';
import { EmptyState } from '@/components/viz/empty-state';
import { PageHero } from '@/components/viz/page-hero';
import { TrendChart, type TrendDatum } from '@/components/viz/trend-chart';
import { InitialsAvatar } from '@/components/viz/initials-avatar';
import { ProjectHealthCard } from '@/components/orgs/project-health-card';
import { DashboardSignOutButton } from '@/components/auth/dashboard-sign-out-button';
import { dailyTotals, shortDayLabel } from '@/lib/orgs/workspace-view';
import type { DashboardOverview } from '@/lib/orgs/dashboard-overview';

export interface DashboardContentProps {
  email: string;
  overview: DashboardOverview;
  /** Epoch ms the overview was read at - the trend's day axis ends on this day. */
  now: number;
}

const TREND_DAYS = 14;
const TREND_SERIES_CAP = 6;

/** Days (oldest first) of the trailing window the health cards' daily numbers cover. */
function trendDays(now: number): string[] {
  return dailyTotals([], () => '', () => 0, TREND_DAYS, now).map((bucket) => bucket.day);
}

/**
 * The signed-in landing page: every org the user belongs to, each project's live health, and the
 * records arriving across all of them - so the first screen after sign-in answers "is everything
 * flowing?" instead of listing names.
 */
export function DashboardContent({ email, overview, now }: DashboardContentProps): React.ReactElement {
  const t = useTranslations('DashboardPage');
  const locale = useLocale();
  const numberFormat = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 });

  const projects = overview.orgs.flatMap((org) => org.projects);
  const withHealth = projects.filter((project) => project.health !== null);
  const scored = withHealth.filter((project) => project.health?.score !== null && project.health?.score !== undefined);
  const averageScore = scored.length > 0 ? Math.round(scored.reduce((sum, project) => sum + (project.health?.score ?? 0), 0) / scored.length) : null;
  const totalAccepted = withHealth.reduce((sum, project) => sum + (project.health?.acceptedCount ?? 0), 0);
  const totalRejected = withHealth.reduce((sum, project) => sum + (project.health?.quarantinedCount ?? 0), 0);
  const days = trendDays(now);
  const dailySum = days.map((_, index) => withHealth.reduce((sum, project) => sum + (project.health?.dailyAccepted[index] ?? 0), 0));
  const flowing = withHealth.filter((project) => project.health?.status === 'ok').length;
  const projectCount = overview.orgs.reduce((sum, org) => sum + org.projects.length + org.hiddenProjectCount, 0);

  const trendProjects = withHealth.filter((project) => project.health?.dailyAccepted.some((value) => value > 0)).slice(0, TREND_SERIES_CAP);
  const trendData: TrendDatum[] = days.map((day, index) => ({
    day: shortDayLabel(day),
    ...Object.fromEntries(trendProjects.map((project) => [project.projectId, project.health?.dailyAccepted[index] ?? 0])),
  }));

  return (
    <main className="container mx-auto flex max-w-6xl flex-col gap-6 py-10">
      <PageHero
        icon={LayoutDashboard}
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('welcome', { email })}
        actions={
          <>
            <Button asChild size="sm">
              <Link href="/orgs/new">
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t('createOrganization')}
              </Link>
            </Button>
            <DashboardSignOutButton />
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard title={t('kpiOrganizations')} value={numberFormat.format(overview.orgs.length)} icon={Building2} subtext={t('kpiProjectsSubtext', { count: projectCount })} />
          <StatCard
            title={t('kpiAverageHealth')}
            value={averageScore === null ? '-' : `${averageScore}%`}
            icon={Gauge}
            progress={averageScore ?? undefined}
            subtext={averageScore === null ? t('kpiAverageHealthEmpty') : t('kpiAverageHealthSubtext', { count: scored.length })}
          />
          <StatCard title={t('kpiAccepted')} value={numberFormat.format(totalAccepted)} icon={TrendingUp} trendData={dailySum} subtext={t('kpiAcceptedSubtext', { days: TREND_DAYS })} />
          <StatCard
            title={t('kpiFlowing')}
            value={withHealth.length > 0 ? `${flowing}/${withHealth.length}` : '-'}
            icon={Activity}
            subtext={totalRejected > 0 ? t('kpiRejectedSubtext', { count: totalRejected }) : t('kpiFlowingSubtext')}
          />
        </div>
      </PageHero>

      {overview.orgs.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={t('organizationsHeading')}
          description={t('noOrganizations')}
          action={
            <Button asChild>
              <Link href="/orgs/new">{t('createFirstOrganization')}</Link>
            </Button>
          }
        />
      ) : null}

      {trendProjects.length > 0 ? (
        <div className="grid gap-6 lg:grid-cols-3">
        <ChartCard className="lg:col-span-2" title={t('trendTitle')} description={t('trendDescription', { days: TREND_DAYS })} icon={TrendingUp}>
          <TrendChart
            label={t('trendTitle')}
            data={trendData}
            xKey="day"
            series={trendProjects.map((project) => ({ key: project.projectId, label: project.name }))}
            kind="bar"
            stacked
            valueFormat="compact"
            height={240}
            showLegend={trendProjects.length > 1}
          />
        </ChartCard>
        <ChartCard title={t('outcomesTitle')} description={t('outcomesDescription', { days: TREND_DAYS })} icon={CheckCircle2}>
          <DonutChart
            label={t('outcomesTitle')}
            centerValue={numberFormat.format(totalAccepted + totalRejected)}
            centerLabel={t('outcomesCenter')}
            data={[
              { label: t('outcomesAccepted'), value: totalAccepted, color: 'hsl(var(--success))' },
              { label: t('outcomesRejected'), value: totalRejected, color: 'hsl(var(--destructive))' },
            ]}
            size={160}
            layout="stacked"
          />
        </ChartCard>
        </div>
      ) : null}

      {overview.orgs.map((org) => (
        <section key={org.orgId} className="flex flex-col gap-4" aria-labelledby={`org-${org.orgId}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <InitialsAvatar name={org.name} seed={org.orgId} size="lg" />
              <div>
                <h2 id={`org-${org.orgId}`} className="text-xl font-semibold text-foreground">
                  <Link href={`/orgs/${org.orgId}`} className="hover:underline">
                    {org.name}
                  </Link>
                </h2>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="secondary" size="sm">
                    {t('roleLabel', { role: org.role })}
                  </Badge>
                  <span className="inline-flex items-center gap-1">
                    <FolderKanban className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('orgProjectCount', { count: org.projects.length + org.hiddenProjectCount })}
                  </span>
                </div>
              </div>
            </div>
          </div>
          {org.projects.length === 0 ? (
            <EmptyState compact icon={FolderKanban} title={t('orgNoProjects')} description={t('orgNoProjectsHint')} />
          ) : (
            <div className={org.projects.length === 1 ? 'grid gap-4' : 'grid gap-4 md:grid-cols-2 xl:grid-cols-3'}>
              {org.projects.map((project) => (
                <ProjectHealthCard key={project.projectId} project={project} wide={org.projects.length === 1} />
              ))}
            </div>
          )}
          {org.hiddenProjectCount > 0 ? <p className="text-xs text-muted-foreground">{t('orgHiddenProjects', { count: org.hiddenProjectCount })}</p> : null}
        </section>
      ))}

      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
        {overview.pendingInviteCount > 0 ? (
          <Link href="/orgs" className="inline-flex items-center gap-1.5 underline underline-offset-4">
            <Mail className="h-4 w-4" aria-hidden="true" />
            {t('pendingInvites', { count: overview.pendingInviteCount })}
          </Link>
        ) : null}
        <Link href="/orgs" className="underline underline-offset-4">
          {t('allOrganizations')}
        </Link>
      </div>
    </main>
  );
}
