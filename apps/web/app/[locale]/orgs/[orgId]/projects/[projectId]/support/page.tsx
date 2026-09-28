import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { CheckCircle2, Headset, Inbox, Info, Star, Timer, Trophy, Zap } from 'lucide-react';
import { can } from '@growthos/shared';
import { SUPPORT_PACK_PLUGIN_ID } from '@growthos/firebase-orm-models';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { builtinMetricPacks, getSupportLeaderboardForProject, listOrgPeople, listOrgProjects, listPluginInstallsForProject } from '@/lib/orgs/queries';
import { hasActiveInstall, toPluginInstallView } from '@/lib/orgs/plugin-view';
import { formatDurationSeconds, toSupportLeaderboardView, toSupportTeamSummary } from '@/lib/orgs/support-view';
import { PackSetupLanding } from '@/components/orgs/pack-setup-landing';
import { StatCard } from '@/components/ui/stat-card';
import { BarList, ChartCard, EmptyState, PageHero } from '@/components/viz';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Support' });
  return { title: t('metaTitle') };
}

/**
 * A project's customer-support leaderboard (KAN-90, plan `14 §Gap 6`):
 * per-agent tickets resolved, average first-response/resolution time, and
 * average CSAT, plus the project-wide open-ticket backlog — gated on
 * `ingest.write`, same "whole feature, not just mutation, is admin-only"
 * posture the sibling Feedback/Churn Reasons/Firmographics/Experiments pages
 * take for their own read-only analytics surfaces. Computed live from
 * bounded, landed `support_ticket_event` raw records (`getSupportLeaderboardForProject`)
 * — no warehouse dependency, so this page renders correctly even before a
 * dbt build has run; the Customer Support pack's own metrics still register
 * on install so board tiles/goals can target them too. Before the pack is
 * installed (no `support_ticket_event` schema/metrics registered yet), this
 * page shows the same one-click install card the Plugins page offers,
 * reusing `InstallBuiltinPackSection` exactly. A real Zendesk/Intercom/
 * Freshdesk/Crisp connector is deferred — needs a human-provisioned API key,
 * same posture Stripe/GA4/KAN-82/KAN-84/KAN-87 established for their own
 * third-party connectors; this schema is what a future connector (or a
 * manual admin action) would land data under.
 */
export default async function SupportPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Fsupport`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'ingest.write', { orgId, projectId })) {
    notFound();
  }

  const [projects, installs] = await Promise.all([listOrgProjects(orgId), listPluginInstallsForProject(orgId, projectId)]);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    notFound();
  }

  const installViews = installs.map(toPluginInstallView);
  const packInstalled = hasActiveInstall(installViews, SUPPORT_PACK_PLUGIN_ID);

  const t = await getTranslations('Support');

  if (!packInstalled) {
    const installablePacks = builtinMetricPacks().filter((pack) => pack.pluginId === SUPPORT_PACK_PLUGIN_ID);
    return (
      <PackSetupLanding
        orgId={orgId}
        projectId={projectId}
        icon={Headset}
        eyebrow={t('eyebrow')}
        title={t('title', { projectName: project.name })}
        intro={t('setupIntro')}
        featuresTitle={t('setupFeaturesTitle')}
        installTitle={t('setupInstallTitle')}
        packs={installablePacks}
        features={[
          { key: 'backlog', icon: Inbox, title: t('setupFeatureBacklogTitle'), description: t('setupFeatureBacklogDescription') },
          { key: 'speed', icon: Timer, title: t('setupFeatureSpeedTitle'), description: t('setupFeatureSpeedDescription') },
          { key: 'leaderboard', icon: Trophy, title: t('setupFeatureLeaderboardTitle'), description: t('setupFeatureLeaderboardDescription') },
        ]}
      />
    );
  }

  const [leaderboardResult, people] = await Promise.all([getSupportLeaderboardForProject(orgId, projectId), listOrgPeople(orgId)]);
  const peopleById = new Map(people.map((person) => [person.id, { name: person.name, photoUrl: person.photo_url ?? null }]));
  const leaderboard = toSupportLeaderboardView(leaderboardResult, peopleById);
  const team = toSupportTeamSummary(leaderboard.rows);

  const numberFormat = new Intl.NumberFormat(locale);
  const formatDuration = (seconds: number | null): string => {
    if (seconds === null) return t('rowValueUnavailable');
    const { value, unitKey } = formatDurationSeconds(seconds);
    return t(unitKey, { value });
  };
  const formatCsat = (score: number | null): string => (score === null ? t('rowValueUnavailable') : score.toFixed(1));
  const firstResponseRows = leaderboard.rows.filter((row) => row.avgFirstResponseSeconds !== null);
  const csatRows = leaderboard.rows.filter((row) => row.avgCsatScore !== null);
  const maxResolved = Math.max(1, ...leaderboard.rows.map((row) => row.ticketsResolved));

  return (
    <div className="container mx-auto flex max-w-6xl flex-col gap-6 py-10">
      <PageHero icon={Headset} eyebrow={t('eyebrow')} title={t('title', { projectName: project.name })} description={t('description')}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {/* A capped read cannot produce the backlog at all: opened and resolved
              are counted over a window that clips either end of a ticket's
              lifecycle. It used to render a clamped 0 here, which reads as "no
              backlog" in the largest type on the page (KAN-166). */}
          <StatCard
            title={t('backlogHeading')}
            value={leaderboard.openBacklog === null ? t('rowValueUnavailable') : numberFormat.format(leaderboard.openBacklog)}
            subtext={leaderboard.openBacklog === null ? undefined : t('backlogLine', { opened: leaderboard.ticketsOpened })}
            icon={Inbox}
          />
          <StatCard title={t('kpiResolved')} value={numberFormat.format(team.ticketsResolved)} icon={CheckCircle2} />
          <StatCard
            title={t('kpiFastestFirstResponse')}
            value={team.fastestFirstResponse ? formatDuration(team.fastestFirstResponse.seconds) : t('rowValueUnavailable')}
            subtext={team.fastestFirstResponse?.name}
            icon={Zap}
          />
          <StatCard title={t('kpiTopCsat')} value={team.topCsat ? formatCsat(team.topCsat.score) : t('rowValueUnavailable')} subtext={team.topCsat?.name} icon={Star} />
        </div>
      </PageHero>

      {/* Stated once, at the top, because it qualifies everything below: the
          backlog, the per-agent counts, and above all the ranking. Said here
          rather than per tile for the same reason the Demos page does it
          (KAN-164). */}
      {leaderboard.sampledFrom !== null ? (
        <div className="flex flex-col gap-2 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-foreground">
          <p className="flex items-start gap-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            {t('sampledNotice', { limit: leaderboard.sampledFrom })}
          </p>
          {leaderboard.openBacklog === null ? <p className="ps-6 text-muted-foreground">{t('backlogUnavailable')}</p> : null}
        </div>
      ) : null}

      <ChartCard title={t('leaderboardHeading')} description={t('leaderboardDescription')} icon={Trophy}>
        {leaderboard.rows.length === 0 ? (
          <EmptyState icon={Trophy} title={t('leaderboardEmpty')} description={t('leaderboardEmptyDetail')} compact />
        ) : (
          <ol className="flex flex-col gap-2">
            {leaderboard.rows.map((row, index) => {
              const width = (row.ticketsResolved / maxResolved) * 100;
              return (
                <li key={row.agentOrgPersonId} className="relative flex items-center justify-between gap-3 overflow-hidden rounded-xl border border-border px-4 py-3 text-sm">
                  <div className="absolute inset-y-0 start-0 bg-primary/10" style={{ width: `${width}%` }} aria-hidden="true" />
                  <span className="relative flex min-w-0 items-center gap-3">
                    {row.photoUrl ? (
                      <img src={row.photoUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                    ) : (
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold uppercase text-primary" aria-hidden="true">
                        {initials(row.name)}
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-foreground">{t('rankedName', { rank: index + 1, name: row.name })}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {t('rowSummary', {
                          resolved: row.ticketsResolved,
                          firstResponse: formatDuration(row.avgFirstResponseSeconds),
                          resolution: formatDuration(row.avgResolutionSeconds),
                          csat: formatCsat(row.avgCsatScore),
                        })}
                      </span>
                    </span>
                  </span>
                  <span className="relative shrink-0 text-lg font-bold tabular-nums text-foreground" dir="ltr">
                    {numberFormat.format(row.ticketsResolved)}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </ChartCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title={t('firstResponseHeading')} description={t('firstResponseDescription')} icon={Timer} fill>
          {firstResponseRows.length === 0 ? (
            <EmptyState icon={Timer} title={t('firstResponseEmpty')} compact />
          ) : (
            <BarList
              items={firstResponseRows.map((row) => ({
                key: row.agentOrgPersonId,
                label: row.name,
                sublabel: t('resolutionSublabel', { resolution: formatDuration(row.avgResolutionSeconds) }),
                value: row.avgFirstResponseSeconds ?? 0,
              }))}
              valueFormatter={(seconds) => formatDuration(seconds)}
              color="hsl(var(--info))"
            />
          )}
        </ChartCard>
        <ChartCard title={t('csatHeading')} description={t('csatDescription')} icon={Star} fill>
          {csatRows.length === 0 ? (
            <EmptyState icon={Star} title={t('csatEmpty')} compact />
          ) : (
            <BarList
              items={csatRows.map((row) => ({ key: row.agentOrgPersonId, label: row.name, value: row.avgCsatScore ?? 0 }))}
              valueFormatter={(score) => formatCsat(score)}
              color="hsl(var(--success))"
            />
          )}
        </ChartCard>
      </div>
    </div>
  );
}

/** Up to two initials for an agent without a photo, e.g. "Dana Levi" -> "DL". */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('');
}
