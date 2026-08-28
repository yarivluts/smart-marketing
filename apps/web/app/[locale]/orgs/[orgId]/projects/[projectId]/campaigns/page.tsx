import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { Link } from '@/i18n/navigation';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import {
  listActiveAttachmentsForProject,
  listAutomationActionsForProject,
  listAutomationTargetStatesForProject,
  listOrgProjects,
  listSharedCredentials,
} from '@/lib/orgs/queries';
import { toAutomationConnectionOptions, toAutomationTargetView } from '@/lib/orgs/automation-view';
import { AutomationSeedTargetForm } from '@/components/orgs/automation-seed-target-form';
import { AutomationProposeCampaignDraftForm } from '@/components/orgs/automation-propose-campaign-draft-form';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Campaigns' });
  return { title: t('metaTitle') };
}

const STATUS_BADGE_CLASSES: Record<string, string> = {
  enabled: 'bg-green-100 text-green-800',
  paused: 'bg-amber-100 text-amber-800',
  removed: 'bg-muted text-muted-foreground',
};

/**
 * The project's campaigns across every connected ad platform — one row per
 * automation target (the target row IS the per-campaign live state: see
 * `AutomationTargetStateModel`'s own doc comment), with its platform badge
 * (from the connection's credential provider), status, budget, and a link
 * into the per-campaign detail (creatives + full action history). Gated on
 * `automation.execute`, same as the automation queue these campaigns are
 * managed through — every manage action here funnels into that queue's
 * propose→approve→execute lifecycle; nothing on these pages writes campaign
 * state directly.
 */
export default async function CampaignsPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Fcampaigns`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'automation.execute', { orgId })) {
    notFound();
  }

  const [projects, targets, actions, attachments, credentials] = await Promise.all([
    listOrgProjects(orgId),
    listAutomationTargetStatesForProject(orgId, projectId),
    listAutomationActionsForProject(orgId, projectId),
    listActiveAttachmentsForProject(orgId, projectId),
    listSharedCredentials(orgId),
  ]);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    notFound();
  }

  const connections = toAutomationConnectionOptions(attachments, credentials);
  const connectionById = new Map(connections.map((connection) => [connection.id, connection]));
  const targetViews = targets.map(toAutomationTargetView);
  const lastActionAtByTarget = new Map<string, string>();
  for (const action of actions) {
    if (!lastActionAtByTarget.has(action.target_id)) {
      lastActionAtByTarget.set(action.target_id, action.proposed_at);
    }
  }
  const draftlessTargets = targetViews.filter((target) => !target.campaignResourceName);

  const t = await getTranslations('Campaigns');
  const tAutomation = await getTranslations('Automation');

  return (
    <main className="container mx-auto flex max-w-5xl flex-col gap-8 py-16">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">{t('title', { projectName: project.name })}</h1>
        <Link className="text-sm underline" href={`/orgs/${orgId}/projects/${projectId}/automation`}>
          {t('automationQueueLink')}
        </Link>
      </div>

      <section className="flex flex-col gap-3">
        {targetViews.length === 0 ? (
          <p className="text-muted-foreground">{t('noCampaigns')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {targetViews.map((target) => {
              const connection = target.resourceAttachmentId ? connectionById.get(target.resourceAttachmentId) : undefined;
              return (
                <li key={target.id} className="rounded-md border border-input">
                  <Link
                    href={`/orgs/${orgId}/projects/${projectId}/campaigns/${encodeURIComponent(target.id)}`}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-muted/40"
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-medium">{target.label}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        {target.externalPlatform
                          ? t(`platform.${target.externalPlatform}`)
                          : connection?.provider
                            ? t(`platform.${connection.provider}`)
                            : t('platform.simulated')}
                      </span>
                      {target.campaignStatus ? (
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${STATUS_BADGE_CLASSES[target.campaignStatus] ?? 'bg-muted text-muted-foreground'}`}
                        >
                          {t(`status.${target.campaignStatus}`)}
                        </span>
                      ) : (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          {t('status.none')}
                        </span>
                      )}
                    </span>
                    <span className="flex items-center gap-4 text-muted-foreground">
                      <span>{t('dailyBudget', { amount: target.dailyBudgetUsd })}</span>
                      {lastActionAtByTarget.has(target.id) ? (
                        <span className="text-xs">{t('lastActionAt', { at: lastActionAtByTarget.get(target.id) ?? '' })}</span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{tAutomation('seedTargetHeading')}</h2>
        <AutomationSeedTargetForm orgId={orgId} projectId={projectId} connections={connections} />
      </section>

      {draftlessTargets.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t('newCampaignHeading')}</h2>
          <AutomationProposeCampaignDraftForm orgId={orgId} projectId={projectId} targets={draftlessTargets} />
        </section>
      ) : null}
    </main>
  );
}
