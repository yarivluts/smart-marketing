import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { Link } from '@/i18n/navigation';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { listBoardsForProject, listOrgProjects } from '@/lib/orgs/queries';
import { toBoardSummaryView } from '@/lib/orgs/board-view';
import { CreateBoardForm } from '@/components/orgs/create-board-form';
import { MissingIntegrationAlert } from '@/components/integrations/missing-integration-alert';
import { PpPage, PpPageHeader, PpCard, PpEmptyState, PpPill, PpIconChip } from '@/components/pastel/primitives';
import { LayoutDashboard, Plus, ArrowRight } from 'lucide-react';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Boards' });
  return { title: t('metaTitle') };
}

/**
 * A project's dashboard boards (KAN-60, plan `13 §E11.2`, `10 §2.2`): every
 * board created in this project, plus (for `dashboards.write` holders only) a
 * form to create a new (empty) one — tiles are added from the board's own
 * grid editor. Gated on `dashboards.read` for the page itself (`viewer`
 * included — KAN-60 follow-up, session-B dogfooding QA 2026-08-18: a viewer
 * couldn't see board data at all, only write-capable roles could reach this
 * page); the create form is separately gated on `dashboards.write` below.
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
    if (projects.length > 0) {
      redirect(`/${locale}/orgs/${orgId}/projects/${projects[0].id}/boards`);
    }
    redirect(`/${locale}/orgs/${orgId}`);
  }

  // Only reached once `projectId` is confirmed to belong to this org —
  // `listBoardsForProject` itself throws `ProjectNotFoundError` for a
  // project id that doesn't (unlike most list queries in this codebase,
  // which just return an empty result for one), and this page has no error
  // boundary to turn that into the 404 `notFound()` above already gives a
  // bad project id via the same non-enumeration posture KAN-26 established.
  const boards = await listBoardsForProject(orgId, projectId);
  const boardViews = boards.map(toBoardSummaryView);
  const t = await getTranslations('Boards');

  return (
    <PpPage>
      <PpPageHeader
        eyebrow="TELEMETRY"
        meta={project.name}
        title={t('title', { projectName: project.name })}
      />

      <MissingIntegrationAlert
        orgId={orgId}
        projectId={projectId}
        metricKey="MRR"
        connectorId="stripe"
        customTitle="Billing & Webhook Ingestion"
        customMissingPoints={[
          'Stripe customer.subscription.* lifecycle webhooks',
          'Live charge and refund event streams',
        ]}
        customImpactMetrics={['MRR Waterfall', 'Gross & Net Churn', 'Executive KPI Cards']}
      />

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-pp-display text-pp-headline-md text-pp-on-surface">{t('boardsHeading')}</h2>
          {boardViews.length > 0 ? (
            <span className="text-pp-label-sm text-pp-outline">
              {boardViews.length} {boardViews.length === 1 ? 'board' : 'boards'}
            </span>
          ) : null}
        </div>

        {boardViews.length === 0 ? (
          <PpEmptyState
            icon={LayoutDashboard}
            title={t('noBoards')}
            description={t('createSubtitle')}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-pp-md">
            {boardViews.map((board) => (
              <Link
                key={board.id}
                href={`/orgs/${orgId}/projects/${projectId}/boards/${board.id}`}
                className="group relative flex flex-col justify-between rounded-2xl bg-pp-surface-container-lowest p-pp-lg shadow-pp-candy transition-all duration-200 hover:-translate-y-0.5 hover:shadow-pp-candy-hover"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <PpIconChip icon={LayoutDashboard} accent="primary" />
                    <PpPill accent="mint">{t('tileCountLabel', { count: board.tileCount })}</PpPill>
                  </div>
                  <h3 className="mt-4 font-pp-display text-pp-headline-md text-pp-on-surface group-hover:text-pp-primary transition-colors">
                    {board.name}
                  </h3>
                </div>
                <div className="mt-6 flex items-center gap-1.5 text-pp-label-sm text-pp-primary font-semibold">
                  <span>{t('viewBoardLink')}</span>
                  <ArrowRight className="h-4 w-4 rtl:rotate-180 transition-transform group-hover:translate-x-1 rtl:group-hover:-translate-x-1" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {canManageBoards ? (
        <PpCard
          icon={Plus}
          iconAccent="primary"
          title={t('createHeading')}
          subtitle={t('createSubtitle')}
        >
          <CreateBoardForm orgId={orgId} projectId={projectId} />
        </PpCard>
      ) : null}
    </PpPage>
  );
}
