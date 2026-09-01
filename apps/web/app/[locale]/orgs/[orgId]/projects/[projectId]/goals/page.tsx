import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { Link } from '@/i18n/navigation';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { listGoalsForProject, listMetricsCatalogForProject, listOrgPeople, listOrgProjects } from '@/lib/orgs/queries';
import { toGoalSummaryView } from '@/lib/orgs/goal-view';
import { CreateGoalForm } from '@/components/orgs/create-goal-form';
import { GoalTargetInput } from '@/components/orgs/goal-target-input';

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
 * mirrors) uses. Checked at project scope, not just org scope (KAN-136), so
 * a project-scoped `project_admin`/`editor`/`operator` (KAN-135) can reach
 * their own project's goals, not only an org-scope admin.
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
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'dashboards.write', { orgId, projectId })) {
    notFound();
  }

  const projects = await listOrgProjects(orgId);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    notFound();
  }

  // Only reached once `projectId` is confirmed to belong to this org — same
  // reasoning `boards/page.tsx`'s own comment gives for `listBoardsForProject`.
  const [goals, metricCatalog, people] = await Promise.all([
    listGoalsForProject(orgId, projectId),
    listMetricsCatalogForProject(orgId, projectId),
    listOrgPeople(orgId),
  ]);
  const goalViews = goals.map(toGoalSummaryView);
  // Every registered person's name still resolves for an existing goal's own owner label — an
  // archived person (KAN-129) isn't erased, only hidden from picking a *new* owner below.
  const personNameById = new Map(people.map((person) => [person.id, person.name]));
  const peopleRows = people.filter((person) => !person.archived_at).map((person) => ({ id: person.id, name: person.name }));
  const t = await getTranslations('Goals');

  return (
    <main className="container mx-auto flex max-w-3xl flex-col gap-8 py-16">
      <h1 className="text-3xl font-bold tracking-tight">{t('title', { projectName: project.name })}</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('goalsHeading')}</h2>
        {goalViews.length === 0 ? (
          <p className="text-muted-foreground">{t('noGoals')}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-input text-left text-xs text-muted-foreground">
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
    </main>
  );
}
