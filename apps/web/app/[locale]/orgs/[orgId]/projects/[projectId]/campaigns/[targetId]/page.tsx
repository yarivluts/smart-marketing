import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ArrowLeft, BarChart3, History, Sparkles } from 'lucide-react';
import { can } from '@growthos/shared';
import { Link } from '@/i18n/navigation';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import {
  listActiveAttachmentsForProject,
  listAutomationActionsForTarget,
  listAutomationTargetStatesForProject,
  listOrgProjects,
  listSharedCredentials,
  queryCampaignSpend,
} from '@/lib/orgs/queries';
import {
  findCampaignDraftForTarget,
  toAutomationActionView,
  toAutomationConnectionOptions,
  toAutomationTargetView,
} from '@/lib/orgs/automation-view';
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
import { CampaignCreativesPanel, type CampaignDraftView, type ImportedAdView } from '@/components/orgs/campaign-creatives-panel';
import { CampaignSpendPanel } from '@/components/orgs/campaign-spend-panel';
import { AutomationActivateCampaignButton } from '@/components/orgs/automation-activate-campaign-button';
import { PauseCampaignButton } from '@/components/orgs/pause-campaign-button';
import { RefreshCampaignStateButton } from '@/components/orgs/refresh-campaign-state-button';
import { AutomationActionList } from '@/components/orgs/automation-action-list';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string; targetId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Campaigns' });
  return { title: t('metaTitle') };
}

/**
 * Stitch "Pastel Pulse" campaign detail view (desktop ff4456f8, mobile b6203d37).
 *
 * Shows the target campaign's live telemetry, daily budget pacing, ad spend
 * breakdown, creatives gallery, and audited automation execution ledger.
 */
export default async function CampaignDetailPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId, targetId: rawTargetId } = await params;
  const targetId = decodeURIComponent(rawTargetId);
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Fcampaigns`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  const principal = { type: 'user' as const, id: user.id };
  if (!membership || !can(bindings, principal, 'automation.execute', { orgId })) {
    notFound();
  }
  const canApprove = can(bindings, principal, 'automation.approve', { orgId });

  const [projects, targets, targetActions, attachments, credentials] = await Promise.all([
    listOrgProjects(orgId),
    listAutomationTargetStatesForProject(orgId, projectId),
    listAutomationActionsForTarget(orgId, projectId, targetId),
    listActiveAttachmentsForProject(orgId, projectId),
    listSharedCredentials(orgId),
  ]);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    if (projects.length > 0) {
      redirect(`/${locale}/orgs/${orgId}/projects/${projects[0].id}/campaigns`);
    }
    redirect(`/${locale}/orgs/${orgId}`);
  }
  const targetModel = targets.find((candidate) => candidate.id === targetId);
  if (!targetModel) {
    redirect(`/${locale}/orgs/${orgId}/projects/${projectId}/campaigns`);
  }

  const target = toAutomationTargetView(targetModel);
  const connections = toAutomationConnectionOptions(attachments, credentials);
  const connection = target.resourceAttachmentId
    ? connections.find((candidate) => candidate.id === target.resourceAttachmentId)
    : undefined;
  const draft = findCampaignDraftForTarget(targetActions, targetId) as CampaignDraftView | undefined;
  const actionViews = targetActions.map(toAutomationActionView);
  const executedActivation = targetActions.find(
    (action) => action.action_type === 'campaign_activation' && action.status === 'executed',
  );

  const spendOutcome = await queryCampaignSpend(orgId, projectId, target.campaignResourceName ?? target.id);
  const spendView = spendOutcome.ok
    ? {
        ok: true as const,
        totalSpendUsd: spendOutcome.totalSpendUsd,
        days: spendOutcome.series.map((row) => ({
          date: String(row.bucket_date ?? ''),
          spendUsd: typeof row.ad_spend === 'number' ? row.ad_spend : Number(row.ad_spend ?? 0),
        })),
      }
    : spendOutcome;

  const t = await getTranslations('Campaigns');

  const statusAccent =
    target.campaignStatus === 'enabled'
      ? 'mint'
      : target.campaignStatus === 'paused'
        ? 'amber'
        : 'neutral';

  const platformDisplay = target.externalPlatform
    ? t(`platform.${target.externalPlatform}`)
    : connection?.provider
      ? t(`platform.${connection.provider}`)
      : t('platform.simulated');

  const actionControls = (
    <>
      <PpButton variant="secondary" size="sm" asChild>
        <Link href={`/orgs/${orgId}/projects/${projectId}/campaigns`} className="inline-flex items-center gap-1.5">
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />
          <span>{t('backToCampaigns')}</span>
        </Link>
      </PpButton>
      {target.campaignResourceName && target.campaignStatus === 'paused' ? (
        <AutomationActivateCampaignButton orgId={orgId} projectId={projectId} targetId={target.id} />
      ) : null}
      {target.campaignStatus === 'enabled' && executedActivation ? (
        <PauseCampaignButton orgId={orgId} projectId={projectId} activationActionId={executedActivation.id} />
      ) : null}
      <RefreshCampaignStateButton orgId={orgId} projectId={projectId} targetId={target.id} />
    </>
  );

  return (
    <PpPage>
      <PpPageHeader
        eyebrow={t('targetBreadcrumb', { id: target.id.slice(0, 8) })}
        meta={target.updatedAt ? t('lastKnownStateAt', { at: target.updatedAt }) : undefined}
        title={
          <div className="flex flex-wrap items-center gap-3">
            <span>{target.label}</span>
            {target.campaignStatus ? (
              <PpPill accent={statusAccent} dot>
                {t(`status.${target.campaignStatus}`)}
              </PpPill>
            ) : null}
          </div>
        }
        description={
          target.campaignResourceName ? (
            <span className="font-mono text-xs text-pp-outline" dir="ltr">
              {target.campaignResourceName}
            </span>
          ) : undefined
        }
        actions={actionControls}
      />

      {/* KPI Overview Grid */}
      <PpKpiGrid>
        <PpKpiCard
          label={t('statusLabel')}
          value={target.campaignStatus ? t(`status.${target.campaignStatus}`) : t('status.none')}
          accent={statusAccent}
          badge={platformDisplay}
          badgeAccent="primary"
          footer={target.importedObjective ? `${t('objectiveLabel')}: ${target.importedObjective}` : undefined}
        />
        <PpKpiCard
          label={t('budgetLabel')}
          value={target.dailyBudgetUsd ? `$${target.dailyBudgetUsd.toLocaleString(locale)}` : '—'}
          valueSuffix={target.dailyBudgetUsd ? t('perDaySuffix') : undefined}
          accent="amber"
          badge={t('budgetLabel')}
          badgeAccent="amber"
          footer={t('budgetPacingNote')}
        />
        <PpKpiCard
          label={t('spendTotalLabel')}
          value={
            spendView.ok
              ? `$${spendView.totalSpendUsd.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : '—'
          }
          accent="primary"
          badge={spendView.ok && spendView.days.length > 0 ? `${spendView.days.length}d` : undefined}
          badgeAccent="primary"
          footer={spendView.ok ? t('spendChartLabel') : t(`spendDegraded.${spendView.reason}` as const)}
        />
        <PpKpiCard
          label={t('connectionLabel')}
          value={connection ? connection.label : platformDisplay}
          accent="sky"
          badge={connection ? connection.provider : undefined}
          badgeAccent="sky"
          footer={
            target.lastReadStateAt
              ? t('lastPlatformReadAt', { at: target.lastReadStateAt })
              : t('stateSourceNote')
          }
        />
      </PpKpiGrid>

      {/* Main 2-Column Section */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        {/* Left Column: Creatives & Spend */}
        <section className="flex flex-col gap-6 lg:col-span-7">
          <PpCard
            title={t('creativesHeading')}
            subtitle={t('creativesSubtitle')}
            icon={Sparkles}
            iconAccent="mint"
            action={
              target.importedAds && target.importedAds.length > 0 ? (
                <PpPill accent="mint">{target.importedAds.length}</PpPill>
              ) : undefined
            }
          >
            <CampaignCreativesPanel draft={draft} importedAds={target.importedAds as ImportedAdView[] | undefined} />
          </PpCard>

          <PpCard
            title={t('spendHeading')}
            subtitle={t('spendSubtitle')}
            icon={BarChart3}
            iconAccent="primary"
          >
            <CampaignSpendPanel spend={spendView} />
          </PpCard>
        </section>

        {/* Right Column: Automation Audit Ledger */}
        <section className="flex flex-col gap-6 lg:col-span-5">
          <PpCard
            title={t('historyHeading')}
            subtitle={t('historySubtitle')}
            icon={History}
            iconAccent="amber"
            action={<PpPill accent="neutral">{t('soc2Badge')}</PpPill>}
          >
            {actionViews.length === 0 ? (
              <PpEmptyState icon={History} title={t('noHistory')} />
            ) : (
              <AutomationActionList
                orgId={orgId}
                projectId={projectId}
                actions={actionViews}
                canApprove={canApprove}
              />
            )}
          </PpCard>
        </section>
      </div>

      {/* Mobile Sticky Action Bar */}
      <PpMobileActionBar>
        <div className="flex w-full items-center justify-between gap-2">
          <PpButton variant="ghost" size="sm" asChild className="shrink-0">
            <Link href={`/orgs/${orgId}/projects/${projectId}/campaigns`} className="inline-flex items-center gap-1">
              <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />
              <span>{t('backToCampaigns')}</span>
            </Link>
          </PpButton>
          <div className="flex items-center gap-2">
            {target.campaignResourceName && target.campaignStatus === 'paused' ? (
              <AutomationActivateCampaignButton orgId={orgId} projectId={projectId} targetId={target.id} />
            ) : null}
            {target.campaignStatus === 'enabled' && executedActivation ? (
              <PauseCampaignButton orgId={orgId} projectId={projectId} activationActionId={executedActivation.id} />
            ) : null}
            <RefreshCampaignStateButton orgId={orgId} projectId={projectId} targetId={target.id} />
          </div>
        </div>
      </PpMobileActionBar>
    </PpPage>
  );
}
