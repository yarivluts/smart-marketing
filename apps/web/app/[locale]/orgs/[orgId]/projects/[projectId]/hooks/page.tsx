import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import {
  listEnvironmentsForProject,
  listHookEndpointsForProject,
  listHookPayloadsForProject,
  listOrgProjects,
} from '@/lib/orgs/queries';
import { hooksApiUrl } from '@/lib/orgs/hooks-api-url';
import { CreateHookEndpointForm } from '@/components/orgs/create-hook-endpoint-form';
import { RevokeHookEndpointButton } from '@/components/orgs/revoke-hook-endpoint-button';
import { DismissHookPayloadButton } from '@/components/orgs/dismiss-hook-payload-button';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Hooks' });
  return { title: t('metaTitle') };
}

const RAW_BODY_PREVIEW_LENGTH = 200;

function previewRawBody(rawBody: string): string {
  return rawBody.length > RAW_BODY_PREVIEW_LENGTH ? `${rawBody.slice(0, RAW_BODY_PREVIEW_LENGTH)}…` : rawBody;
}

/**
 * A project's inbound webhook endpoints and review queue (KAN-53): create a per-project hook
 * URL ("point any SaaS webhook here"), see every request that landed on it — every payload,
 * whether its signature verified or not — and dismiss the ones a human has reviewed. There is no
 * mapping engine yet (KAN-54), so every payload is unmapped by definition. Gated on
 * `ingest.write`, the same permission `IngestHealthPage`'s quarantine browser uses for
 * operationally sensitive raw-ingest surfaces.
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

  const [environments, hookEndpoints, hookPayloads] = await Promise.all([
    listEnvironmentsForProject(orgId, projectId),
    listHookEndpointsForProject(orgId, projectId),
    listHookPayloadsForProject(orgId, projectId),
  ]);

  const t = await getTranslations('Hooks');
  const tEnv = await getTranslations('EnvBadge');
  const environmentOptions = environments.map((environment) => ({ id: environment.id, name: environment.name }));
  const environmentNameById = new Map(environmentOptions.map((environment) => [environment.id, environment.name]));
  const hookEndpointNameById = new Map(hookEndpoints.map((hookEndpoint) => [hookEndpoint.id, hookEndpoint.name]));
  const baseUrl = hooksApiUrl();

  return (
    <main className="container mx-auto flex max-w-3xl flex-col gap-8 py-16">
      <h1 className="text-3xl font-bold tracking-tight">{t('title', { projectName: project.name })}</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('existingHookEndpointsHeading')}</h2>
        {hookEndpoints.length === 0 ? (
          <p className="text-muted-foreground">{t('noHookEndpoints')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {hookEndpoints.map((hookEndpoint) => {
              const environmentName = environmentNameById.get(hookEndpoint.environmentId);
              return (
                <li
                  key={hookEndpoint.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-input px-3 py-2 text-sm"
                >
                  <div className="flex flex-col gap-1">
                    <span className="font-medium">
                      {hookEndpoint.name}
                      {environmentName ? ` (${tEnv(environmentName)})` : ''}
                    </span>
                    <code className="break-all text-xs text-muted-foreground">{`${baseUrl}/${projectId}/${hookEndpoint.id}`}</code>
                    <span className="text-muted-foreground">
                      {t('signatureModeLine', { mode: t(`signatureMode.${hookEndpoint.signatureMode}`) })}
                    </span>
                    {hookEndpoint.revokedAt ? <span className="text-muted-foreground">{t('revokedLabel')}</span> : null}
                  </div>
                  {!hookEndpoint.revokedAt ? (
                    <RevokeHookEndpointButton orgId={orgId} projectId={projectId} hookEndpointId={hookEndpoint.id} />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('createHookEndpointHeading')}</h2>
        {environmentOptions.length === 0 ? (
          <p className="text-muted-foreground">{t('noEnvironments')}</p>
        ) : (
          <CreateHookEndpointForm orgId={orgId} projectId={projectId} environments={environmentOptions} hooksBaseUrl={baseUrl} />
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('reviewQueueHeading')}</h2>
        {hookPayloads.length === 0 ? (
          <p className="text-muted-foreground">{t('noPendingPayloads')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {hookPayloads.map((payload) => (
              <li key={payload.id} className="flex flex-col gap-1 rounded-md border border-input px-3 py-2 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="font-medium">
                      {t('payloadSummary', {
                        hookEndpointName: hookEndpointNameById.get(payload.hook_endpoint_id) ?? payload.hook_endpoint_id,
                        signatureStatus: t(`signatureStatus.${payload.signature_status}`),
                        receivedAt: payload.received_at,
                      })}
                    </span>
                    <pre className="whitespace-pre-wrap break-all text-xs text-muted-foreground">
                      {previewRawBody(payload.raw_body)}
                    </pre>
                  </div>
                  <DismissHookPayloadButton orgId={orgId} projectId={projectId} hookPayloadId={payload.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
