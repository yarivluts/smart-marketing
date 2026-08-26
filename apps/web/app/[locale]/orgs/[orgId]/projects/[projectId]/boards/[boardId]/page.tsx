import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { getBoard, listMetricsCatalogForProject, listOrgProjects, queryBoardTiles } from '@/lib/orgs/queries';
import { buildTileRenderView, toBoardView, type TileRenderView } from '@/lib/orgs/board-view';
import { resolveBoardFreshness } from '@/lib/orgs/board-freshness';
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
 * data (fetched here, server-side, via one batched `queryBoardTiles` call —
 * see its own doc comment for why this isn't a per-tile `Promise.all` fan-out
 * any more), edit mode hands off to `BoardGridEditor`'s client-side
 * add/move/resize/remove + "Save layout". Gated on `dashboards.read` to view
 * (`viewer` included — see the boards list page's own doc comment for why);
 * the settings form, delete button, and grid editor's edit affordances are
 * separately gated on `dashboards.write` below.
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
  const principal = { type: 'user' as const, id: user.id };
  const canViewBoard = can(bindings, principal, 'dashboards.read', { orgId }) || can(bindings, principal, 'dashboards.write', { orgId });
  if (!membership || !canViewBoard) {
    notFound();
  }
  const canManageBoards = can(bindings, principal, 'dashboards.write', { orgId });

  // `freshness` (KAN-69): one project-wide badge shared by every tile on
  // this board — see `resolveBoardFreshness`'s own doc comment for why a
  // tile doesn't get its own per-metric freshness.
  const [projects, board, metricCatalog, freshness] = await Promise.all([
    listOrgProjects(orgId),
    getBoard(orgId, projectId, boardId),
    listMetricsCatalogForProject(orgId, projectId),
    resolveBoardFreshness(orgId, projectId),
  ]);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project || !board) {
    notFound();
  }

  const boardView = toBoardView(board);

  const tileOutcomes = await queryBoardTiles(orgId, projectId, board);
  const renderViews: Record<string, TileRenderView> = {};
  board.tiles.forEach((tile, index) => {
    renderViews[tile.id] = buildTileRenderView(tile, tileOutcomes[index], freshness);
  });

  const t = await getTranslations('Boards');

  return (
    <main className="container mx-auto flex max-w-5xl flex-col gap-8 py-16">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">{board.name}</h1>
        {canManageBoards ? <DeleteBoardButton orgId={orgId} projectId={projectId} boardId={boardId} /> : null}
      </div>

      {canManageBoards ? (
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
      ) : null}

      <section>
        <BoardGridEditor
          orgId={orgId}
          projectId={projectId}
          boardId={boardId}
          initialTiles={board.tiles}
          metricCatalog={metricCatalog}
          renderViews={renderViews}
          sessionReplayUrlTemplate={project.session_replay_url_template}
          readOnly={!canManageBoards}
        />
      </section>
    </main>
  );
}
