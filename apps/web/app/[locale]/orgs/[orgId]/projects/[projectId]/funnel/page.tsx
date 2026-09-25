import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import {
  listOrgProjects,
  queryProjectFunnelSteps,
  listGoalsForProject,
  listMetricsCatalogForProject,
  listOrgPeople,
  queryCohortRetention,
  getPaybackOverviewForProject,
  getQualityCalibrationBreakdownForProject,
  queryGoalProgress,
} from '@/lib/orgs/queries';
import { resolveSelectedEnvironment } from '@/lib/orgs/selected-environment';
import { buildFunnelGoalsCockpitData } from '@/lib/orgs/funnel-goals-synthesizer';
import { FunnelGoalsDashboard } from '@/components/orgs/funnel-goals-dashboard';
import type {
  FunnelStepsOutcome,
  CohortRetentionOutcome,
  PaybackOverviewOutcome,
  QualityCalibrationBreakdownOutcome,
  GoalProgressOutcome,
} from '@growthos/firebase-orm-models';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'FunnelGoals' });
  return { title: t('metaTitle') };
}

/**
 * Unified Funnel, Goals & Revenue Health Cockpit (Milestone 2):
 * Consolidates the project's own conversion funnel, metric goals with linear pace, the cohort
 * retention matrix, payback velocity (7d..40d) and intent-tier quality calibration.
 *
 * Every section renders only what was measured for this project. Where a query failed or nothing
 * has landed yet, the section says so - it never falls back to sample data (Jira B15).
 */
export default async function FunnelPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Ffunnel`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  const principal = { type: 'user' as const, id: user.id };

  const canExecute = can(bindings, principal, 'automation.execute', { orgId, projectId });
  const canReadDashboards = can(bindings, principal, 'dashboards.read', { orgId, projectId });
  const canWriteDashboards = can(bindings, principal, 'dashboards.write', { orgId, projectId });

  if (!membership || (!canExecute && !canReadDashboards && !canWriteDashboards)) {
    notFound();
  }

  const projects = await listOrgProjects(orgId);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    notFound();
  }

  // KAN-196: every read below is scoped to the environment picked in the project shell (prod by default).
  const { selected: selectedEnvironment } = await resolveSelectedEnvironment(orgId, projectId);
  const environmentScope = { environmentId: selectedEnvironment?.id };

  let funnelOutcome: FunnelStepsOutcome | null = null;
  let cohortOutcome: CohortRetentionOutcome | null = null;
  let paybackOutcome: PaybackOverviewOutcome | null = null;
  let calibrationOutcome: QualityCalibrationBreakdownOutcome | null = null;

  try {
    funnelOutcome = await queryProjectFunnelSteps(orgId, projectId, environmentScope);
  } catch {
    funnelOutcome = null;
  }

  try {
    cohortOutcome = await queryCohortRetention(orgId, projectId, environmentScope);
  } catch {
    cohortOutcome = null;
  }

  try {
    paybackOutcome = await getPaybackOverviewForProject(orgId, projectId, environmentScope);
  } catch {
    paybackOutcome = null;
  }

  try {
    calibrationOutcome = await getQualityCalibrationBreakdownForProject(orgId, projectId, environmentScope);
  } catch {
    calibrationOutcome = null;
  }

  const [goals, metricCatalog, people] = await Promise.all([
    listGoalsForProject(orgId, projectId).catch(() => []),
    listMetricsCatalogForProject(orgId, projectId).catch(() => []),
    listOrgPeople(orgId).catch(() => []),
  ]);

  const personNameById = new Map(people.map((p) => [p.id, p.name]));
  const goalOutcomes = new Map<string, GoalProgressOutcome>();

  if (goals.length > 0) {
    await Promise.all(
      goals.map(async (goal) => {
        try {
          const outcome = await queryGoalProgress(orgId, projectId, goal, environmentScope);
          goalOutcomes.set(goal.id, outcome);
        } catch {
          // Left out of the map: the synthesizer reports this goal's progress as `query_error`.
        }
      }),
    );
  }

  const cockpitData = buildFunnelGoalsCockpitData({
    funnelOutcome,
    goals,
    goalOutcomes,
    personNameById,
    cohortOutcome,
    paybackOutcome,
    calibrationOutcome,
  });

  return (
    <main className="container mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <FunnelGoalsDashboard
        orgId={orgId}
        projectId={projectId}
        projectName={project.name}
        cockpitData={cockpitData}
        canExecute={canExecute}
        metricCatalog={metricCatalog}
        people={people.filter((p) => !p.archived_at).map((p) => ({ id: p.id, name: p.name }))}
      />
    </main>
  );
}
