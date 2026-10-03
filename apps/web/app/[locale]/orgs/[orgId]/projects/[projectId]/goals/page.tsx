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
import {
  PpPage,
  PpPageHeader,
  PpKpiGrid,
  PpKpiCard,
  PpCard,
  PpTable,
  PpEmptyState,
} from '@/components/pastel/primitives';
import { Target, Sparkles, PlusCircle } from 'lucide-react';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Goals' });
  return { title: t('metaTitle') };
}

/**
 * A project's goals (KAN-64, E12.1):
 * Every goal created in this project, deadline-sorted, as a table with an inline-editable target column,
 * plus a form to create a new one.
 *
 * Converted to Stitch Pastel Pulse design (desktop 334260f3 + 5ebfb821, mobile b6175567),
 * folding all real goals and creation form into the layout without fake waterfall metrics.
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

  const hasMrrData = Boolean(mrrMetricsOutcome && mrrMetricsOutcome.series && mrrMetricsOutcome.series.length > 0);
  const hasActiveGoals = goals.length > 0;

  const goalViews = goals.map(toGoalSummaryView);
  const personNameById = new Map(people.map((person) => [person.id, person.name]));
  const peopleRows = people.filter((person) => !person.archived_at).map((person) => ({ id: person.id, name: person.name }));
  const t = await getTranslations('Goals');

  return (
    <PpPage>
      {/* 1. Header */}
      <PpPageHeader
        eyebrow="GROWTH TARGETS & OBJECTIVES"
        meta={hasActiveGoals ? `${goals.length} Active Goals Tracked` : 'No Active Goals'}
        title={t('title', { projectName: project.name })}
        description="Define, track, and dynamically calibrate growth objectives, targets, and deadlines"
        actions={
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-pp-secondary-container/60 px-3 py-1.5 text-xs font-semibold text-pp-secondary">
              <span className="w-1.5 h-1.5 rounded-full bg-pp-secondary animate-pulse" />
              <span>{hasMrrData ? 'Telemetry Linked' : 'Active Registry'}</span>
            </span>
          </div>
        }
      />

      {/* 2. Top KPI Deck */}
      <PpKpiGrid>
        <PpKpiCard
          label="Active Goals"
          value={goals.length}
          valueSuffix="goals"
          accent="primary"
          footer="Project milestones"
        />
        <PpKpiCard
          label="Metric Catalog"
          value={metricCatalog.length}
          valueSuffix="metrics"
          badge="Available"
          badgeAccent="mint"
          accent="mint"
          footer="Measurable growth keys"
        />
        <PpKpiCard
          label="Team Assignees"
          value={peopleRows.length}
          valueSuffix="members"
          badge="Owners"
          badgeAccent="sky"
          accent="sky"
          footer="Eligible project owners"
        />
        <PpKpiCard
          label="Billing Events"
          value={billingEvents.length}
          valueSuffix="events"
          badge={billingEvents.length > 0 ? 'Linked' : 'Zero'}
          badgeAccent={billingEvents.length > 0 ? 'pink' : 'neutral'}
          accent="pink"
          footer="Recent telemetry records"
        />
      </PpKpiGrid>

      {/* 3. Section 1: Goals Registry Table */}
      <PpCard
        title={t('goalsHeading')}
        subtitle="Deadline-sorted project objectives with inline-editable targets"
        icon={Target}
        iconAccent="primary"
        flush={goalViews.length > 0}
      >
        {goalViews.length === 0 ? (
          <PpEmptyState
            icon={Target}
            title={t('goalsHeading')}
            description={t('noGoals')}
          />
        ) : (
          <PpTable>
            <thead>
              <tr>
                <th>{t('columnName')}</th>
                <th>{t('columnMetric')}</th>
                <th>{t('columnTarget')}</th>
                <th>{t('columnDeadline')}</th>
                <th>{t('columnOwner')}</th>
              </tr>
            </thead>
            <tbody>
              {goalViews.map((goal) => (
                <tr key={goal.id}>
                  <td className="font-semibold text-pp-on-surface">
                    <Link className="hover:underline text-pp-primary" href={`/orgs/${orgId}/projects/${projectId}/goals/${goal.id}`}>
                      {goal.name}
                    </Link>
                  </td>
                  <td className="text-pp-on-surface-variant font-mono text-xs">
                    {goal.metricName}
                  </td>
                  <td>
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
                  <td className="tabular-nums font-mono text-xs text-pp-on-surface">
                    {goal.deadline}
                  </td>
                  <td className="text-pp-body-sm text-pp-on-surface-variant">
                    {goal.ownerPersonId ? (personNameById.get(goal.ownerPersonId) ?? goal.ownerPersonId) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </PpTable>
        )}
      </PpCard>

      {/* 4. Section 2: Create Goal Form */}
      <PpCard
        title={t('createHeading')}
        subtitle="Provision a new measurable performance objective for this project"
        icon={PlusCircle}
        iconAccent="mint"
      >
        <CreateGoalForm
          orgId={orgId}
          projectId={projectId}
          metricCatalog={metricCatalog.map((m) => ({ name: m.name, dimensions: m.dimensions }))}
          people={peopleRows}
        />
      </PpCard>
    </PpPage>
  );
}
