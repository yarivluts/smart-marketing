import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { CHURN_REASON_PACK_PLUGIN_ID } from '@growthos/firebase-orm-models';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import {
  builtinMetricPacks,
  getChurnReasonCategoryBreakdownForProject,
  getChurnReasonThemeDigestForProject,
  listChurnReasonRecordsForProject,
  listOrgProjects,
  listPluginInstallsForProject,
} from '@/lib/orgs/queries';
import { hasActiveInstall, toPluginInstallView } from '@/lib/orgs/plugin-view';
import { churnReasonCategoryLabelKey } from '@/lib/orgs/churn-reason-view';
import { InstallBuiltinPackSection } from '@/components/orgs/install-builtin-pack-section';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'ChurnReasons' });
  return { title: t('metaTitle') };
}

/**
 * A project's churn-reason category breakdown and "live taxonomy" theme
 * digest (KAN-84, plan `14 §Gap 10`). Gated on `ingest.write`, same "whole
 * feature, not just mutation, is admin-only" posture as the sibling
 * Feedback/billing-ops-feed pages — this reads landed `churn_reason` raw
 * records the same way those pages read their own event schemas. Before
 * the Churn Reasons pack is installed (no `churn_reason` schema/metric
 * registered yet), this page shows the same one-click install card the
 * Plugins page offers rather than an empty dashboard, reusing
 * `InstallBuiltinPackSection` exactly. The richer "breakdown joined to
 * plan/channel/cohort" report lives on a project's own Boards, once the
 * pack's `churn_events` metric is registered — this page covers the raw
 * category counts and the AI-clustered theme digest, not a full breakdown
 * table. Theme clustering is a deterministic keyword heuristic
 * (`clusterChurnReasons`), a buildable-today stand-in for a real LLM call,
 * same posture KAN-55/KAN-82 established.
 */
export default async function ChurnReasonsPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Fchurn-reasons`);
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
  const packInstalled = hasActiveInstall(installViews, CHURN_REASON_PACK_PLUGIN_ID);

  const t = await getTranslations('ChurnReasons');

  if (!packInstalled) {
    const installablePacks = builtinMetricPacks().filter((pack) => pack.pluginId === CHURN_REASON_PACK_PLUGIN_ID);
    return (
      <main className="container mx-auto flex max-w-3xl flex-col gap-8 py-16">
        <h1 className="text-3xl font-bold tracking-tight">{t('title', { projectName: project.name })}</h1>
        <p className="text-sm text-muted-foreground">{t('setupIntro')}</p>
        <InstallBuiltinPackSection orgId={orgId} projectId={projectId} packs={installablePacks} />
      </main>
    );
  }

  const churnReasonRecords = await listChurnReasonRecordsForProject(orgId, projectId);
  const [breakdown, themeDigest] = await Promise.all([
    getChurnReasonCategoryBreakdownForProject(orgId, projectId, { precomputedRecords: churnReasonRecords }),
    getChurnReasonThemeDigestForProject(orgId, projectId, { precomputedRecords: churnReasonRecords }),
  ]);

  return (
    <main className="container mx-auto flex max-w-3xl flex-col gap-8 py-16">
      <h1 className="text-3xl font-bold tracking-tight">{t('title', { projectName: project.name })}</h1>
      <p className="text-sm text-muted-foreground">{t('description')}</p>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold tracking-tight">{t('categoryHeading')}</h2>
        {breakdown.totalReasons === 0 ? (
          <p className="text-muted-foreground">{t('categoryEmpty')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {breakdown.byCategory.map((entry) => (
              <li key={entry.category} className="flex items-center justify-between gap-3 rounded-md border border-input px-3 py-2 text-sm">
                <span className="font-medium">{t(churnReasonCategoryLabelKey(entry.category))}</span>
                <span className="text-muted-foreground">{t('categoryCount', { count: entry.count })}</span>
              </li>
            ))}
          </ul>
        )}
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
                  <span className="font-medium">{t(churnReasonCategoryLabelKey(cluster.theme))}</span>
                  <span className="text-xs text-muted-foreground">{t('themeReasonCount', { count: cluster.reasonCount })}</span>
                </div>
                {cluster.exampleReasons.map((reason, index) => (
                  <span key={index} className="text-muted-foreground">
                    {t('themeExampleReason', { reason })}
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
