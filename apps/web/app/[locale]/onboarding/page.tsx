import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import type { OnboardingStep } from '@growthos/firebase-orm-models';
import { ArrowRight, Building2, CheckCircle2, FolderKanban, ListChecks, Plus, Route } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/ui/stat-card';
import { ChartCard } from '@/components/viz/chart-card';
import { EmptyState } from '@/components/viz/empty-state';
import { FlowDiagram, type FlowEdgeSpec, type FlowNodeSpec } from '@/components/viz/flow-diagram';
import { InitialsAvatar } from '@/components/viz/initials-avatar';
import { PageHero } from '@/components/viz/page-hero';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { isActiveMembershipStatus } from '@/lib/orgs/membership-status';
import { getOnboardingState, listOrgProjects } from '@/lib/orgs/queries';
import { buildOnboardingJourney, wrapIntoRows } from '@/lib/orgs/onboarding-journey';
import { ONBOARDING_JOURNEY, onboardingProgress, pickFocusProject } from '@/lib/orgs/workspace-view';

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Onboarding' });
  return { title: t('metaTitle') };
}

/** Bounds the onboarding-state reads: at most this many projects are listed. */
const PROJECT_CAP = 24;

/**
 * The account-wide setup journey: from having an organization, to a project, through each project's
 * own setup wizard (pack, source, funnel, starter board). Every status is read from the user's real
 * memberships, projects and stored wizard state; the diagram follows the project that is furthest
 * along without being finished, and every step links to where it is done.
 */
export default async function GlobalOnboardingPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Fonboarding`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const principal = { type: 'user' as const, id: user.id };
  const active = memberships.filter((membership) => isActiveMembershipStatus(membership.status));
  const projectLists = await Promise.all(active.map((membership) => listOrgProjects(membership.organizationId)));

  // Only projects this user can run the wizard for (`project.manage`, the wizard's own gate).
  const manageable = active
    .flatMap((membership, index) =>
      (projectLists[index] ?? []).map((project) => ({ orgId: membership.organizationId, orgName: membership.organizationName, projectId: project.id, name: project.name })),
    )
    .filter((project) => can(bindings, principal, 'project.manage', { orgId: project.orgId, projectId: project.projectId }))
    .slice(0, PROJECT_CAP);
  const states = await Promise.all(manageable.map((project) => getOnboardingState(project.orgId, project.projectId)));
  const projects = manageable.map((project, index) => ({ ...project, step: (states[index]?.step ?? null) as OnboardingStep | null }));
  const totalProjects = projectLists.reduce((sum, list) => sum + list.length, 0);
  const finished = projects.filter((project) => project.step === 'done').length;
  const focus = pickFocusProject(projects);

  const t = await getTranslations('Onboarding');
  const numberFormat = new Intl.NumberFormat(locale);

  // Account -> organization -> project, then the focus project's own wizard steps.
  const firstOrgId = active[0]?.organizationId;
  const hasOrg = active.length > 0;
  const hasProject = totalProjects > 0;
  const focusBase = focus ? `/orgs/${focus.orgId}/projects/${focus.projectId}` : null;
  const wizard = buildOnboardingJourney(
    { step: focus?.step ?? null },
    { label: (step) => t(`journeyStep_${step}`) },
    focusBase
      ? Object.fromEntries(ONBOARDING_JOURNEY.map((step) => [step, step === 'done' ? `${focusBase}/campaigns` : `${focusBase}/onboarding`]))
      : {},
    'wizard-',
  );
  const wizardNodes = wizard.nodes.filter((node) => node.id !== 'wizard-start');
  const wizardEdges = wizard.edges.filter((edge) => edge.source !== 'wizard-start');
  const nodes: FlowNodeSpec[] = [
    { id: 'org', label: t('globalStepOrg'), sublabel: hasOrg ? t('globalOrgCount', { count: active.length }) : t('globalStepTodo'), status: hasOrg ? 'ok' : 'warn', href: hasOrg ? `/orgs/${firstOrgId}` : '/orgs/new' },
    {
      id: 'project',
      label: t('globalStepProject'),
      sublabel: hasProject ? t('globalProjectCount', { count: totalProjects }) : t('globalStepTodo'),
      status: hasProject ? 'ok' : hasOrg ? 'warn' : 'idle',
      href: hasOrg ? (hasProject ? `/orgs/${firstOrgId}` : `/orgs/${firstOrgId}/projects/new`) : undefined,
    },
    ...(hasProject && focus ? wizardNodes : wizardNodes.map((node) => ({ ...node, status: 'idle' as const, href: undefined }))),
  ];
  const edges: FlowEdgeSpec[] = [
    { source: 'org', target: 'project', status: hasProject ? 'ok' : hasOrg ? 'warn' : 'idle', animated: hasOrg && !hasProject },
    { source: 'project', target: 'wizard-pack', status: focus && focus.step !== null ? 'ok' : hasProject ? 'warn' : 'idle', animated: hasProject && (!focus || focus.step === null) },
    ...wizardEdges,
  ];

  return (
    <main className="container mx-auto flex max-w-6xl flex-col gap-6 py-10">
      <PageHero icon={Route} eyebrow={t('eyebrow')} title={t('globalTitle')} description={t('globalDescription')}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard title={t('globalKpiOrgs')} value={numberFormat.format(active.length)} icon={Building2} />
          <StatCard title={t('globalKpiProjects')} value={numberFormat.format(totalProjects)} icon={FolderKanban} />
          <StatCard
            title={t('globalKpiFinished')}
            value={projects.length > 0 ? `${finished}/${projects.length}` : '-'}
            icon={CheckCircle2}
            progress={projects.length > 0 ? Math.round((finished / projects.length) * 100) : undefined}
          />
          <StatCard title={t('globalKpiInProgress')} value={numberFormat.format(projects.filter((project) => project.step !== 'done').length)} icon={ListChecks} />
        </div>
      </PageHero>

      <ChartCard
        title={t('journeyTitle')}
        description={
          focus
            ? t(focus.step === 'done' ? 'globalJourneyAllDone' : 'globalJourneyFocus', { project: focus.name, org: focus.orgName })
            : t('globalJourneyDescription')
        }
        icon={Route}
      >
        <FlowDiagram label={t('journeyTitle')} nodes={wrapIntoRows(nodes, 4)} edges={edges} height={300} />
      </ChartCard>

      {!hasOrg ? (
        <EmptyState
          icon={Building2}
          title={t('globalNoOrgTitle')}
          description={t('globalNoOrgDescription')}
          action={
            <Button asChild>
              <Link href="/orgs/new">
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t('globalNoOrgAction')}
              </Link>
            </Button>
          }
        />
      ) : projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title={hasProject ? t('globalNoManageableTitle') : t('globalNoProjectTitle')}
          description={hasProject ? t('globalNoManageableDescription') : t('globalNoProjectDescription')}
          action={
            hasProject ? undefined : (
              <Button asChild>
                <Link href={`/orgs/${firstOrgId}/projects/new`}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  {t('globalNoProjectAction')}
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <ChartCard title={t('globalProjectsTitle')} description={t('globalProjectsDescription')} icon={ListChecks}>
          <ul className="grid gap-3 md:grid-cols-2">
            {projects.map((project) => {
              const progress = onboardingProgress(project.step);
              return (
                <li key={project.projectId} className="flex flex-col gap-3 rounded-xl border border-border bg-background/60 p-4">
                  <div className="flex items-center gap-3">
                    <InitialsAvatar name={project.name} seed={project.projectId} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-foreground">{project.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{project.orgName}</p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground" dir="ltr">
                      {progress.percent}%
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className={project.step === 'done' ? 'h-full rounded-full bg-success' : 'h-full rounded-full bg-warning'} style={{ width: `${progress.percent}%` }} />
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      {project.step === null ? t('journeyNotStarted') : project.step === 'done' ? t('kpiProgressDone') : t('globalCurrentStep', { step: t(`journeyStep_${project.step}`) })}
                    </span>
                    <Link href={`/orgs/${project.orgId}/projects/${project.projectId}/onboarding`} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                      {project.step === 'done' ? t('globalReview') : t('globalContinue')}
                      <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden="true" />
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </ChartCard>
      )}
    </main>
  );
}
