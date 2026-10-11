import { Link2, MonitorPlay, PlayCircle, SlidersHorizontal } from 'lucide-react';
import { StatCard } from '@/components/ui/stat-card';
import { ChartCard, FlowDiagram, PageHero } from '@/components/viz';
import { summarizeSessionReplayTemplate } from '@/lib/orgs/session-replay-view';
import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { listOrgProjects } from '@/lib/orgs/queries';
import { SessionReplaySettingsForm } from '@/components/orgs/session-replay-settings-form';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'SessionReplaySettings' });
  return { title: t('metaTitle') };
}

/**
 * Where an admin points this project at its session-replay/heatmap tool, so
 * landing-page rows on a board deep-link into that page's recordings.
 *
 * Deliberately a link-out rather than replay this platform records itself:
 * capturing DOM mutations is a whole separate product (storage, a player,
 * sampling) with real privacy obligations, and the incumbents — Microsoft
 * Clarity free among them — already do it well. The value here is the join
 * this platform uniquely has: from "this page converts worse and costs
 * more" straight to the sessions behind it.
 *
 * Gated on `project.manage`, the same per-project admin-config permission
 * the cost-guardrails page uses.
 */
export default async function SessionReplaySettingsPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Fsession-replay`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'project.manage', { orgId, projectId })) {
    notFound();
  }

  const projects = await listOrgProjects(orgId);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    notFound();
  }

  const t = await getTranslations('SessionReplaySettings');
  const summary = summarizeSessionReplayTemplate(project.session_replay_url_template);
  const toolLabel = summary.tool ? t(`toolName.${summary.tool}`) : t('notConfigured');

  return (
    <div className="container mx-auto flex max-w-6xl flex-col gap-6 py-10">
      <PageHero icon={PlayCircle} eyebrow={t('eyebrow')} title={t('title', { projectName: project.name })} description={t('intro')}>
        <div className="grid gap-3 sm:grid-cols-2">
          <StatCard title={t('kpiTool')} value={toolLabel} icon={MonitorPlay} />
          <StatCard title={t('kpiFiltering')} value={summary.tool ? (summary.filtersByPage ? t('filteringOn') : t('filteringOff')) : t('notConfigured')} icon={SlidersHorizontal} />
        </div>
      </PageHero>

      <div className="grid gap-6 lg:grid-cols-5">
        <ChartCard title={t('flowTitle')} description={t('flowDescription')} icon={Link2} className="lg:col-span-3">
          <FlowDiagram
            label={t('flowTitle')}
            height={220}
            nodes={[
              { id: 'row', label: t('flowBoardRow'), sublabel: t('flowBoardRowSub'), status: 'ok', href: `/orgs/${orgId}/projects/${projectId}/boards` },
              { id: 'template', label: t('flowTemplate'), sublabel: t('flowTemplateSub'), status: summary.tool ? (summary.filtersByPage ? 'ok' : 'warn') : 'idle' },
              {
                id: 'tool',
                label: toolLabel,
                sublabel: summary.tool ? (summary.filtersByPage ? t('flowToolFiltered') : t('flowToolUnfiltered')) : undefined,
                status: summary.tool ? (summary.filtersByPage ? 'ok' : 'warn') : 'idle',
              },
            ]}
            edges={[
              { source: 'row', target: 'template', animated: Boolean(summary.tool), status: summary.tool ? 'ok' : 'idle' },
              { source: 'template', target: 'tool', animated: Boolean(summary.tool), status: summary.tool ? (summary.filtersByPage ? 'ok' : 'warn') : 'idle' },
            ]}
          />
        </ChartCard>
        <ChartCard title={t('formTitle')} icon={SlidersHorizontal} className="lg:col-span-2">
          <SessionReplaySettingsForm orgId={orgId} projectId={projectId} initialTemplate={project.session_replay_url_template ?? ''} />
        </ChartCard>
      </div>
    </div>
  );
}
