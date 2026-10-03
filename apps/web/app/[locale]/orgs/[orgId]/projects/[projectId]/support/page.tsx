import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { SUPPORT_PACK_PLUGIN_ID } from '@growthos/firebase-orm-models';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { builtinMetricPacks, getSupportLeaderboardForProject, listOrgPeople, listOrgProjects, listPluginInstallsForProject } from '@/lib/orgs/queries';
import { hasActiveInstall, toPluginInstallView } from '@/lib/orgs/plugin-view';
import { formatDurationSeconds, toSupportLeaderboardView } from '@/lib/orgs/support-view';
import { InstallBuiltinPackSection } from '@/components/orgs/install-builtin-pack-section';
import { PpPage, PpPageHeader, PpCard, PpKpiCard, PpKpiGrid, PpEmptyState, PpPill, PpTable } from '@/components/pastel/primitives';
import { Headphones, LifeBuoy, Trophy, Clock, Star, CheckCircle2 } from 'lucide-react';

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
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'ingest.write', { orgId })) {
    notFound();
  }

  const [projects, installs] = await Promise.all([listOrgProjects(orgId), listPluginInstallsForProject(orgId, projectId)]);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    if (projects.length > 0) {
      redirect(`/${locale}/orgs/${orgId}/projects/${projects[0].id}/support`);
    }
    redirect(`/${locale}/orgs/${orgId}`);
  }

  const installViews = installs.map(toPluginInstallView);
  const packInstalled = hasActiveInstall(installViews, SUPPORT_PACK_PLUGIN_ID);

  const t = await getTranslations('Support');

  if (!packInstalled) {
    const installablePacks = builtinMetricPacks().filter((pack) => pack.pluginId === SUPPORT_PACK_PLUGIN_ID);
    return (
      <PpPage>
        <PpPageHeader
          eyebrow="SUPPORT OPERATIONS"
          meta={project.name}
          title={t('title', { projectName: project.name })}
          description={t('setupIntro')}
        />
        <PpCard>
          <InstallBuiltinPackSection orgId={orgId} projectId={projectId} packs={installablePacks} />
        </PpCard>
      </PpPage>
    );
  }

  const [leaderboardResult, people] = await Promise.all([getSupportLeaderboardForProject(orgId, projectId), listOrgPeople(orgId)]);
  const peopleById = new Map(people.map((person) => [person.id, { name: person.name, photoUrl: person.photo_url ?? null }]));
  const leaderboard = toSupportLeaderboardView(leaderboardResult, peopleById);

  const formatDuration = (seconds: number | null): string => {
    if (seconds === null) return t('rowValueUnavailable');
    const { value, unitKey } = formatDurationSeconds(seconds);
    return t(unitKey, { value });
  };

  const totalResolved = leaderboard.rows.reduce((sum, r) => sum + r.ticketsResolved, 0);
  const firstResponseRows = leaderboard.rows.filter((r) => r.avgFirstResponseSeconds !== null);
  const avgFirstResponse =
    firstResponseRows.length > 0
      ? formatDuration(
          Math.round(firstResponseRows.reduce((sum, r) => sum + r.avgFirstResponseSeconds!, 0) / firstResponseRows.length),
        )
      : '—';

  const csatRows = leaderboard.rows.filter((r) => r.avgCsatScore !== null);
  const avgCsat = csatRows.length > 0 ? (csatRows.reduce((sum, r) => sum + r.avgCsatScore!, 0) / csatRows.length).toFixed(1) : null;

  return (
    <PpPage>
      <PpPageHeader
        eyebrow="SUPPORT OPERATIONS"
        meta={leaderboard.rows.length > 0 ? `${leaderboard.rows.length} agents` : undefined}
        title={t('title', { projectName: project.name })}
        description={t('description')}
      />

      <PpKpiGrid>
        <PpKpiCard
          label={t('backlogHeading')}
          value={leaderboard.openBacklog}
          badge={leaderboard.openBacklog > 20 ? 'HIGH' : 'NORMAL'}
          badgeAccent={leaderboard.openBacklog > 20 ? 'amber' : 'mint'}
          accent={leaderboard.openBacklog > 20 ? 'amber' : 'mint'}
          footer={t('backlogLine', { opened: leaderboard.ticketsOpened })}
        />
        <PpKpiCard
          label={t('ticketsResolvedLabel')}
          value={totalResolved}
          accent="primary"
          footer={`${leaderboard.rows.length} active agents`}
        />
        <PpKpiCard
          label={t('avgFirstResponseLabel')}
          value={avgFirstResponse}
          accent="sky"
          footer="Average first reply"
        />
        <PpKpiCard
          label={t('csatLabel')}
          value={avgCsat !== null ? avgCsat : '—'}
          valueSuffix={avgCsat !== null ? '/ 5.0' : undefined}
          accent="mint"
          footer="Customer satisfaction average"
        />
      </PpKpiGrid>

      <PpCard
        icon={Trophy}
        iconAccent="amber"
        title={t('leaderboardHeading')}
        flush={leaderboard.rows.length > 0}
      >
        {leaderboard.rows.length === 0 ? (
          <PpEmptyState
            icon={LifeBuoy}
            title={t('leaderboardHeading')}
            description={t('leaderboardEmpty')}
          />
        ) : (
          <PpTable>
            <thead>
              <tr>
                <th>Agent</th>
                <th className="text-end">Resolved</th>
                <th className="text-end">First Response</th>
                <th className="text-end">Resolution</th>
                <th className="text-end">CSAT</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.rows.map((row, index) => (
                <tr key={row.agentOrgPersonId}>
                  <td>
                    <div className="flex items-center gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-pp-surface-container text-[11px] font-bold text-pp-on-surface-variant">
                        {index + 1}
                      </span>
                      {row.photoUrl ? (
                        <img src={row.photoUrl} alt="" className="h-8 w-8 rounded-full object-cover ring-2 ring-pp-surface-container" />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-pp-primary-fixed text-pp-primary font-bold text-pp-label-sm">
                          {row.name.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <span className="font-semibold text-pp-on-surface">{row.name}</span>
                    </div>
                  </td>
                  <td className="text-end font-semibold text-pp-on-surface">
                    {row.ticketsResolved}
                  </td>
                  <td className="text-end text-pp-on-surface-variant">
                    {formatDuration(row.avgFirstResponseSeconds)}
                  </td>
                  <td className="text-end text-pp-on-surface-variant">
                    {formatDuration(row.avgResolutionSeconds)}
                  </td>
                  <td className="text-end">
                    {row.avgCsatScore === null ? (
                      <span className="text-pp-outline">{t('rowValueUnavailable')}</span>
                    ) : (
                      <PpPill accent={row.avgCsatScore >= 4.5 ? 'mint' : row.avgCsatScore >= 3.5 ? 'amber' : 'pink'}>
                        ★ {row.avgCsatScore.toFixed(1)}
                      </PpPill>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </PpTable>
        )}
      </PpCard>
    </PpPage>
  );
}
