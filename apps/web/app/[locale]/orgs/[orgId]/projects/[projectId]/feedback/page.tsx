import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { FEEDBACK_PACK_PLUGIN_ID } from '@growthos/firebase-orm-models';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import {
  builtinMetricPacks,
  getFeedbackThemeDigestForProject,
  getNpsOverviewForProject,
  listOrgProjects,
  listPluginInstallsForProject,
} from '@/lib/orgs/queries';
import { hasActiveInstall, toPluginInstallView } from '@/lib/orgs/plugin-view';
import { feedbackThemeLabelKey } from '@/lib/orgs/feedback-view';
import { InstallBuiltinPackSection } from '@/components/orgs/install-builtin-pack-section';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Feedback' });
  return { title: t('metaTitle') };
}

/**
 * A project's NPS score, trend, and "top complaint this month" theme digest
 * (KAN-82, plan `14 §Gap 1`). Gated on `ingest.write`, same "whole feature,
 * not just mutation, is admin-only" posture as the sibling billing-ops-feed/
 * ingest-health pages — this reads landed `survey_response` raw records the
 * same way those pages read their own event schemas. Before the Feedback &
 * NPS pack is installed (no `survey_response` schema/metrics registered
 * yet), this page shows the same one-click install card the Plugins page
 * offers rather than an empty dashboard — reusing `InstallBuiltinPackSection`
 * exactly, no separate install UI. Theme clustering is a deterministic
 * keyword heuristic (`clusterFeedbackThemes`), a buildable-today stand-in
 * for a real LLM call, same posture KAN-55 established.
 */
export default async function FeedbackPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Ffeedback`);
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
  const packInstalled = hasActiveInstall(installViews, FEEDBACK_PACK_PLUGIN_ID);

  const t = await getTranslations('Feedback');

  if (!packInstalled) {
    const installablePacks = builtinMetricPacks().filter((pack) => pack.pluginId === FEEDBACK_PACK_PLUGIN_ID);
    return (
      <main className="container mx-auto flex max-w-3xl flex-col gap-8 py-16">
        <h1 className="text-3xl font-bold tracking-tight">{t('title', { projectName: project.name })}</h1>
        <p className="text-sm text-muted-foreground">{t('setupIntro')}</p>
        <InstallBuiltinPackSection orgId={orgId} projectId={projectId} packs={installablePacks} />
      </main>
    );
  }

  const [overview, themeDigest] = await Promise.all([
    getNpsOverviewForProject(orgId, projectId),
    getFeedbackThemeDigestForProject(orgId, projectId),
  ]);

  return (
    <main className="container mx-auto flex max-w-3xl flex-col gap-8 py-16">
      <h1 className="text-3xl font-bold tracking-tight">{t('title', { projectName: project.name })}</h1>
      <p className="text-sm text-muted-foreground">{t('description')}</p>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold tracking-tight">{t('npsHeading')}</h2>
        {overview.overall.totalResponses === 0 ? (
          <p className="text-muted-foreground">{t('npsEmpty')}</p>
        ) : (
          <div className="flex flex-col gap-2 rounded-md border border-input px-4 py-3">
            <span className="text-4xl font-bold tracking-tight">{overview.overall.npsScore}</span>
            <span className="text-sm text-muted-foreground">
              {t('npsBreakdownLine', {
                promoters: overview.overall.promoters,
                passives: overview.overall.passives,
                detractors: overview.overall.detractors,
                total: overview.overall.totalResponses,
              })}
            </span>
          </div>
        )}
        <ul className="flex flex-wrap gap-1" aria-label={t('trendSparklineLabel')}>
          {overview.dailyTrend.map((point) => (
            <li
              key={point.date}
              title={`${point.date}: ${point.breakdown.totalResponses === 0 ? t('trendPointEmpty') : point.breakdown.npsScore}`}
              className="h-6 w-2 rounded-sm bg-muted"
              style={point.breakdown.totalResponses > 0 ? { opacity: 0.4 + Math.min(point.breakdown.totalResponses, 5) * 0.12 } : undefined}
            />
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold tracking-tight">{t('themeDigestHeading')}</h2>
        {themeDigest.length === 0 ? (
          <p className="text-muted-foreground">{t('themeDigestEmpty')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {themeDigest.map((cluster) => (
              <li key={cluster.theme} className="flex flex-col gap-1 rounded-md border border-input px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{t(feedbackThemeLabelKey(cluster.theme))}</span>
                  <span className="text-xs text-muted-foreground">{t('themeCommentCount', { count: cluster.commentCount })}</span>
                </div>
                {cluster.exampleComments.map((comment, index) => (
                  <span key={index} className="text-muted-foreground">
                    {t('themeExampleComment', { comment })}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
