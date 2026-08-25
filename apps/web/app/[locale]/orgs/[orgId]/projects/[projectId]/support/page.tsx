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
    notFound();
  }

  const installViews = installs.map(toPluginInstallView);
  const packInstalled = hasActiveInstall(installViews, SUPPORT_PACK_PLUGIN_ID);

  const t = await getTranslations('Support');

  if (!packInstalled) {
    const installablePacks = builtinMetricPacks().filter((pack) => pack.pluginId === SUPPORT_PACK_PLUGIN_ID);
    return (
      <main className="container mx-auto flex max-w-3xl flex-col gap-8 py-16">
        <h1 className="text-3xl font-bold tracking-tight">{t('title', { projectName: project.name })}</h1>
        <p className="text-sm text-muted-foreground">{t('setupIntro')}</p>
        <InstallBuiltinPackSection orgId={orgId} projectId={projectId} packs={installablePacks} />
      </main>
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

  return (
    <main className="container mx-auto flex max-w-3xl flex-col gap-8 py-16">
      <h1 className="text-3xl font-bold tracking-tight">{t('title', { projectName: project.name })}</h1>
      <p className="text-sm text-muted-foreground">{t('description')}</p>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold tracking-tight">{t('backlogHeading')}</h2>
        <div className="flex flex-col gap-2 rounded-md border border-input px-4 py-3">
          <span className="text-4xl font-bold tracking-tight">{leaderboard.openBacklog}</span>
          <span className="text-sm text-muted-foreground">{t('backlogLine', { opened: leaderboard.ticketsOpened })}</span>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold tracking-tight">{t('leaderboardHeading')}</h2>
        {leaderboard.rows.length === 0 ? (
          <p className="text-muted-foreground">{t('leaderboardEmpty')}</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {leaderboard.rows.map((row, index) => (
              <li key={row.agentOrgPersonId} className="flex items-center justify-between gap-3 rounded-md border border-input px-3 py-2 text-sm">
                <span className="flex items-center gap-2 font-medium">
                  {row.photoUrl ? (
                    <img src={row.photoUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
                  ) : null}
                  {t('rankedName', { rank: index + 1, name: row.name })}
                </span>
                <span className="text-muted-foreground">
                  {t('rowSummary', {
                    resolved: row.ticketsResolved,
                    firstResponse: formatDuration(row.avgFirstResponseSeconds),
                    resolution: formatDuration(row.avgResolutionSeconds),
                    csat: row.avgCsatScore === null ? t('rowValueUnavailable') : row.avgCsatScore.toFixed(1),
                  })}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
