import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { getBoard, listMetricsCatalogForProject, listOrgProjects, queryBoardTile } from '@/lib/orgs/queries';
import { buildTileRenderView, toBoardView, type TileRenderView } from '@/lib/orgs/board-view';
import { BoardSettingsForm } from '@/components/orgs/board-settings-form';
import { BoardGridEditor } from '@/components/orgs/board-grid-editor';
import { DeleteBoardButton } from '@/components/orgs/delete-board-button';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string; boardId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Boards' });
  // Deliberately static, not the real board name: generateMetadata runs
  // independently of the page component's own session/permission check
  // below, so fetching a caller-supplied board's name here (as an earlier
  // version of this file did) would leak it into the page <title> for a
  // caller who isn't even a member of the org that owns it — the same
  // static-title posture every other per-resource admin page in this
  // codebase (cost-guardrails, metric-defs, schema-defs, ...) already uses.
  return { title: t('metaTitle') };
}

/**
 * One board (KAN-60): its settings (name/date range/compare/global
 * filters), and its tile grid — view mode shows every tile's already-queried
 * data (fetched here, server-side, one `queryBoardTile` call per tile, in
 * parallel), edit mode hands off to `BoardGridEditor`'s client-side
 * add/move/resize/remove + "Save layout". Gated on `dashboards.write`, same
 * posture as the boards list page.
 */
export default async function BoardDetailPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId, boardId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Fboards%2F${boardId}`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'dashboards.write', { orgId })) {
    notFound();
  }

  const [projects, board, metricCatalog] = await Promise.all([
    listOrgProjects(orgId),
    getBoard(orgId, projectId, boardId),
    listMetricsCatalogForProject(orgId, projectId),
  ]);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project || !board) {
    notFound();
  }

  const boardView = toBoardView(board);

  const tileOutcomes = await Promise.all(board.tiles.map((tile) => queryBoardTile(orgId, projectId, board, tile)));
  const renderViews: Record<string, TileRenderView> = {};
  board.tiles.forEach((tile, index) => {
    renderViews[tile.id] = buildTileRenderView(tile, tileOutcomes[index]);
  });

  const t = await getTranslations('Boards');

  return (
    <main className="container mx-auto flex max-w-5xl flex-col gap-8 py-16">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">{board.name}</h1>
        <DeleteBoardButton orgId={orgId} projectId={projectId} boardId={boardId} />
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('settingsHeading')}</h2>
        <BoardSettingsForm
          orgId={orgId}
          projectId={projectId}
          boardId={boardId}
          initialName={boardView.name}
          initialDateRange={boardView.dateRange}
          initialCompare={boardView.compare}
          initialGlobalFilters={boardView.globalFilters}
        />
      </section>

      <section>
        <BoardGridEditor
          orgId={orgId}
          projectId={projectId}
          boardId={boardId}
          initialTiles={board.tiles}
          metricCatalog={metricCatalog}
          renderViews={renderViews}
        />
      </section>
    </main>
  );
}
