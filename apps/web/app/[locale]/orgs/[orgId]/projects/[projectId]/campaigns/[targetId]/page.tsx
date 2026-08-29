import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
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
  // Static, not the campaign's own label — same non-enumeration posture as
  // the board detail page's generateMetadata (see its doc comment).
  return { title: t('metaTitle') };
}

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

  return (
    <main className="container mx-auto flex max-w-4xl flex-col gap-8 py-16">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">{target.label}</h1>
        <Link className="text-sm underline" href={`/orgs/${orgId}/projects/${projectId}/campaigns`}>
          {t('backToCampaigns')}
        </Link>
      </div>

      <section className="flex flex-col gap-2 rounded-md border border-input p-4 text-sm">
        <div className="flex flex-wrap gap-x-8 gap-y-2">
          <span>
            <span className="text-muted-foreground">{t('platformLabel')}{': '}</span>
            {target.externalPlatform
              ? t(`platform.${target.externalPlatform}`)
              : connection?.provider
                ? t(`platform.${connection.provider}`)
                : t('platform.simulated')}
          </span>
          {target.importedObjective ? (
            <span>
              <span className="text-muted-foreground">{t('objectiveLabel')}{': '}</span>
              <span dir="ltr">{target.importedObjective}</span>
            </span>
          ) : null}
          <span>
            <span className="text-muted-foreground">{t('statusLabel')}{': '}</span>
            {target.campaignStatus ? t(`status.${target.campaignStatus}`) : t('status.none')}
          </span>
          <span>
            <span className="text-muted-foreground">{t('budgetLabel')}{': '}</span>
            {t('dailyBudget', { amount: target.dailyBudgetUsd })}
          </span>
          {connection ? (
            <span>
              <span className="text-muted-foreground">{t('connectionLabel')}{': '}</span>
              {connection.label}
            </span>
          ) : null}
        </div>
        {target.campaignResourceName ? (
          <span className="text-xs text-muted-foreground" dir="ltr">
            {target.campaignResourceName}
          </span>
        ) : null}
        {target.updatedAt ? <span className="text-xs text-muted-foreground">{t('lastKnownStateAt', { at: target.updatedAt })}</span> : null}
        {/* When a platform read/sync has recorded state (`last_read_state_at`),
          say so with its timestamp; otherwise keep the honest stand-in label —
          until a real ad-platform read lands for THIS target (KAN-43), state
          reflects executed GrowthOS actions, not a platform pull. */}
        {target.lastReadStateAt ? (
          <span className="text-xs text-muted-foreground">{t('lastPlatformReadAt', { at: target.lastReadStateAt })}</span>
        ) : (
          <span className="text-xs text-muted-foreground">{t('stateSourceNote')}</span>
        )}
        <div className="flex gap-2 pt-2">
          {target.campaignResourceName && target.campaignStatus === 'paused' ? (
            <AutomationActivateCampaignButton orgId={orgId} projectId={projectId} targetId={target.id} />
          ) : null}
          {target.campaignStatus === 'enabled' && executedActivation ? (
            <PauseCampaignButton orgId={orgId} projectId={projectId} activationActionId={executedActivation.id} />
          ) : null}
          <RefreshCampaignStateButton orgId={orgId} projectId={projectId} targetId={target.id} />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('creativesHeading')}</h2>
        <CampaignCreativesPanel draft={draft} importedAds={target.importedAds as ImportedAdView[] | undefined} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('spendHeading')}</h2>
        <CampaignSpendPanel spend={spendView} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('historyHeading')}</h2>
        {actionViews.length === 0 ? (
          <p className="text-muted-foreground">{t('noHistory')}</p>
        ) : (
          <AutomationActionList orgId={orgId} projectId={projectId} actions={actionViews} canApprove={canApprove} />
        )}
      </section>
    </main>
  );
}
