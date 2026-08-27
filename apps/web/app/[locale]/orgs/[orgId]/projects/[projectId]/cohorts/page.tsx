import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { listOrgProjects, queryCohortRetention } from '@/lib/orgs/queries';
import { buildCohortRetentionView } from '@/lib/orgs/cohort-retention-view';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'CohortRetention' });
  return { title: t('metaTitle') };
}

/**
 * A project's monthly-cohort retention matrix (KAN-112): the exact same warehouse-backed
 * `cohort_month x period_number` read `queryProjectCohortRetention` (`mcp-tools.service.ts`, KAN-75)
 * already exposes to an MCP-connected AI agent through the `query_cohort` tool, but — the same shape of
 * gap KAN-108 (`search_customers`) and KAN-111 (`query_funnel`) already closed — with no route or page
 * anywhere under `apps/web` ever calling it: an operator could ask an agent how a cohort's retention
 * trends, but had no way to see the same matrix themselves in the web app. Wrapped through
 * `queryProjectCohortRetentionForAdmin` so the three expected-not-buggy warehouse failure modes degrade
 * this page's table the same honest way the Customers/Funnel pages already degrade theirs, rather than
 * crashing. Gated on `dashboards.write`, the same "whole feature is admin-only" posture Segments/Goals/
 * Win rules already use for this kind of analytics view.
 */
export default async function CohortRetentionPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Fcohorts`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'dashboards.write', { orgId })) {
    notFound();
  }

  const projects = await listOrgProjects(orgId);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    notFound();
  }

  const view = buildCohortRetentionView(await queryCohortRetention(orgId, projectId));
  const t = await getTranslations('CohortRetention');

  return (
    <main className="container mx-auto flex max-w-3xl flex-col gap-8 py-16">
      <h1 className="text-3xl font-bold tracking-tight">{t('title', { projectName: project.name })}</h1>
      <p className="text-sm text-muted-foreground">{t('description')}</p>

      {view.kind === 'warehouse_not_configured' ? (
        <p className="text-muted-foreground">{t('notConfigured')}</p>
      ) : view.kind === 'quota_exceeded' ? (
        <p className="text-muted-foreground">{t('quotaExceeded')}</p>
      ) : view.kind === 'query_error' ? (
        <p className="text-muted-foreground">{t('queryError')}</p>
      ) : view.cohorts.length === 0 ? (
        <p className="text-muted-foreground">{t('empty')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="border-b border-input px-3 py-2 text-left">{t('cohortColumnHeading')}</th>
                <th className="border-b border-input px-3 py-2 text-right">{t('cohortSizeColumnHeading')}</th>
                {view.periodNumbers.map((periodNumber) => (
                  <th key={periodNumber} className="border-b border-input px-3 py-2 text-right">
                    {t('periodColumnHeading', { periodNumber })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {view.cohorts.map((cohort) => {
                const percentByPeriod = new Map(cohort.periods.map((period) => [period.periodNumber, period.retentionRatePercent]));
                return (
                  <tr key={cohort.cohortMonth}>
                    <td className="border-b border-input px-3 py-2">{cohort.cohortMonth}</td>
                    <td className="border-b border-input px-3 py-2 text-right">{cohort.cohortSize}</td>
                    {view.periodNumbers.map((periodNumber) => (
                      <td key={periodNumber} className="border-b border-input px-3 py-2 text-right text-muted-foreground">
                        {percentByPeriod.has(periodNumber) ? t('retentionCell', { percent: percentByPeriod.get(periodNumber)! }) : ''}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
