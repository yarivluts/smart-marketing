import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { getGoal, listOrgPeople, listOrgProjects, queryGoalProgress } from '@/lib/orgs/queries';
import { buildGoalThermometerView } from '@/lib/orgs/goal-view';
import { GoalThermometer } from '@/components/orgs/goal-thermometer';
import { DeleteGoalButton } from '@/components/orgs/delete-goal-button';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string; goalId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Goals' });
  // Deliberately static, not the real goal name — same reasoning
  // `boards/[boardId]/page.tsx`'s own `generateMetadata` comment gives (it
  // runs independently of this page's own session/permission check below).
  return { title: t('metaTitle') };
}

/**
 * One goal (KAN-64, E12.1): its own settings (metric/direction/target-or-
 * range/deadline/owner) plus its computed pace thermometer — fetched
 * server-side via `queryGoalProgress`, the same "server-side query, then
 * render" structure `boards/[boardId]/page.tsx` uses per tile. Gated on
 * `dashboards.write`, same posture as the goals list page.
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

  const [projects, goal, people] = await Promise.all([listOrgProjects(orgId), getGoal(orgId, projectId, goalId), listOrgPeople(orgId)]);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project || !goal) {
    notFound();
  }

  const outcome = await queryGoalProgress(orgId, projectId, goal);
  const thermometerView = buildGoalThermometerView(outcome);
  const ownerName = people.find((person) => person.id === goal.owner_person_id)?.name ?? goal.owner_person_id;

  const t = await getTranslations('Goals');

  return (
    <main className="container mx-auto flex max-w-3xl flex-col gap-8 py-16">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">{goal.name}</h1>
        <DeleteGoalButton orgId={orgId} projectId={projectId} goalId={goalId} />
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('settingsHeading')}</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground">{t('metricLabel')}</dt>
            <dd className="font-medium">{goal.metric_name}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground">{t('directionLabel')}</dt>
            <dd className="font-medium">{t(`directionOption.${goal.direction}`)}</dd>
          </div>
          {goal.direction === 'range' ? (
            <>
              <div className="flex flex-col gap-0.5">
                <dt className="text-muted-foreground">{t('rangeMinLabel')}</dt>
                <dd className="font-medium">{goal.range_min}</dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-muted-foreground">{t('rangeMaxLabel')}</dt>
                <dd className="font-medium">{goal.range_max}</dd>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground">{t('targetValueLabel')}</dt>
              <dd className="font-medium">{goal.target_value}</dd>
            </div>
          )}
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground">{t('startDateLabel')}</dt>
            <dd className="font-medium">{goal.start_date}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground">{t('deadlineLabel')}</dt>
            <dd className="font-medium">{goal.deadline}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground">{t('rhythmLabel')}</dt>
            <dd className="font-medium">{t(`rhythmOption.${goal.rhythm}`)}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground">{t('ownerLabel')}</dt>
            <dd className="font-medium">{ownerName}</dd>
          </div>
        </dl>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('thermometerHeading')}</h2>
        <GoalThermometer view={thermometerView} />
      </section>
    </main>
  );
}
