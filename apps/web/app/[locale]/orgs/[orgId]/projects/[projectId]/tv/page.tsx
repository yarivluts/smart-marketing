import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ExternalLink, Key, Monitor, ShieldCheck, Tv, Wifi } from 'lucide-react';
import { can } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { listBoardsForProject, listOrgProjects, listTvPairingsForProject } from '@/lib/orgs/queries';
import { toBoardSummaryView } from '@/lib/orgs/board-view';
import { toTvPairingSummaryView } from '@/lib/orgs/tv-pairing-view';
import { Link } from '@/i18n/navigation';
import {
  PpButton,
  PpCard,
  PpEmptyState,
  PpKpiCard,
  PpKpiGrid,
  PpMobileActionBar,
  PpPage,
  PpPageHeader,
  PpPill,
} from '@/components/pastel/primitives';
import { TvPairingList } from '@/components/orgs/tv-pairing-list';
import { ClaimTvPairingForm } from '@/components/orgs/claim-tv-pairing-form';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'TvPairing' });
  return { title: t('metaTitle') };
}

/**
 * Stitch "Pastel Pulse" war-room TV mode admin (desktop 0b2c4d20 / 82c75e3e, mobile 3d83703e).
 *
 * Pair new displays via 6-digit rolling PIN, configure multi-board rotation,
 * and manage active conference / lobby wallboards with zero-auth kiosk security.
 */
export default async function TvPairingPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Ftv`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'dashboards.write', { orgId })) {
    notFound();
  }

  const projects = await listOrgProjects(orgId);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    if (projects.length > 0) {
      redirect(`/${locale}/orgs/${orgId}/projects/${projects[0].id}/tv`);
    }
    redirect(`/${locale}/orgs/${orgId}`);
  }

  const [boards, pairings] = await Promise.all([
    listBoardsForProject(orgId, projectId),
    listTvPairingsForProject(orgId, projectId),
  ]);
  const boardViews = boards.map(toBoardSummaryView);
  const pairingViews = pairings.filter((pairing) => !pairing.revoked_at).map(toTvPairingSummaryView);
  const t = await getTranslations('TvPairing');

  return (
    <PpPage>
      <PpPageHeader
        eyebrow={t('eyebrow')}
        title={t('title', { projectName: project.name })}
        description={t('description')}
        actions={
          <PpButton variant="primary" size="sm" icon={ExternalLink} asChild>
            <Link href="/tv" target="_blank" rel="noopener noreferrer">
              <span>{t('openBillboard')}</span>
            </Link>
          </PpButton>
        }
      />

      {/* KPI Overview Grid - 2x2 on mobile, 4-col on desktop */}
      <PpKpiGrid className="grid-cols-2 lg:grid-cols-4">
        <PpKpiCard
          label={t('kpiPairedDisplays')}
          value={<span dir="ltr">{pairingViews.length}</span>}
          accent={pairingViews.length > 0 ? 'mint' : 'neutral'}
          badge={pairingViews.length > 0 ? t('liveStatus') : undefined}
          badgeAccent="mint"
          footer={t('kpiActiveDisplaysFooter', { count: pairingViews.length })}
        />
        <PpKpiCard
          label={t('kpiPinRotation')}
          value={<span dir="ltr">60s</span>}
          valueSuffix={t('kpiRotationSuffix')}
          accent="primary"
          badge="TLS 1.3"
          badgeAccent="primary"
          footer={t('kpiPinRotationDesc')}
        />
        <PpKpiCard
          label={t('kpiZeroLogin')}
          value={t('kpiZeroLoginVal')}
          accent="sky"
          badge="Kiosk"
          badgeAccent="sky"
          footer={t('kpiZeroLoginDesc')}
        />
        <PpKpiCard
          label={t('kpiChannelStatus')}
          value={t('kpiWsConnected')}
          accent="pink"
          badge="WebSocket"
          badgeAccent="pink"
          footer={t('kpiWsDesc')}
        />
      </PpKpiGrid>

      {/* War-Room Office Billboard Hero Banner */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-pp-primary-fixed/40 via-pp-surface-container-lowest to-pp-surface-container-lowest p-pp-lg shadow-pp-candy border border-pp-primary/20">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
          <div className="max-w-2xl space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-pp-primary-fixed px-3 py-1 font-pp-body text-pp-label-sm font-bold uppercase tracking-wider text-pp-on-primary-fixed">
              <Tv className="h-3.5 w-3.5" aria-hidden />
              <span>{t('heroTitle')}</span>
            </div>
            <h2 className="font-pp-display text-pp-headline-lg tracking-tight text-pp-on-surface">
              {t('openBillboard')}
            </h2>
            <p className="text-pp-body-md text-pp-on-surface-variant">
              {t('heroDescription')}
            </p>

            {/* Quick 3-Step Setup Guide */}
            <div className="mt-4 grid grid-cols-1 gap-2 pt-2 sm:grid-cols-3">
              <div className="flex items-start gap-2 rounded-xl bg-pp-surface-container-low/70 p-2.5 text-xs text-pp-on-surface">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-pp-primary text-[10px] font-bold text-pp-on-primary">
                  1
                </span>
                <span>{t('step1')}</span>
              </div>
              <div className="flex items-start gap-2 rounded-xl bg-pp-surface-container-low/70 p-2.5 text-xs text-pp-on-surface">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-pp-primary text-[10px] font-bold text-pp-on-primary">
                  2
                </span>
                <span>{t('step2')}</span>
              </div>
              <div className="flex items-start gap-2 rounded-xl bg-pp-surface-container-low/70 p-2.5 text-xs text-pp-on-surface">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-pp-primary text-[10px] font-bold text-pp-on-primary">
                  3
                </span>
                <span>{t('step3')}</span>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center">
            <PpButton variant="primary" size="md" icon={ExternalLink} asChild>
              <Link href="/tv" target="_blank" rel="noopener noreferrer">
                <span>{t('openBillboard')}</span>
              </Link>
            </PpButton>
          </div>
        </div>
      </section>

      {/* Main 2-Column Section: Pair New TV & Paired TVs List */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        {/* Left: Claim / Pair New TV */}
        <section className="lg:col-span-6">
          <PpCard
            title={t('pairHeading')}
            subtitle={t('pairSubtitle')}
            icon={Key}
            iconAccent="primary"
          >
            {boardViews.length === 0 ? (
              <PpEmptyState icon={Monitor} title={t('noBoards')} />
            ) : (
              <ClaimTvPairingForm orgId={orgId} projectId={projectId} boards={boardViews} />
            )}
          </PpCard>
        </section>

        {/* Right: Active Paired TVs */}
        <section className="lg:col-span-6">
          <PpCard
            title={t('pairedHeading')}
            subtitle={t('pairedSubtitle')}
            icon={Monitor}
            iconAccent="mint"
            action={
              pairingViews.length > 0 ? (
                <PpPill accent="mint" dot>
                  {pairingViews.length} {t('liveStatus')}
                </PpPill>
              ) : undefined
            }
          >
            {pairingViews.length === 0 ? (
              <PpEmptyState icon={Monitor} title={t('noPaired')} />
            ) : (
              <TvPairingList orgId={orgId} projectId={projectId} pairings={pairingViews} boards={boardViews} />
            )}
          </PpCard>
        </section>
      </div>

      {/* Mobile Sticky Action Bar */}
      <PpMobileActionBar>
        <div className="flex w-full items-center justify-between gap-2">
          <span className="text-xs font-medium text-pp-on-surface-variant">
            {t('tvsPairedCount', { count: pairingViews.length })}
          </span>
          <PpButton variant="primary" size="sm" icon={ExternalLink} asChild>
            <Link href="/tv" target="_blank" rel="noopener noreferrer">
              <span>{t('openBillboard')}</span>
            </Link>
          </PpButton>
        </div>
      </PpMobileActionBar>
    </PpPage>
  );
}
