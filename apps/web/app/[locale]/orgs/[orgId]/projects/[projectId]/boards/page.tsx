import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { Link } from '@/i18n/navigation';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { listBoardsForProject, listOrgProjects } from '@/lib/orgs/queries';
import { boardTileTypeMix, toBoardSummaryView } from '@/lib/orgs/board-view';
import { CreateBoardForm } from '@/components/orgs/create-board-form';
import { BarChart3, BarChartHorizontal, Clock, Filter, Grid3X3, Hash, LayoutDashboard, LayoutGrid, LineChart, Plus, Table2, type LucideIcon } from 'lucide-react';
import { StatCard } from '@/components/ui/stat-card';
import { ChartCard, DonutChart, EmptyState, PageHero } from '@/components/viz';

const TILE_TYPE_ICONS: Record<string, LucideIcon> = {
  line: LineChart,
  bar: BarChart3,
  big_number: Hash,
  table: Table2,
  funnel: Filter,
  heatmap: Grid3X3,
  histogram: BarChartHorizontal,
};

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
 * Checked at project scope, not just org scope (KAN-136), so a
 * project-scoped `project_admin`/`editor`/`operator` (KAN-135) can reach
 * their own project's boards, not only an org-scope admin.
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
  const canViewBoards =
    can(bindings, principal, 'dashboards.read', { orgId, projectId }) ||
    can(bindings, principal, 'dashboards.write', { orgId, projectId });
  if (!membership || !canViewBoards) {
    notFound();
  }
  const canManageBoards = can(bindings, principal, 'dashboards.write', { orgId, projectId });

  const projects = await listOrgProjects(orgId);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    notFound();
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
  const tileTypeLabel = (type: string): string => (t.has(`tileType.${type}`) ? t(`tileType.${type}`) : type);
  const mixes = new Map(boards.map((board) => [board.id, boardTileTypeMix(board)]));
  const overallMix = boardTileTypeMix({ tiles: boards.flatMap((board) => board.tiles) });
  const totalTiles = boardViews.reduce((sum, board) => sum + board.tileCount, 0);
  const lastEdited = boardViews.map((board) => board.updatedAt).filter(Boolean).sort().at(-1);
  const dateFormat = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  const formatDate = (iso: string): string => {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? iso : dateFormat.format(date);
  };

  return (
    <main className="container mx-auto flex max-w-6xl flex-col gap-6 py-10">
      <PageHero icon={LayoutDashboard} eyebrow={t('galleryEyebrow')} title={t('title', { projectName: project.name })} description={t('galleryDescription')}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard title={t('kpiBoards')} value={boardViews.length} icon={LayoutGrid} />
          <StatCard title={t('kpiTiles')} value={totalTiles} icon={BarChart3} />
          <StatCard title={t('kpiTopType')} value={overallMix[0] ? tileTypeLabel(overallMix[0].type) : t('kpiNone')} icon={overallMix[0] ? (TILE_TYPE_ICONS[overallMix[0].type] ?? LineChart) : LineChart} />
          <StatCard title={t('kpiLastUpdated')} value={lastEdited ? formatDate(lastEdited) : t('kpiNone')} icon={Clock} />
        </div>
      </PageHero>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="flex flex-col gap-3 lg:col-span-2" aria-labelledby="boards-heading">
          <h2 id="boards-heading" className="text-lg font-semibold">
            {t('boardsHeading')}
          </h2>
          {boardViews.length === 0 ? (
            <EmptyState icon={LayoutDashboard} title={t('noBoards')} description={t('createDescription')} />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {boardViews.map((board) => {
                const mix = mixes.get(board.id) ?? [];
                return (
                  <li key={board.id}>
                    <Link
                      href={`/orgs/${orgId}/projects/${projectId}/boards/${board.id}`}
                      className="group flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="flex items-center gap-2">
                          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                            <LayoutDashboard className="h-4 w-4" />
                          </span>
                          <span className="font-semibold text-foreground group-hover:text-primary">{board.name}</span>
                        </span>
                        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{t('tileCountLabel', { count: board.tileCount })}</span>
                      </div>
                      {mix.length > 0 ? (
                        <>
                          <div className="flex h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                            {mix.map((entry, index) => (
                              <span
                                key={entry.type}
                                style={{ width: `${(entry.count / board.tileCount) * 100}%`, backgroundColor: `hsl(var(--primary) / ${1 - index * 0.2})` }}
                              />
                            ))}
                          </div>
                          <ul className="flex flex-wrap gap-1.5">
                            {mix.map((entry) => {
                              const Icon = TILE_TYPE_ICONS[entry.type] ?? LineChart;
                              return (
                                <li key={entry.type} className="flex items-center gap-1 rounded-lg border border-border px-2 py-0.5 text-xs text-muted-foreground">
                                  <Icon className="h-3 w-3" />
                                  {tileTypeLabel(entry.type)} · {entry.count}
                                </li>
                              );
                            })}
                          </ul>
                        </>
                      ) : (
                        <p className="text-xs text-muted-foreground">{t('boardEmptyMix')}</p>
                      )}
                      {board.updatedAt ? <p className="mt-auto text-xs text-muted-foreground">{t('boardUpdated', { date: formatDate(board.updatedAt) })}</p> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="flex flex-col gap-6">
          {overallMix.length > 0 ? (
            <ChartCard title={t('mixTitle')} description={t('mixDescription')} icon={BarChart3}>
              <DonutChart
                label={t('mixTitle')}
                layout="stacked"
                size={160}
                centerValue={String(totalTiles)}
                centerLabel={t('mixCenter')}
                data={overallMix.map((entry) => ({ label: tileTypeLabel(entry.type), value: entry.count }))}
              />
            </ChartCard>
          ) : null}
          {canManageBoards ? (
            <ChartCard title={t('createHeading')} description={t('createDescription')} icon={Plus}>
              <CreateBoardForm orgId={orgId} projectId={projectId} />
            </ChartCard>
          ) : null}
        </div>
      </div>
    </main>
  );
}
