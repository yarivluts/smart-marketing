import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { ArrowLeft, CircleDollarSign, GitBranch, History, Image as ImageIcon, Megaphone, Radio, Wallet } from 'lucide-react';
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
import { resolveSelectedEnvironment } from '@/lib/orgs/selected-environment';
import {
  actionStatusLabelKey,
  findCampaignDraftForTarget,
  toAutomationActionView,
  toAutomationConnectionOptions,
  toAutomationTargetView,
} from '@/lib/orgs/automation-view';
import { buildCampaignLifecycle, countActionsByStatus, summariseSpendDays } from '@/lib/orgs/campaign-detail-view';
import { CampaignCreativesPanel, type CampaignDraftView, type ImportedAdView } from '@/components/orgs/campaign-creatives-panel';
import { CampaignSpendPanel } from '@/components/orgs/campaign-spend-panel';
import { AutomationActivateCampaignButton } from '@/components/orgs/automation-activate-campaign-button';
import { PauseCampaignButton } from '@/components/orgs/pause-campaign-button';
import { RefreshCampaignStateButton } from '@/components/orgs/refresh-campaign-state-button';
import { AutomationActionList } from '@/components/orgs/automation-action-list';
import { StatCard } from '@/components/ui/stat-card';
import { ChartCard, EmptyState, FlowDiagram, PageHero, STATUS_TOKENS, type VizStatus } from '@/components/viz';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string; targetId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Campaigns' });
  // Static, not the campaign's own label — same non-enumeration posture as
  // the board detail page's generateMetadata (see its doc comment).
  return { title: t('metaTitle') };
}

const LIFECYCLE_EDGES = [
  { source: 'draft', target: 'activation' },
  { source: 'activation', target: 'live' },
  { source: 'sync', target: 'live' },
  { source: 'live', target: 'spend' },
] as const;

/**
 * One campaign: its last-known live state (the target row — only ever
 * written by an executor running under an approved action), the actual ads
 * it carries (derived from its one `campaign_draft_create` action's draft),
 * manage actions that funnel into the existing propose→approve→execute
 * queue (activate; pause = rollback of the executed activation — a real,
 * audited path on every executor), and the full per-target action history
 * timeline. Gated on `automation.execute` to view; approve/reject controls
 * inside the timeline additionally gate on `automation.approve`, the same
 * coarse-view/fine-action split the automation page uses.
 *
 * The lifecycle diagram and KPI row are derived from the same rows: the latest draft and
 * activation actions, the recorded status, the platform-read timestamp and the measured spend.
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
  if (!membership || !can(bindings, principal, 'automation.execute', { orgId, projectId })) {
    notFound();
  }
  const canApprove = can(bindings, principal, 'automation.approve', { orgId, projectId });

  const [projects, targets, targetActions, attachments, credentials] = await Promise.all([
    listOrgProjects(orgId),
    listAutomationTargetStatesForProject(orgId, projectId),
    listAutomationActionsForTarget(orgId, projectId, targetId),
    listActiveAttachmentsForProject(orgId, projectId),
    listSharedCredentials(orgId),
  ]);
  const project = projects.find((candidate) => candidate.id === projectId);
  const targetModel = targets.find((candidate) => candidate.id === targetId);
  if (!project || !targetModel) {
    notFound();
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
  // Same `campaign_resource_name ?? id` fallback the executors apply for a target seeded to
  // represent a pre-existing campaign — the spend rows' `campaign_id` dimension carries the
  // platform's own campaign id either way.
  const { selected: selectedEnvironment } = await resolveSelectedEnvironment(orgId, projectId);
  const spendOutcome = await queryCampaignSpend(orgId, projectId, target.campaignResourceName ?? target.id, { environmentId: selectedEnvironment?.id });
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
  const spendSummary = spendView.ok ? summariseSpendDays(spendView.days) : null;

  const t = await getTranslations('Campaigns');
  const tAutomation = await getTranslations('Automation');
  const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
  const formatAt = (iso: string | undefined): string | undefined => {
    if (!iso) return undefined;
    const parsed = new Date(iso);
    return Number.isNaN(parsed.getTime()) ? iso : dateTime.format(parsed);
  };
  const money = new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
  const dayFormat = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' });
  const formatDay = (iso: string): string => {
    const parsed = new Date(iso);
    return Number.isNaN(parsed.getTime()) ? iso : dayFormat.format(parsed);
  };

  const platformName = target.externalPlatform
    ? t(`platform.${target.externalPlatform}`)
    : connection?.provider
      ? t(`platform.${connection.provider}`)
      : t('platform.simulated');
  const statusName = target.campaignStatus ? t(`status.${target.campaignStatus}`) : t('status.none');
  const statusTone: VizStatus = target.campaignStatus === 'enabled' ? 'ok' : target.campaignStatus === 'paused' ? 'warn' : target.campaignStatus === 'removed' ? 'error' : 'idle';

  const lifecycle = buildCampaignLifecycle({
    actions: targetActions.map((action) => ({ actionType: action.action_type, status: action.status, proposedAt: action.proposed_at })),
    campaignStatus: target.campaignStatus,
    lastReadStateAt: target.lastReadStateAt,
    spend: spendView.ok ? { days: spendView.days.length, totalUsd: spendView.totalSpendUsd } : null,
  });
  const flowNodes = lifecycle.map((node) => ({
    id: node.stage,
    label: t(`lifecycle.${node.stage}.title`),
    value: node.stage === 'spend' && spendSummary && spendSummary.totalUsd > 0 ? money.format(spendSummary.totalUsd) : undefined,
    sublabel: node.at ? `${t(node.stateKey)} · ${formatDay(node.at)}` : t(node.stateKey),
    status: node.status,
  }));
  const flowEdges = LIFECYCLE_EDGES.map((edge) => {
    const source = lifecycle.find((node) => node.stage === edge.source);
    const reached = source?.status === 'ok';
    return { ...edge, status: reached ? ('ok' as const) : ('idle' as const), animated: reached && edge.target === 'spend' };
  });
  const statusCounts = countActionsByStatus(actionViews);
  const lastActionAt = [...actionViews].sort((a, b) => b.proposedAt.localeCompare(a.proposedAt))[0]?.proposedAt;

  return (
    <div className="container mx-auto flex max-w-6xl flex-col gap-6 py-10">
      <PageHero
        icon={Megaphone}
        eyebrow={platformName}
        title={target.label}
        description={target.lastReadStateAt ? t('lastPlatformReadAt', { at: formatAt(target.lastReadStateAt) ?? '' }) : t('stateSourceNote')}
        actions={
          <Link
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
            href={`/orgs/${orgId}/projects/${projectId}/campaigns`}
          >
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
            {t('backToCampaigns')}
          </Link>
        }
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            title={t('statusLabel')}
            value={statusName}
            icon={Radio}
            badge={<span className={`h-2.5 w-2.5 rounded-full ${STATUS_TOKENS[statusTone].dot}`} aria-hidden="true" />}
            subtext={target.updatedAt ? t('lastKnownStateAt', { at: formatAt(target.updatedAt) ?? '' }) : undefined}
          />
          <StatCard title={t('budgetLabel')} value={t('dailyBudget', { amount: target.dailyBudgetUsd })} icon={Wallet} subtext={connection ? `${t('connectionLabel')}: ${connection.label}` : undefined} />
          <StatCard
            title={t('spendHeading')}
            value={spendView.ok && spendSummary ? money.format(spendView.totalSpendUsd) : t('noData')}
            icon={CircleDollarSign}
            trendData={spendView.ok ? spendView.days.map((day) => day.spendUsd) : undefined}
            subtext={spendSummary ? t('spendActiveDays', { count: spendSummary.activeDays }) : undefined}
          />
          <StatCard
            title={t('kpiActionsTaken')}
            value={new Intl.NumberFormat(locale).format(actionViews.length)}
            icon={History}
            subtext={lastActionAt ? t('lastActionAt', { at: formatAt(lastActionAt) ?? '' }) : undefined}
          />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
          {target.importedObjective ? (
            <span>
              {t('objectiveLabel')}
              {': '}
              <span className="font-medium text-foreground" dir="ltr">
                {target.importedObjective}
              </span>
            </span>
          ) : null}
          {target.campaignResourceName ? (
            <span className="font-mono" dir="ltr">
              {target.campaignResourceName}
            </span>
          ) : null}
        </div>
        <div className="mt-4 flex flex-wrap items-start gap-2">
          {target.campaignResourceName && target.campaignStatus === 'paused' ? (
            <AutomationActivateCampaignButton orgId={orgId} projectId={projectId} targetId={target.id} />
          ) : null}
          {target.campaignStatus === 'enabled' && executedActivation ? (
            <PauseCampaignButton orgId={orgId} projectId={projectId} activationActionId={executedActivation.id} />
          ) : null}
          <RefreshCampaignStateButton orgId={orgId} projectId={projectId} targetId={target.id} />
        </div>
      </PageHero>

      <ChartCard title={t('lifecycleTitle')} description={t('lifecycleDescription')} icon={GitBranch}>
        <FlowDiagram label={t('lifecycleTitle')} nodes={flowNodes} edges={flowEdges} height={260} />
      </ChartCard>

      <div className="grid gap-6 lg:grid-cols-5">
        <ChartCard title={t('spendHeading')} description={t('spendDescription')} icon={CircleDollarSign} className="lg:col-span-3" fill>
          <CampaignSpendPanel spend={spendView} />
        </ChartCard>
        <ChartCard title={t('creativesHeading')} icon={ImageIcon} className="lg:col-span-2" fill>
          <CampaignCreativesPanel draft={draft} importedAds={target.importedAds as ImportedAdView[] | undefined} />
        </ChartCard>
      </div>

      <ChartCard title={t('historyHeading')} description={t('historyDescription')} icon={History}>
        {actionViews.length === 0 ? (
          <EmptyState compact icon={History} title={t('noHistory')} />
        ) : (
          <div className="flex flex-col gap-4">
            <ul className="flex flex-wrap gap-2" aria-label={t('historyStatusSummary')}>
              {statusCounts.map(({ status, count }) => (
                <li key={status} className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium text-foreground">
                  <span>{tAutomation(actionStatusLabelKey(status))}</span>
                  <span className="rounded-full bg-primary/10 px-1.5 text-primary tabular-nums">{count}</span>
                </li>
              ))}
            </ul>
            <AutomationActionList orgId={orgId} projectId={projectId} actions={actionViews} canApprove={canApprove} />
          </div>
        )}
      </ChartCard>
    </div>
  );
}
