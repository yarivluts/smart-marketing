import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { listEnvironmentsForProject, listHookDeliveriesForProject, listHookEndpointsForProject, listOrgProjects } from '@/lib/orgs/queries';
import { hookApiUrl } from '@/lib/orgs/hook-api-url';
import { hookDeliveryStatusLabelKey, hookSignatureModeLabelKey } from '@/lib/orgs/hook-view';
import { CreateHookEndpointForm } from '@/components/orgs/create-hook-endpoint-form';
import { DisableHookEndpointButton } from '@/components/orgs/disable-hook-endpoint-button';
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
    notFound();
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

  return (
    <main className="container mx-auto flex max-w-3xl flex-col gap-8 py-16">
      <h1 className="text-3xl font-bold tracking-tight">{t('title', { projectName: project.name })}</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('existingEndpointsHeading')}</h2>
        {hookEndpoints.length === 0 ? (
          <p className="text-muted-foreground">{t('noEndpoints')}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {hookEndpoints.map((endpoint) => {
              const environmentName = environmentNameById.get(endpoint.environment_id);
              return (
                <li key={endpoint.id} className="flex flex-col gap-2 rounded-md border border-input px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex flex-col gap-1">
                      <span className="font-medium">
                        {endpoint.name}
                        {environmentName ? ` (${tEnv(environmentName)})` : ''}
                      </span>
                      <span className="text-muted-foreground">
                        {endpoint.disabled_at ? t('disabledLabel') : t(hookSignatureModeLabelKey(endpoint.signature_mode))}
                      </span>
                    </div>
                    {!endpoint.disabled_at ? (
                      <DisableHookEndpointButton orgId={orgId} projectId={projectId} hookEndpointId={endpoint.id} />
                    ) : null}
                  </div>
                  {!endpoint.disabled_at ? <HookReceiveUrl hookApiBaseUrl={hookApiBaseUrl} hookId={endpoint.hook_id} /> : null}
                  {!endpoint.disabled_at && endpoint.signature_mode === 'hmac_sha256' ? (
                    <SetHookSigningSecretForm
                      orgId={orgId}
                      projectId={projectId}
                      hookEndpointId={endpoint.id}
                      hasSigningSecret={Boolean(endpoint.signing_secret_encrypted)}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('createEndpointHeading')}</h2>
        {environmentOptions.length === 0 ? (
          <p className="text-muted-foreground">{t('noEnvironments')}</p>
        ) : (
          <CreateHookEndpointForm orgId={orgId} projectId={projectId} environments={environmentOptions} />
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('queueHeading')}</h2>
        {hookDeliveries.length === 0 ? (
          <p className="text-muted-foreground">{t('noDeliveries')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {hookDeliveries.map((delivery) => (
              <li key={delivery.id} className="flex flex-col gap-2 rounded-md border border-input px-3 py-2 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="font-medium">
                    {t('deliverySummary', {
                      receivedAt: delivery.received_at,
                      status: t(hookDeliveryStatusLabelKey(delivery.status)),
                    })}
                  </span>
                  {delivery.status === 'pending' ? (
                    <HookDeliveryStatusButtons orgId={orgId} projectId={projectId} hookDeliveryId={delivery.id} />
                  ) : null}
                </div>
                <pre className="max-h-40 overflow-auto rounded-md bg-muted/50 p-2 text-xs">{delivery.raw_payload}</pre>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
