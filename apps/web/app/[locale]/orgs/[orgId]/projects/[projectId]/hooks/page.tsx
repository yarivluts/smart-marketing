import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { Webhook, Activity, Radio, Clock, ShieldCheck } from 'lucide-react';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { listEnvironmentsForProject, listHookDeliveriesForProject, listHookEndpointsForProject, listOrgProjects } from '@/lib/orgs/queries';
import { hookApiUrl } from '@/lib/orgs/hook-api-url';
import { hookDeliveryStatusLabelKey, hookSignatureModeLabelKey } from '@/lib/orgs/hook-view';
import { PpPage, PpPageHeader, PpKpiGrid, PpKpiCard, PpCard, PpPill, PpEmptyState } from '@/components/pastel/primitives';
import { CreateHookEndpointForm } from '@/components/orgs/create-hook-endpoint-form';
import { DisableHookEndpointButton } from '@/components/orgs/disable-hook-endpoint-button';
import { EnableHookEndpointButton } from '@/components/orgs/enable-hook-endpoint-button';
import { EditHookEndpointForm } from '@/components/orgs/edit-hook-endpoint-form';
import { SetHookSigningSecretForm } from '@/components/orgs/set-hook-signing-secret-form';
import { HookReceiveUrl } from '@/components/orgs/hook-receive-url';
import { HookDeliveryStatusButtons } from '@/components/orgs/hook-delivery-status-buttons';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Hooks' });
  return { title: t('metaTitle') };
}

/**
 * A project's inbound webhook receivers + review queue (KAN-53, E9.1):
 * create a per-environment hook endpoint (optionally HMAC-signed), see its
 * always-redisplayable receive URL, and browse every raw payload that has
 * landed — "unknown payloads visible in queue, nothing lost" per the AC.
 * Gated on `ingest.write`, the same permission the sibling ingest-health/
 * keys admin surfaces already reuse for inbound-data management.
 */
export default async function ProjectHooksPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Fhooks`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'ingest.write', { orgId })) {
    notFound();
  }

  const projects = await listOrgProjects(orgId);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    if (projects.length > 0) {
      redirect(`/${locale}/orgs/${orgId}/projects/${projects[0].id}/hooks`);
    }
    redirect(`/${locale}/orgs/${orgId}`);
  }

  const [environments, hookEndpoints, hookDeliveries] = await Promise.all([
    listEnvironmentsForProject(orgId, projectId),
    listHookEndpointsForProject(orgId, projectId),
    listHookDeliveriesForProject(orgId, projectId),
  ]);

  const t = await getTranslations('Hooks');
  const tEnv = await getTranslations('EnvBadge');
  const environmentOptions = environments.map((environment) => ({ id: environment.id, name: environment.name }));
  const environmentNameById = new Map(environmentOptions.map((environment) => [environment.id, environment.name]));
  const hookApiBaseUrl = hookApiUrl();

  const activeEndpointsCount = hookEndpoints.filter((e) => !e.disabled_at).length;
  const pendingDeliveriesCount = hookDeliveries.filter((d) => d.status === 'pending').length;

  return (
    <PpPage>
      <PpPageHeader
        eyebrow={t('eyebrow')}
        title={t('title', { projectName: project.name })}
        description={t('description')}
      />

      <PpKpiGrid>
        <PpKpiCard
          label={t('kpiTotalEndpoints')}
          value={hookEndpoints.length}
          accent="primary"
        />
        <PpKpiCard
          label={t('kpiActiveEndpoints')}
          value={activeEndpointsCount}
          accent="mint"
        />
        <PpKpiCard
          label={t('kpiTotalDeliveries')}
          value={hookDeliveries.length}
          accent="neutral"
        />
        <PpKpiCard
          label={t('kpiPendingDeliveries')}
          value={pendingDeliveriesCount}
          accent={pendingDeliveriesCount > 0 ? 'amber' : 'neutral'}
        />
      </PpKpiGrid>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Endpoints & Create Form */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          <PpCard
            title={t('createEndpointHeading')}
            subtitle={t('description')}
            icon={Webhook}
            iconAccent="primary"
          >
            {environmentOptions.length === 0 ? (
              <p className="text-pp-body-md text-pp-on-surface-variant">{t('noEnvironments')}</p>
            ) : (
              <CreateHookEndpointForm orgId={orgId} projectId={projectId} environments={environmentOptions} />
            )}
          </PpCard>

          <PpCard
            title={t('existingEndpointsHeading')}
            subtitle={`${t('kpiTotalEndpoints')}: ${hookEndpoints.length}`}
            icon={ShieldCheck}
            iconAccent="mint"
            action={<PpPill accent="mint">{activeEndpointsCount} {t('kpiActiveEndpoints')}</PpPill>}
          >
            {hookEndpoints.length === 0 ? (
              <PpEmptyState
                icon={Webhook}
                title={t('noEndpoints')}
                description={t('noEndpointsDesc')}
              />
            ) : (
              <div className="flex flex-col gap-4">
                {hookEndpoints.map((endpoint) => {
                  const environmentName = environmentNameById.get(endpoint.environment_id);
                  return (
                    <div
                      key={endpoint.id}
                      className="p-4 rounded-2xl bg-pp-surface-container-low/60 border border-pp-outline-variant/20 flex flex-col gap-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-pp-body-md text-pp-on-surface">{endpoint.name}</span>
                            {environmentName ? (
                              <PpPill accent="neutral">
                                {tEnv(environmentName)}
                              </PpPill>
                            ) : null}
                          </div>
                          <span className="text-pp-body-sm text-pp-on-surface-variant">
                            {endpoint.disabled_at ? t('disabledLabel') : t(hookSignatureModeLabelKey(endpoint.signature_mode))}
                          </span>
                        </div>
                        {!endpoint.disabled_at ? (
                          <DisableHookEndpointButton orgId={orgId} projectId={projectId} hookEndpointId={endpoint.id} />
                        ) : (
                          <EnableHookEndpointButton orgId={orgId} projectId={projectId} hookEndpointId={endpoint.id} />
                        )}
                      </div>

                      <EditHookEndpointForm
                        orgId={orgId}
                        projectId={projectId}
                        hookEndpointId={endpoint.id}
                        initialName={endpoint.name}
                        initialSignatureHeaderName={endpoint.signature_mode === 'hmac_sha256' ? endpoint.signature_header_name : undefined}
                      />

                      {!endpoint.disabled_at ? <HookReceiveUrl hookApiBaseUrl={hookApiBaseUrl} hookId={endpoint.hook_id} /> : null}

                      {!endpoint.disabled_at && endpoint.signature_mode === 'hmac_sha256' ? (
                        <div className="pt-2 border-t border-pp-outline-variant/20">
                          <SetHookSigningSecretForm
                            orgId={orgId}
                            projectId={projectId}
                            hookEndpointId={endpoint.id}
                            hasSigningSecret={Boolean(endpoint.signing_secret_encrypted)}
                          />
                          {endpoint.previous_signing_secret_expires_at && endpoint.previous_signing_secret_expires_at > new Date().toISOString() ? (
                            <p className="text-pp-body-sm text-pp-outline mt-1.5">
                              {t('previousSecretGraceNotice', { expiresAt: endpoint.previous_signing_secret_expires_at })}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </PpCard>
        </div>

        {/* Right Column: Review Queue & Telemetry */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          <PpCard
            title={t('queueHeading')}
            subtitle={t('noDeliveriesDesc')}
            icon={Radio}
            iconAccent="pink"
            action={
              pendingDeliveriesCount > 0 ? (
                <PpPill accent="amber">
                  {pendingDeliveriesCount} {t('deliveryStatusPending')}
                </PpPill>
              ) : undefined
            }
          >
            {hookDeliveries.length === 0 ? (
              <PpEmptyState
                icon={Radio}
                title={t('noDeliveries')}
                description={t('noDeliveriesDesc')}
              />
            ) : (
              <div className="flex flex-col gap-3">
                {hookDeliveries.map((delivery) => (
                  <div
                    key={delivery.id}
                    className="p-4 rounded-2xl bg-pp-surface-container-low/60 border border-pp-outline-variant/20 flex flex-col gap-2.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-pp-body-md text-pp-on-surface">
                          {t('deliverySummary', {
                            receivedAt: delivery.received_at,
                            status: t(hookDeliveryStatusLabelKey(delivery.status)),
                          })}
                        </span>
                        <PpPill
                          accent={
                            delivery.status === 'reviewed'
                              ? 'mint'
                              : delivery.status === 'pending'
                              ? 'amber'
                              : 'neutral'
                          }
                        >
                          {t(hookDeliveryStatusLabelKey(delivery.status))}
                        </PpPill>
                      </div>
                      {delivery.status === 'pending' ? (
                        <HookDeliveryStatusButtons orgId={orgId} projectId={projectId} hookDeliveryId={delivery.id} />
                      ) : null}
                    </div>
                    {delivery.applied_at ? (
                      <p className="text-pp-body-sm text-pp-on-surface-variant">{t('appliedViaMapping', { batchId: delivery.applied_batch_id ?? '' })}</p>
                    ) : null}
                    <pre className="max-h-40 overflow-auto rounded-xl bg-pp-inverse-surface text-pp-inverse-on-surface p-3 font-mono text-xs">
                      {delivery.raw_payload}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </PpCard>
        </div>
      </div>
    </PpPage>
  );
}
