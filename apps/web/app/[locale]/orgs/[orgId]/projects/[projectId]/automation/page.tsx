import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import {
  getActiveAutomationGuardrailPolicy,
  getAutomationKillSwitchStatus,
  listActiveAttachmentsForProject,
  listAutomationActionsForProject,
  listAutomationTargetStatesForProject,
  listOrgProjects,
  listSharedCredentials,
} from '@/lib/orgs/queries';
import {
  toAutomationActionView,
  toAutomationConnectionOptions,
  toAutomationGuardrailPolicyView,
  toAutomationTargetView,
} from '@/lib/orgs/automation-view';
import { AutomationKillSwitchPanel } from '@/components/orgs/automation-kill-switch-panel';
import { AutomationGuardrailPolicyForm } from '@/components/orgs/automation-guardrail-policy-form';
import { AutomationSeedTargetForm } from '@/components/orgs/automation-seed-target-form';
import { AutomationProposeActionForm } from '@/components/orgs/automation-propose-action-form';
import { AutomationActionList } from '@/components/orgs/automation-action-list';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Automation' });
  return { title: t('metaTitle') };
}

/**
 * A project's KAN-71 automation action pipeline: the org's kill switch, the
 * project's guardrail policy, its simulated automation targets (see
 * `AutomationTargetStateModel`'s own doc comment for why these are
 * simulated rather than real ad-platform campaigns today), and the
 * dry-run-diff -> approval -> execute -> verify -> rollback action queue.
 * Gated on `automation.execute`; approve/reject controls additionally check
 * `automation.approve` per-action (`operator`/`project_admin` hold both
 * today, but the distinction matters once a narrower custom role exists).
 */
export default async function AutomationPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Fautomation`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  const principal = { type: 'user' as const, id: user.id };
  if (!membership || !can(bindings, principal, 'automation.execute', { orgId })) {
    notFound();
  }
  const canApprove = can(bindings, principal, 'automation.approve', { orgId });

  const [projects, killSwitchStatus, policy, targets, actions, activeAttachments, credentials] = await Promise.all([
    listOrgProjects(orgId),
    getAutomationKillSwitchStatus(orgId),
    getActiveAutomationGuardrailPolicy(orgId, projectId),
    listAutomationTargetStatesForProject(orgId, projectId),
    listAutomationActionsForProject(orgId, projectId),
    listActiveAttachmentsForProject(orgId, projectId),
    listSharedCredentials(orgId),
  ]);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    notFound();
  }

  const t = await getTranslations('Automation');
  const targetViews = targets.map(toAutomationTargetView);
  const connectionOptions = toAutomationConnectionOptions(activeAttachments, credentials);
  const connectionById = new Map(connectionOptions.map((connection) => [connection.id, connection]));
  const tierLabelKeys = { read: 'tierRead', optimize: 'tierOptimize', manage: 'tierManage' } as const;

  return (
    <main className="container mx-auto flex max-w-3xl flex-col gap-8 py-16">
      <h1 className="text-3xl font-bold tracking-tight">{t('title', { projectName: project.name })}</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('killSwitchHeading')}</h2>
        <AutomationKillSwitchPanel orgId={orgId} status={killSwitchStatus} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('policyHeading')}</h2>
        <AutomationGuardrailPolicyForm orgId={orgId} projectId={projectId} policy={toAutomationGuardrailPolicyView(policy)} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('targetsHeading')}</h2>
        {targetViews.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('targetsEmptyNote')}</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {targetViews.map((target) => {
              const connection = target.resourceAttachmentId ? connectionById.get(target.resourceAttachmentId) : undefined;
              return (
                <li key={target.id}>
                  {t('targetLine', { label: target.label, budget: target.dailyBudgetUsd })}
                  {connection ? (
                    <span className="text-muted-foreground">
                      {' '}
                      — {t('targetConnectionLine', { label: connection.label, tier: t(tierLabelKeys[connection.tier]) })}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        <AutomationSeedTargetForm orgId={orgId} projectId={projectId} connections={connectionOptions} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('proposeHeading')}</h2>
        <AutomationProposeActionForm orgId={orgId} projectId={projectId} targets={targetViews} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('actionsHeading')}</h2>
        <AutomationActionList orgId={orgId} projectId={projectId} actions={actions.map(toAutomationActionView)} canApprove={canApprove} />
      </section>
    </main>
  );
}
