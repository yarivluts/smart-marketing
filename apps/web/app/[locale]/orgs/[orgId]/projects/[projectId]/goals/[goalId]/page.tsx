import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ArrowLeft, Edit3, Sliders, Target, TrendingUp } from 'lucide-react';
import { can } from '@growthos/shared';
import { Link } from '@/i18n/navigation';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import {
  getGoal,
  listMetricsCatalogForProject,
  listOrgPeople,
  listOrgProjects,
  queryGoalProgress,
} from '@/lib/orgs/queries';
import { buildGoalThermometerView, buildGoalForecastView } from '@/lib/orgs/goal-view';
import {
  PpButton,
  PpCard,
  PpKpiCard,
  PpKpiGrid,
  PpMobileActionBar,
  PpPage,
  PpPageHeader,
  PpPill,
} from '@/components/pastel/primitives';
import { GoalThermometer } from '@/components/orgs/goal-thermometer';
import { GoalMonteCarloCard } from '@/components/orgs/goal-monte-carlo-card';
import { DeleteGoalButton } from '@/components/orgs/delete-goal-button';
import { EditGoalForm } from '@/components/orgs/edit-goal-form';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string; goalId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Goals' });
  return { title: t('metaTitle') };
}

/**
 * Stitch "Pastel Pulse" goal detail view (desktop 7ccbd2e5, mobile 65ee3ca3).
 *
 * Detailed linear pace thermometer, trajectory milestones, goal governance
 * attributes, and inline target adjustment form.
 */
export default async function GoalDetailPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId, goalId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Fgoals%2F${goalId}`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'dashboards.write', { orgId })) {
    notFound();
  }

  const [projects, goal, people, metricCatalog] = await Promise.all([
    listOrgProjects(orgId),
    getGoal(orgId, projectId, goalId),
    listOrgPeople(orgId),
    listMetricsCatalogForProject(orgId, projectId),
  ]);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    if (projects.length > 0) {
      redirect(`/${locale}/orgs/${orgId}/projects/${projects[0].id}/goals`);
    }
    redirect(`/${locale}/orgs/${orgId}`);
  }
  if (!goal) {
    redirect(`/${locale}/orgs/${orgId}/projects/${projectId}/goals`);
  }

  const outcome = await queryGoalProgress(orgId, projectId, goal);
  const thermometerView = buildGoalThermometerView(outcome);
  const forecastView =
    thermometerView.kind === 'ok' ? buildGoalForecastView(thermometerView.forecast) : null;
  const peopleRows = people.map((person) => ({ id: person.id, name: person.name }));
  const ownerName = peopleRows.find((person) => person.id === goal.owner_person_id)?.name ?? goal.owner_person_id;

  const t = await getTranslations('Goals');

  const statusAccent =
    thermometerView.kind === 'ok'
      ? thermometerView.status === 'on_track'
        ? 'mint'
        : thermometerView.status === 'at_risk'
          ? 'amber'
          : 'error'
      : 'neutral';

  const targetDisplay =
    goal.direction === 'range'
      ? `${goal.range_min ?? 0} — ${goal.range_max ?? 0}`
      : `${goal.target_value ?? '—'}`;

  return (
    <PpPage>
      <PpPageHeader
        eyebrow={t('eyebrow')}
        meta={`Project: ${project.name}`}
        title={
          <div className="flex flex-wrap items-center gap-3">
            <span>{goal.name}</span>
            {thermometerView.kind === 'ok' ? (
              <PpPill accent={statusAccent} dot>
                {t(`paceStatus.${thermometerView.status}`)}
              </PpPill>
            ) : null}
          </div>
        }
        description={
          <span className="font-mono text-xs text-pp-outline">
            {goal.metric_name} • {t(`directionOption.${goal.direction}`)}
          </span>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <PpButton variant="secondary" size="sm" asChild>
              <Link href={`/orgs/${orgId}/projects/${projectId}/goals`} className="inline-flex items-center gap-1.5">
                <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />
                <span>{t('backToGoals')}</span>
              </Link>
            </PpButton>
            <DeleteGoalButton orgId={orgId} projectId={projectId} goalId={goalId} />
          </div>
        }
      />

      {/* KPI Overview Grid */}
      <PpKpiGrid>
        <PpKpiCard
          label={t('actualValueLabel')}
          value={
            thermometerView.kind === 'ok'
              ? thermometerView.actualValue.toLocaleString(locale, { maximumFractionDigits: 2 })
              : '—'
          }
          accent={statusAccent}
          badge={thermometerView.kind === 'ok' ? `${Math.round(thermometerView.percentFilled)}%` : undefined}
          badgeAccent={statusAccent}
          footer={
            thermometerView.kind === 'ok'
              ? t('goalMetLabel', { met: thermometerView.isGoalMet ? t('yes') : t('no') })
              : undefined
          }
        />
        <PpKpiCard
          label={t('targetValueLabel')}
          value={targetDisplay}
          accent="sky"
          badge={t(`directionOption.${goal.direction}`)}
          badgeAccent="sky"
          footer={goal.metric_name}
        />
        <PpKpiCard
          label={t('expectedAtNowLabel')}
          value={
            thermometerView.kind === 'ok'
              ? thermometerView.expectedAtNow.toLocaleString(locale, { maximumFractionDigits: 2 })
              : '—'
          }
          accent="amber"
          badge={t(`rhythmOption.${goal.rhythm}`)}
          badgeAccent="amber"
          footer={`Start: ${goal.start_date}`}
        />
        <PpKpiCard
          label={t('projectedFinalValueLabel')}
          value={
            thermometerView.kind === 'ok'
              ? thermometerView.projectedFinalValue.toLocaleString(locale, { maximumFractionDigits: 2 })
              : '—'
          }
          accent={thermometerView.kind === 'ok' && thermometerView.isGoalMet ? 'mint' : 'pink'}
          badge={thermometerView.kind === 'ok' && thermometerView.isGoalMet ? 'On Pace' : undefined}
          badgeAccent="mint"
          footer={`Deadline: ${goal.deadline}`}
        />
      </PpKpiGrid>

      {/* Hero Pacing Thermometer Card */}
      <PpCard
        title={t('thermometerHeading')}
        subtitle={t('thermometerSubtitle')}
        icon={TrendingUp}
        iconAccent="mint"
        action={
          thermometerView.kind === 'ok' ? (
            <PpPill accent={statusAccent} dot>
              {t(`paceStatus.${thermometerView.status}`)}
            </PpPill>
          ) : undefined
        }
      >
        <div className="py-2">
          <GoalThermometer view={thermometerView} />
        </div>
      </PpCard>

      {/* AI Monte Carlo Predictive Pace & Trajectory Card (KAN-308 / Stitch 7ccbd2e5) */}
      {forecastView ? (
        <GoalMonteCarloCard
          forecast={forecastView}
          targetValue={goal.direction === 'range' ? (goal.range_max ?? 0) : (goal.target_value ?? 0)}
          direction={goal.direction}
          metricName={goal.metric_name}
          deadline={goal.deadline}
        />
      ) : null}

      {/* Main 2-Column Section: Governance Details & Edit Form */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        {/* Left Column: Goal Configuration Details */}
        <section className="lg:col-span-6">
          <PpCard
            title={t('settingsHeading')}
            subtitle={t('settingsSubtitle')}
            icon={Sliders}
            iconAccent="primary"
          >
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between rounded-xl bg-pp-surface-container-low/60 p-3">
                <span className="text-sm text-pp-outline">{t('metricLabel')}</span>
                <span className="font-semibold text-pp-on-surface">{goal.metric_name}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-pp-surface-container-low/60 p-3">
                <span className="text-sm text-pp-outline">{t('directionLabel')}</span>
                <span className="font-semibold text-pp-on-surface">{t(`directionOption.${goal.direction}`)}</span>
              </div>
              {goal.direction === 'range' ? (
                <>
                  <div className="flex items-center justify-between rounded-xl bg-pp-surface-container-low/60 p-3">
                    <span className="text-sm text-pp-outline">{t('rangeMinLabel')}</span>
                    <span className="font-semibold text-pp-on-surface">{goal.range_min ?? '—'}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-pp-surface-container-low/60 p-3">
                    <span className="text-sm text-pp-outline">{t('rangeMaxLabel')}</span>
                    <span className="font-semibold text-pp-on-surface">{goal.range_max ?? '—'}</span>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-between rounded-xl bg-pp-surface-container-low/60 p-3">
                  <span className="text-sm text-pp-outline">{t('targetValueLabel')}</span>
                  <span className="font-semibold text-pp-on-surface">{goal.target_value ?? '—'}</span>
                </div>
              )}
              <div className="flex items-center justify-between rounded-xl bg-pp-surface-container-low/60 p-3">
                <span className="text-sm text-pp-outline">{t('startDateLabel')}</span>
                <span className="font-mono text-xs text-pp-on-surface">{goal.start_date}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-pp-surface-container-low/60 p-3">
                <span className="text-sm text-pp-outline">{t('deadlineLabel')}</span>
                <span className="font-mono text-xs text-pp-on-surface">{goal.deadline}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-pp-surface-container-low/60 p-3">
                <span className="text-sm text-pp-outline">{t('rhythmLabel')}</span>
                <span className="font-semibold text-pp-on-surface">{t(`rhythmOption.${goal.rhythm}`)}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-pp-surface-container-low/60 p-3">
                <span className="text-sm text-pp-outline">{t('ownerLabel')}</span>
                <span className="font-semibold text-pp-on-surface">{ownerName || '—'}</span>
              </div>
            </div>
          </PpCard>
        </section>

        {/* Right Column: Edit Goal Form */}
        <section className="lg:col-span-6">
          <PpCard
            title={t('editGoal')}
            subtitle={t('editGoalSubtitle')}
            icon={Edit3}
            iconAccent="amber"
          >
            {metricCatalog.length > 0 && peopleRows.length > 0 ? (
              <EditGoalForm
                orgId={orgId}
                projectId={projectId}
                goalId={goalId}
                metricCatalog={metricCatalog}
                people={peopleRows}
                initialName={goal.name}
                initialMetricName={goal.metric_name}
                initialDirection={goal.direction}
                initialTargetValue={goal.target_value}
                initialRangeMin={goal.range_min}
                initialRangeMax={goal.range_max}
                initialStartDate={goal.start_date}
                initialDeadline={goal.deadline}
                initialRhythm={goal.rhythm}
                initialOwnerPersonId={goal.owner_person_id}
              />
            ) : (
              <p className="text-xs text-pp-outline">{t('noMetricsRegistered')}</p>
            )}
          </PpCard>
        </section>
      </div>

      {/* Mobile Sticky Action Bar */}
      <PpMobileActionBar>
        <div className="flex w-full items-center justify-between gap-2">
          <PpButton variant="ghost" size="sm" asChild className="shrink-0">
            <Link href={`/orgs/${orgId}/projects/${projectId}/goals`} className="inline-flex items-center gap-1">
              <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />
              <span>{t('backToGoals')}</span>
            </Link>
          </PpButton>
          <DeleteGoalButton orgId={orgId} projectId={projectId} goalId={goalId} />
        </div>
      </PpMobileActionBar>
    </PpPage>
  );
}
