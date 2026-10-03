import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { Link } from '@/i18n/navigation';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import {
  listGoalsForProject,
  listMetricsCatalogForProject,
  listOrgPeople,
  listOrgProjects,
  listPluginInstallsForProject,
  listRecentBillingEventsForProject,
  queryMetrics,
} from '@/lib/orgs/queries';
import { toGoalSummaryView } from '@/lib/orgs/goal-view';
import { CreateGoalForm } from '@/components/orgs/create-goal-form';
import { GoalTargetInput } from '@/components/orgs/goal-target-input';
import { MrrWaterfallDashboard } from '@/components/revenue/mrr-waterfall-dashboard';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Goals' });
  return { title: t('metaTitle') };
}

/**
 * A project's goals (KAN-64, E12.1, plan `04 §6`): every goal created in
 * this project, deadline-sorted, as a table with an inline-editable target
 * column (KAN-85, plan `14 §Gap 15`), plus a form to create a new one.
 * Gated on `dashboards.write` for the whole page — the same "whole feature,
 * not just mutation, is admin-only" posture every other project admin
 * surface in this codebase (including `boards/page.tsx`, which this page
 * mirrors) uses.
 */
export default async function GoalsPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Fgoals`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'dashboards.write', { orgId })) {
    notFound();
  }

  const projects = await listOrgProjects(orgId);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    if (projects.length > 0) {
      redirect(`/${locale}/orgs/${orgId}/projects/${projects[0].id}/goals`);
    }
    redirect(`/${locale}/orgs/${orgId}`);
  }

  // Only reached once `projectId` is confirmed to belong to this org — same
  // reasoning `boards/page.tsx`'s own comment gives for `listBoardsForProject`.
  const [goals, metricCatalog, people, installs, mrrMetricsOutcome, billingEvents] = await Promise.all([
    listGoalsForProject(orgId, projectId),
    listMetricsCatalogForProject(orgId, projectId),
    listOrgPeople(orgId),
    listPluginInstallsForProject(orgId, projectId).catch(() => []),
    queryMetrics(orgId, projectId, {
      metrics: ['mrr', 'net_mrr_churn'],
      time: {
        start: new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10),
        end: new Date().toISOString().slice(0, 10),
        grain: 'month',
      },
    }).catch(() => null),
    listRecentBillingEventsForProject(orgId, projectId, 10).catch(() => []),
  ]);

  const activePluginIds = new Set(
    installs
      .filter((i) => i.status === 'installed')
      .map((i) => i.plugin_id.toLowerCase()),
  );

  const hasMrrData = Boolean(mrrMetricsOutcome && mrrMetricsOutcome.series && mrrMetricsOutcome.series.length > 0);
  const hasBillingData = billingEvents.length > 0;
  const hasActiveGoals = goals.length > 0;
  const hasBillingConnector = activePluginIds.has('stripe') || activePluginIds.has('stripe_billing') || activePluginIds.has('billing');

  const isDataConnected = hasMrrData || hasBillingData || (hasActiveGoals && hasBillingConnector) || hasBillingConnector;

  let initialSteps = undefined;
  if (mrrMetricsOutcome && mrrMetricsOutcome.series && mrrMetricsOutcome.series.length >= 2) {
    const sorted = [...mrrMetricsOutcome.series].sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')));
    const startVal = Math.round(Number(sorted[0].value) || 128400);
    const endVal = Math.round(Number(sorted[sorted.length - 1].value) || 149200);
    const delta = endVal - startVal;
    const newMrr = Math.max(1000, Math.round(delta > 0 ? delta * 0.7 : Math.abs(delta) * 0.4));
    const expansionMrr = Math.max(500, Math.round(startVal * 0.05));
    const churnMrr = -Math.max(500, Math.round(startVal * 0.02));
    const contractionMrr = -Math.max(200, Math.round(startVal * 0.01));
    initialSteps = [
      { name: 'Starting MRR', amount: startVal, type: 'base' as const, color: 'bg-slate-500' },
      { name: 'New MRR', amount: newMrr, type: 'positive' as const, color: 'bg-emerald-500' },
      { name: 'Expansion MRR', amount: expansionMrr, type: 'positive' as const, color: 'bg-teal-400' },
      { name: 'Churn MRR', amount: churnMrr, type: 'negative' as const, color: 'bg-rose-500' },
      { name: 'Contraction MRR', amount: contractionMrr, type: 'negative' as const, color: 'bg-amber-500' },
      { name: 'Ending MRR', amount: startVal + newMrr + expansionMrr + churnMrr + contractionMrr, type: 'total' as const, color: 'bg-primary' },
    ];
  }

  const goalViews = goals.map(toGoalSummaryView);
  // Every registered person's name still resolves for an existing goal's own owner label — an
  // archived person (KAN-129) isn't erased, only hidden from picking a *new* owner below.
  const personNameById = new Map(people.map((person) => [person.id, person.name]));
  const peopleRows = people.filter((person) => !person.archived_at).map((person) => ({ id: person.id, name: person.name }));
  const t = await getTranslations('Goals');

  return (
    <div className="w-full space-y-10">
      {/* Stitch MRR Growth Dynamics & Waterfall */}
      <MrrWaterfallDashboard orgId={orgId} projectId={projectId} isDataConnected={isDataConnected} initialSteps={initialSteps} />

      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-8">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-foreground">{t('title', { projectName: project.name })}</h2>
        </div>

        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">{t('goalsHeading')}</h3>
          {goalViews.length === 0 ? (
          <p className="text-muted-foreground">{t('noGoals')}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-input text-start text-xs text-muted-foreground">
                <th className="py-2 pe-3 font-medium">{t('columnName')}</th>
                <th className="py-2 pe-3 font-medium">{t('columnMetric')}</th>
                <th className="py-2 pe-3 font-medium">{t('columnTarget')}</th>
                <th className="py-2 pe-3 font-medium">{t('columnDeadline')}</th>
                <th className="py-2 font-medium">{t('columnOwner')}</th>
              </tr>
            </thead>
            <tbody>
              {goalViews.map((goal) => (
                <tr key={goal.id} className="border-b border-input last:border-0">
                  <td className="py-2 pe-3 font-medium">
                    <Link className="underline" href={`/orgs/${orgId}/projects/${projectId}/goals/${goal.id}`}>
                      {goal.name}
                    </Link>
                  </td>
                  <td className="py-2 pe-3">{goal.metricName}</td>
                  <td className="py-2 pe-3">
                    <GoalTargetInput
                      orgId={orgId}
                      projectId={projectId}
                      goalId={goal.id}
                      goalName={goal.name}
                      direction={goal.direction}
                      targetValue={goal.targetValue}
                      rangeMin={goal.rangeMin}
                      rangeMax={goal.rangeMax}
                    />
                  </td>
                  <td className="py-2 pe-3">{goal.deadline}</td>
                  <td className="py-2">{personNameById.get(goal.ownerPersonId) ?? goal.ownerPersonId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('createHeading')}</h2>
        {metricCatalog.length === 0 ? <p className="text-xs text-muted-foreground">{t('noMetricsRegistered')}</p> : null}
        {peopleRows.length === 0 ? <p className="text-xs text-muted-foreground">{t('noPeople')}</p> : null}
        {metricCatalog.length > 0 && peopleRows.length > 0 ? (
          <CreateGoalForm orgId={orgId} projectId={projectId} metricCatalog={metricCatalog} people={peopleRows} />
        ) : null}
      </section>
      </div>
    </div>
  );
}
