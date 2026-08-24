import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { listOrgProjects, listGoalsForProject } from '@/lib/orgs/queries';
import { MarketingGoalsDashboard } from '@/components/orgs/goals/marketing-goals-dashboard';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Goals' });
  return { title: t('metaTitle') };
}

/**
 * A project's predefined marketing growth goals:
 * Delivers 100% out-of-the-box marketing targets (Target Blended ROAS, MRR & Revenue Targets,
 * Blended CAC Ceiling, Trial-to-Paid Conversion Target, Cart Abandonment Recovery) with
 * zero manual setup and 1-click strategy presets.
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

  const rawGoals = await listGoalsForProject(orgId, projectId);
  const goals = rawGoals.map((g) => ({
    id: g.id,
    name: g.name,
    metricName: g.metric_name,
    direction: g.direction,
    targetValue: g.target_value,
    startDate: g.start_date,
    deadline: g.deadline,
    rhythm: g.rhythm,
    currentValue: g._demo_current_value ?? null,
    progressPct: g._demo_progress_pct ?? null,
    pacingNote: g._demo_pacing_note ?? null,
    status: g._demo_status ?? 'on_track',
  }));

  return (
    <main className="container mx-auto flex max-w-6xl flex-col gap-10 py-10 px-4 sm:px-6">
      <MarketingGoalsDashboard projectName={project.name} goals={goals} />
    </main>
  );
}
