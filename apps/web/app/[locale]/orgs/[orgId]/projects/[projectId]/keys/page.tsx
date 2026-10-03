import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { Key, ShieldCheck, KeyRound, Network, Clock, ShieldAlert } from 'lucide-react';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { listApiKeysForProject, listEnvironmentsForProject, listMcpOAuthGrantsForProject, listOrgProjects } from '@/lib/orgs/queries';
import { ingestApiUrl } from '@/lib/orgs/ingest-api-url';
import { mcpApiUrl } from '@/lib/orgs/mcp-api-url';
import {
  PpPage,
  PpPageHeader,
  PpKpiGrid,
  PpKpiCard,
  PpCard,
  PpPill,
  PpEmptyState,
} from '@/components/pastel/primitives';
import { CreateApiKeyForm } from '@/components/orgs/create-api-key-form';
import { EditApiKeyNameForm } from '@/components/orgs/edit-api-key-name-form';
import { RevokeApiKeyButton } from '@/components/orgs/revoke-api-key-button';
import { RevokeMcpConnectionButton } from '@/components/orgs/revoke-mcp-connection-button';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'ApiKeys' });
  return { title: t('metaTitle') };
}

/**
 * A project's API keys (KAN-30): mint scoped to one environment with a
 * least-privilege scope selection, see every key ever minted (active or
 * revoked) with its display-safe prefix and last-used time, and revoke one
 * immediately. This whole page — unlike KAN-27's resource library, which
 * lets any active member browse — is gated on `keys.manage`, matching the
 * story's own "Admin UI" framing: a key's scope list and usage metadata are
 * sensitive enough that only roles trusted to manage keys should see them
 * at all, not just mutate them.
 */
export default async function ProjectApiKeysPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Fkeys`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'keys.manage', { orgId })) {
    notFound();
  }

  const projects = await listOrgProjects(orgId);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    if (projects.length > 0) {
      redirect(`/${locale}/orgs/${orgId}/projects/${projects[0].id}/keys`);
    }
    redirect(`/${locale}/orgs/${orgId}`);
  }

  const [environments, apiKeys, mcpGrants] = await Promise.all([
    listEnvironmentsForProject(orgId, projectId),
    listApiKeysForProject(orgId, projectId),
    listMcpOAuthGrantsForProject(orgId, projectId),
  ]);

  const t = await getTranslations('ApiKeys');
  const tEnv = await getTranslations('EnvBadge');
  const environmentOptions = environments.map((environment) => ({ id: environment.id, name: environment.name }));
  const environmentNameById = new Map(environmentOptions.map((environment) => [environment.id, environment.name]));

  const activeKeysCount = apiKeys.filter((k) => !k.revokedAt).length;
  const revokedKeysCount = apiKeys.filter((k) => Boolean(k.revokedAt)).length;
  const activeMcpGrantsCount = mcpGrants.filter((g) => !g.revokedAt && g.isActive).length;

  return (
    <PpPage>
      <PpPageHeader
        eyebrow={t('eyebrow')}
        title={t('title', { projectName: project.name })}
        description={t('description')}
      />

      <PpKpiGrid>
        <PpKpiCard
          label={t('kpiActiveKeys')}
          value={activeKeysCount}
          valueSuffix={`/ ${apiKeys.length}`}
          accent="mint"
        />
        <PpKpiCard
          label={t('kpiTotalKeys')}
          value={apiKeys.length}
          accent="primary"
        />
        <PpKpiCard
          label={t('kpiRevokedKeys')}
          value={revokedKeysCount}
          accent={revokedKeysCount > 0 ? 'error' : 'neutral'}
        />
        <PpKpiCard
          label={t('kpiMcpGrants')}
          value={mcpGrants.length}
          accent="neutral"
        />
      </PpKpiGrid>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Create Form & MCP Connections */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          <PpCard
            title={t('createKeyHeading')}
            subtitle={t('description')}
            icon={KeyRound}
            iconAccent="primary"
          >
            {environmentOptions.length === 0 ? (
              <p className="text-pp-body-md text-pp-on-surface-variant">{t('noEnvironments')}</p>
            ) : (
              <CreateApiKeyForm
                orgId={orgId}
                projectId={projectId}
                environments={environmentOptions}
                ingestBaseUrl={ingestApiUrl()}
              />
            )}
          </PpCard>

          <PpCard
            title={t('mcpConnectionsHeading')}
            subtitle={t('mcpEndpointIntro')}
            icon={Network}
            iconAccent="mint"
            action={
              activeMcpGrantsCount > 0 ? (
                <PpPill accent="mint">{activeMcpGrantsCount} {t('mcpConnectionActiveLabel')}</PpPill>
              ) : undefined
            }
          >
            <div className="flex flex-col gap-4">
              <div className="p-3.5 bg-pp-surface-container-low/80 rounded-2xl border border-pp-outline-variant/20 flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-pp-outline uppercase tracking-wider">{t('mcpEndpointLabel')}</span>
                <code className="font-mono text-xs text-pp-primary break-all select-all font-semibold">
                  {mcpApiUrl()}
                </code>
              </div>
              <p className="text-xs text-pp-on-surface-variant">{t('mcpApiKeyIntro')}</p>

              {mcpGrants.length === 0 ? (
                <PpEmptyState
                  icon={Network}
                  title={t('noMcpConnections')}
                  description={t('noMcpConnectionsDesc')}
                />
              ) : (
                <div className="flex flex-col gap-3">
                  {mcpGrants.map((grant) => (
                    <div
                      key={grant.id}
                      className="p-3.5 rounded-2xl bg-pp-surface-container-low/60 border border-pp-outline-variant/20 flex flex-wrap items-center justify-between gap-2"
                    >
                      <div className="flex flex-col gap-1">
                        <span className="font-semibold text-sm text-pp-on-surface font-mono">{grant.clientId}</span>
                        <span className="text-xs text-pp-on-surface-variant">
                          {t('mcpConnectionGrantedLabel', { createdAt: grant.createdAt })}
                        </span>
                        <span className="text-xs text-pp-outline">
                          {grant.revokedAt
                            ? grant.revokedDueToTokenReuse
                              ? t('mcpConnectionRevokedDueToTokenReuseLabel')
                              : t('mcpConnectionRevokedLabel')
                            : grant.isActive
                              ? grant.lastUsedAt
                                ? t('mcpConnectionLastUsedLabel', { lastUsedAt: grant.lastUsedAt })
                                : t('mcpConnectionNeverUsedLabel')
                              : t('mcpConnectionPendingLabel')}
                        </span>
                      </div>
                      {!grant.revokedAt ? (
                        <RevokeMcpConnectionButton orgId={orgId} projectId={projectId} grantId={grant.id} />
                      ) : (
                        <PpPill accent="error">{t('mcpConnectionRevokedLabel')}</PpPill>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </PpCard>
        </div>

        {/* Right Column: Existing API Keys */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          <PpCard
            title={t('existingKeysHeading')}
            subtitle={`${t('kpiActiveKeys')}: ${activeKeysCount}`}
            icon={Key}
            iconAccent="primary"
            action={<PpPill accent="mint">{activeKeysCount} Active</PpPill>}
          >
            {apiKeys.length === 0 ? (
              <PpEmptyState
                icon={Key}
                title={t('noKeys')}
                description={t('noKeysDesc')}
              />
            ) : (
              <div className="flex flex-col gap-3">
                {apiKeys.map((apiKey) => {
                  const environmentName = environmentNameById.get(apiKey.environmentId);
                  const isRevoked = Boolean(apiKey.revokedAt);
                  return (
                    <div
                      key={apiKey.id}
                      className={`p-4 rounded-2xl border transition-all flex flex-col gap-3 ${
                        isRevoked
                          ? 'bg-pp-surface-container-low/30 border-pp-outline-variant/15 opacity-60'
                          : 'bg-pp-surface-container-low/60 border-pp-outline-variant/20 hover:border-pp-outline-variant/40'
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex flex-col gap-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-pp-body-md text-pp-on-surface">{apiKey.name}</span>
                            <code className="font-mono text-xs text-pp-primary bg-pp-primary-fixed/40 px-2 py-0.5 rounded-lg font-bold">
                              {apiKey.keyPrefix}
                            </code>
                            {environmentName ? (
                              <PpPill accent="neutral">
                                {tEnv(environmentName)}
                              </PpPill>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {apiKey.scopes.map((scope) => (
                              <PpPill key={scope} accent="primary">
                                {scope}
                              </PpPill>
                            ))}
                          </div>
                          <div className="text-xs text-pp-outline mt-0.5">
                            {apiKey.revokedAt ? (
                              <span className="text-pp-error font-medium">{t('revokedLabel')}</span>
                            ) : apiKey.lastUsedAt ? (
                              t('lastUsedLabel', { lastUsedAt: apiKey.lastUsedAt })
                            ) : (
                              t('neverUsedLabel')
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <EditApiKeyNameForm
                            orgId={orgId}
                            projectId={projectId}
                            apiKeyId={apiKey.id}
                            initialName={apiKey.name}
                          />
                          {!apiKey.revokedAt ? (
                            <RevokeApiKeyButton orgId={orgId} projectId={projectId} apiKeyId={apiKey.id} />
                          ) : (
                            <PpPill accent="error">{t('revokedLabel')}</PpPill>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </PpCard>
        </div>
      </div>
    </PpPage>
  );
}
