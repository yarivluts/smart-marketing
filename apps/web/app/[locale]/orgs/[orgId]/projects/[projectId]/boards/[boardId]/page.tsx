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
import { PpPage, PpPageHeader, PpCard, PpPill } from '@/components/pastel/primitives';
import { SlidersHorizontal } from 'lucide-react';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string; boardId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Boards' });
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
  if (!project) {
    if (projects.length > 0) {
      redirect(`/${locale}/orgs/${orgId}/projects/${projects[0].id}/boards`);
    }
    redirect(`/${locale}/orgs/${orgId}`);
  }
  if (!board) {
    redirect(`/${locale}/orgs/${orgId}/projects/${projectId}/boards`);
  }

  const boardView = toBoardView(board);

  const tileOutcomes = await queryBoardTiles(orgId, projectId, board);
  const renderViews: Record<string, TileRenderView> = {};
  board.tiles.forEach((tile, index) => {
    renderViews[tile.id] = buildTileRenderView(tile, tileOutcomes[index], freshness);
  });

  const t = await getTranslations('Boards');

  return (
    <PpPage>
      <PpPageHeader
        eyebrow="BOARD"
        meta={
          freshness ? (
            <PpPill accent={freshness.isStale ? 'amber' : 'mint'} dot>
              {t(freshness.isStale ? 'freshnessStaleLabel' : 'freshnessAsOfLabel', { asOf: freshness.asOf })}
            </PpPill>
          ) : undefined
        }
        title={board.name}
        actions={
          canManageBoards ? (
            <DeleteBoardButton orgId={orgId} projectId={projectId} boardId={boardId} />
          ) : null
        }
      />

      {canManageBoards ? (
        <PpCard
          icon={SlidersHorizontal}
          iconAccent="primary"
          title={t('settingsHeading')}
        >
          <BoardSettingsForm
            orgId={orgId}
            projectId={projectId}
            boardId={boardId}
            initialName={boardView.name}
            initialDateRange={boardView.dateRange}
            initialCompare={boardView.compare}
            initialGlobalFilters={boardView.globalFilters}
          />
        </PpCard>
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
    </PpPage>
  );
}
