import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { checkProjectQueryQuota, getProjectCostQuota, listOrgProjects, listQueryCostLogEntriesForProject } from '@/lib/orgs/queries';
import { formatLabels, outcomeLabelKey, toProjectCostQuotaView, toQueryCostLogEntryView } from '@/lib/orgs/cost-guardrail-view';
import { SetCostQuotaForm } from '@/components/orgs/set-cost-quota-form';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'CostGuardrails' });
  return { title: t('metaTitle') };
}

/**
 * A project's KAN-39 cost guardrails (plan `13 §E4.3`): the daily query
 * quota + labels config a real BigQuery job would carry, today's usage
 * against that quota, and the query cost log every non-cache-hit
 * `queryMetrics` call writes to — the AC's "cost per project visible on an
 * internal dashboard". Gated on `project.manage`, the same per-project
 * admin-config permission `project_admin` already holds — see
 * `cost-guardrails/quota/route.ts`'s own doc comment for why that permission
 * over `metrics.write`/`billing.manage`.
 */
export default async function CostGuardrailsPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Fcost-guardrails`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'project.manage', { orgId })) {
    notFound();
  }

  const [projects, quota, quotaStatus, logEntries] = await Promise.all([
    listOrgProjects(orgId),
    getProjectCostQuota(orgId, projectId),
    checkProjectQueryQuota(orgId, projectId),
    listQueryCostLogEntriesForProject(orgId, projectId),
  ]);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    notFound();
  }

  const quotaView = toProjectCostQuotaView(quota);
  const logViews = logEntries.map(toQueryCostLogEntryView);

  const t = await getTranslations('CostGuardrails');

  return (
    <main className="container mx-auto flex max-w-3xl flex-col gap-8 py-16">
      <h1 className="text-3xl font-bold tracking-tight">{t('title', { projectName: project.name })}</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('usageHeading')}</h2>
        <p className="text-sm text-muted-foreground">
          {t('usageLine', { attempted: quotaStatus.attemptedToday, limit: quotaStatus.limit, remaining: quotaStatus.remaining })}
        </p>
        {quotaView.setAt ? (
          <p className="text-xs text-muted-foreground">{t('labelsCurrent', { labels: formatLabels(quotaView.labels) || t('noLabels') })}</p>
        ) : (
          <p className="text-xs text-muted-foreground">{t('defaultQuotaNote')}</p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('setQuotaHeading')}</h2>
        <SetCostQuotaForm orgId={orgId} projectId={projectId} dailyQueryLimit={quotaView.dailyQueryLimit} labels={quotaView.labels} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('logHeading')}</h2>
        {logViews.length === 0 ? (
          <p className="text-muted-foreground">{t('noLogEntries')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {logViews.map((entry) => (
              <li key={entry.id} className="flex flex-col gap-1 rounded-md border border-input px-3 py-2 text-sm">
                <span className="font-medium">{t('logEntrySummary', { outcome: t(outcomeLabelKey(entry.outcome)), executedAt: entry.executedAt })}</span>
                <span className="text-muted-foreground">
                  {Object.keys(entry.definitionRefs).length > 0
                    ? t('logEntryDefinitions', { definitions: Object.values(entry.definitionRefs).join(', ') })
                    : t('logEntryNoDefinitions')}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">{t('logCapNote', { count: logViews.length })}</p>
      </section>
    </main>
  );
}
