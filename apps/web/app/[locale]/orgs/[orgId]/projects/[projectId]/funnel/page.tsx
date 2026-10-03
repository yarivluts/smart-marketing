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
  listRawRecordEventsForProject,
} from '@/lib/orgs/queries';
import { buildFunnelGoalsCockpitData } from '@/lib/orgs/funnel-goals-synthesizer';
import { FunnelGoalsDashboard } from '@/components/orgs/funnel-goals-dashboard';
import { MissingIntegrationAlert } from '@/components/integrations/missing-integration-alert';
import type {
  FunnelStepsOutcome,
  CohortRetentionOutcome,
  PaybackOverviewOutcome,
  QualityCalibrationBreakdownOutcome,
  GoalProgressOutcome,
  RawRecordModel,
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
 * Consolidates Visual Conversion Pipelines (EasySign), Dynamic Business Metric Goals,
 * Linear Pace Extrapolations, Cohort Retention Heatmap Matrix, Payback Velocity (7d..40d),
 * and Intent Tier Quality Calibration with instant zero-config synthesis.
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

  const canExecute = can(bindings, principal, 'automation.execute', { orgId });
  const canReadDashboards = can(bindings, principal, 'dashboards.read', { orgId });
  const canWriteDashboards = can(bindings, principal, 'dashboards.write', { orgId });

  if (!membership || (!canExecute && !canReadDashboards && !canWriteDashboards)) {
    notFound();
  }

  const projects = await listOrgProjects(orgId);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    if (projects.length > 0) {
      redirect(`/${locale}/orgs/${orgId}/projects/${projects[0].id}/funnel`);
    }
    redirect(`/${locale}/orgs/${orgId}`);
  }

  let funnelOutcome: FunnelStepsOutcome | null = null;
  let rawRecords: RawRecordModel[] = [];
  let cohortOutcome: CohortRetentionOutcome | null = null;
  let paybackOutcome: PaybackOverviewOutcome | null = null;
  let calibrationOutcome: QualityCalibrationBreakdownOutcome | null = null;

  try {
    funnelOutcome = await queryProjectFunnelSteps(orgId, projectId);
  } catch {
    funnelOutcome = null;
  }

  // When BigQuery is not configured or returns no steps, query landed event records from Firestore
  if (!funnelOutcome || !funnelOutcome.ok || funnelOutcome.steps.length === 0) {
    try {
      rawRecords = await listRawRecordEventsForProject(orgId, projectId);
    } catch {
      rawRecords = [];
    }
  }

  try {
    cohortOutcome = await queryCohortRetention(orgId, projectId);
  } catch {
    cohortOutcome = null;
  }

  try {
    paybackOutcome = await getPaybackOverviewForProject(orgId, projectId);
  } catch {
    paybackOutcome = null;
  }

  try {
    calibrationOutcome = await getQualityCalibrationBreakdownForProject(orgId, projectId);
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
          const outcome = await queryGoalProgress(orgId, projectId, goal);
          goalOutcomes.set(goal.id, outcome);
        } catch {
          // Fallback to synthesizer standard progress calculation
        }
      }),
    );
  }

  const hasWarehouseSteps = Boolean(funnelOutcome && funnelOutcome.ok && funnelOutcome.steps.length > 0);
  const hasEventData = hasWarehouseSteps || rawRecords.length > 0;

  const cockpitData = buildFunnelGoalsCockpitData({
    funnelOutcome,
    rawRecords: !hasWarehouseSteps ? rawRecords : undefined,
    goals,
    goalOutcomes,
    personNameById,
    cohortOutcome,
    paybackOutcome,
    calibrationOutcome,
    projectId,
  });

  return (
    <main className="container mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      {!hasEventData && (
        <MissingIntegrationAlert
          orgId={orgId}
          projectId={projectId}
          metricKey="CONVERSION_FUNNEL"
          connectorId="growthos_sdk"
          customTitle="Tracking SDK & Funnel Telemetry"
          customMissingPoints={[
            'Step progression telemetry (Landing -> Signup -> Activation -> Paid)',
            'Web SDK page view pings and persistent client anonymous IDs',
          ]}
          customImpactMetrics={['Multi-Step Conversion Funnel Velocity', 'Dropoff Bottleneck Diagnostics', 'True ROI Attribution']}
        />
      )}

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
