import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { Link } from '@/i18n/navigation';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import {
  listActiveAttachmentsForProject,
  listBoardsForProject,
  listOrgProjects,
  listPluginInstallsForProject,
} from '@/lib/orgs/queries';
import { toBoardSummaryView } from '@/lib/orgs/board-view';
import { CreateBoardForm } from '@/components/orgs/create-board-form';
import { GrowthDashboard } from '@/components/orgs/growth-dashboard';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Boards' });
  return { title: t('metaTitle') };
}

/**
 * A project's marketing growth dashboard & custom boards (KAN-60):
 * Primary view renders the predefined Growth Intelligence dashboard answering
 * core marketing questions (ROI, top campaign, top creative, audience segmentation,
 * funnel leak points, actionable insights), plus custom boards management below.
 */
export default async function BoardsPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Fboards`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  const principal = { type: 'user' as const, id: user.id };
  const canViewBoards = can(bindings, principal, 'dashboards.read', { orgId }) || can(bindings, principal, 'dashboards.write', { orgId });
  if (!membership || !canViewBoards) {
    notFound();
  }
  const canManageBoards = can(bindings, principal, 'dashboards.write', { orgId });

  const projects = await listOrgProjects(orgId);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    notFound();
  }

  const [boards, attachments, pluginInstalls] = await Promise.all([
    listBoardsForProject(orgId, projectId),
    listActiveAttachmentsForProject(orgId, projectId),
    listPluginInstallsForProject(orgId, projectId),
  ]);

  const boardViews = boards.map(toBoardSummaryView);
  const t = await getTranslations('Boards');

  const hasGoogleAds = pluginInstalls.some((p) => p.plugin_id.includes('google')) || attachments.some((a) => a.resource_id.includes('google'));
  const hasMetaAds = pluginInstalls.some((p) => p.plugin_id.includes('meta') || p.plugin_id.includes('facebook')) || attachments.some((a) => a.resource_id.includes('meta') || a.resource_id.includes('facebook'));
  const hasWebPixel = pluginInstalls.some((p) => p.plugin_id.includes('easysign') || p.plugin_id.includes('landing-page') || p.plugin_id.includes('pixel') || p.plugin_id.includes('source'));

  const pluginPackNames = pluginInstalls
    .map((p) => {
      if (p.plugin_id.includes('landing-page')) return 'Landing Page Pack';
      if (p.plugin_id.includes('saas')) return 'SaaS Metric Pack';
      if (p.plugin_id.includes('ecommerce')) return 'E-Commerce Pack';
      return p.plugin_id.split('.').pop() ?? p.plugin_id;
    })
    .filter(Boolean);

  return (
    <main className="container mx-auto flex max-w-6xl flex-col gap-10 py-10 px-4 sm:px-6">
      {/* 1. Predefined Growth & Marketing Intelligence Dashboard */}
      <GrowthDashboard
        orgId={orgId}
        projectId={projectId}
        projectName={project.name}
        hasGoogleAds={hasGoogleAds}
        hasMetaAds={hasMetaAds}
        hasWebPixel={hasWebPixel}
        pluginPackNames={pluginPackNames}
      />

      {/* 2. Custom Boards & Tile Management Section */}
      <section className="flex flex-col gap-6 rounded-3xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-bold tracking-tight text-foreground">{t('boardsHeading')}</h2>
          <p className="text-xs text-muted-foreground">{t('customBoardsSubtitle')}</p>
        </div>

        {boardViews.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('noBoards')}</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {boardViews.map((board) => (
              <Link
                key={board.id}
                href={`/orgs/${orgId}/projects/${projectId}/boards/${board.id}`}
                className="flex items-center justify-between rounded-2xl border border-border/80 bg-background p-4 text-xs font-semibold hover:border-primary/50 transition-colors shadow-xs"
              >
                <span className="font-bold text-foreground truncate">{board.name}</span>
                <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {t('tileCountLabel', { count: board.tileCount })}
                </span>
              </Link>
            ))}
          </div>
        )}

        {canManageBoards ? (
          <div className="mt-4 border-t border-border/60 pt-6">
            <h3 className="text-sm font-bold text-foreground mb-3">{t('createHeading')}</h3>
            <CreateBoardForm orgId={orgId} projectId={projectId} />
          </div>
        ) : null}
      </section>
    </main>
  );
}
