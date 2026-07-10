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
 * this project, deadline-sorted, plus a form to create a new one. Gated on
 * `dashboards.write` for the whole page — the same "whole feature, not just
 * mutation, is admin-only" posture every other project admin surface in
 * this codebase (including `boards/page.tsx`, which this page mirrors) uses.
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
  const peopleRows = people.map((person) => ({ id: person.id, name: person.name }));
  const t = await getTranslations('Goals');

  return (
    <main className="container mx-auto flex max-w-3xl flex-col gap-8 py-16">
      <h1 className="text-3xl font-bold tracking-tight">{t('title', { projectName: project.name })}</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('goalsHeading')}</h2>
        {goalViews.length === 0 ? (
          <p className="text-muted-foreground">{t('noGoals')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {goalViews.map((goal) => (
              <li key={goal.id} className="flex items-center justify-between rounded-md border border-input px-3 py-2 text-sm">
                <Link className="font-medium underline" href={`/orgs/${orgId}/projects/${projectId}/goals/${goal.id}`}>
                  {goal.name}
                </Link>
                <span className="text-xs text-muted-foreground">{t('deadlineListLabel', { deadline: goal.deadline })}</span>
              </li>
            ))}
          </ul>
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
