import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import {
  listApiKeysForProject,
  listEnvironmentsForProject,
  listMcpOAuthGrantsForProject,
  listOrgMembers,
  listOrgProjects,
} from '@/lib/orgs/queries';
import { ingestApiUrl } from '@/lib/orgs/ingest-api-url';
import { CREATE_API_KEY_ANCHOR, parseCreateApiKeyPreset } from '@/lib/orgs/create-api-key-link';
import { mcpApiUrl } from '@/lib/orgs/mcp-api-url';
import { apiKeyUsageStatus, sortApiKeys, summarizeApiKeys, type ApiKeyUsageStatus } from '@/lib/orgs/api-key-viz';
import { formatRelativeTime } from '@/lib/orgs/recency';
import { CreateApiKeyForm } from '@/components/orgs/create-api-key-form';
import { EditApiKeyNameForm } from '@/components/orgs/edit-api-key-name-form';
import { EditAllowedOriginsForm } from '@/components/orgs/edit-allowed-origins-form';
import { RevokeApiKeyButton } from '@/components/orgs/revoke-api-key-button';
import { RevokeMcpConnectionButton } from '@/components/orgs/revoke-mcp-connection-button';
import { EnvironmentPill } from '@/components/orgs/environment-pill';
import { StatCard } from '@/components/ui/stat-card';
import { BarList, ChartCard, DonutChart, EmptyState, PageHero } from '@/components/viz';
import { cn } from '@/lib/utils';
import { Activity, Ban, Bot, Clock, KeyRound, Layers3, Plug, ShieldCheck, Sparkles } from 'lucide-react';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'ApiKeys' });
  return { title: t('metaTitle') };
}

const STATUS_STYLE: Record<ApiKeyUsageStatus, { tile: string; dot: string }> = {
  recent: { tile: 'bg-success/10 text-success', dot: 'bg-success' },
  idle: { tile: 'bg-warning/10 text-warning', dot: 'bg-warning' },
  unused: { tile: 'bg-muted text-muted-foreground', dot: 'border border-dashed border-muted-foreground bg-transparent' },
  revoked: { tile: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground/40' },
};

/**
 * A project's API keys (KAN-30): mint scoped to one environment with a
 * least-privilege scope selection, see every key ever minted (active or
 * revoked) with its display-safe prefix and last-used time, and revoke one
 * immediately. This whole page — unlike KAN-27's resource library, which
 * lets any active member browse — is gated on `keys.manage`, matching the
 * story's own "Admin UI" framing: a key's scope list and usage metadata are
 * sensitive enough that only roles trusted to manage keys should see them
 * at all, not just mutate them.
 *
 * Keys render as cards (environment, scopes, how recently used) with active keys first, above a
 * usage breakdown, scope usage and per-environment coverage - all counted from the same key list.
 */
export default async function ProjectApiKeysPage({ params, searchParams }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  // `?kind=publishable&environmentId=...` (e.g. from the Installation page) presets the create form.
  const preset = parseCreateApiKeyPreset((await searchParams) ?? {});
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Fkeys`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'keys.manage', { orgId, projectId })) {
    notFound();
  }

  const projects = await listOrgProjects(orgId);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    notFound();
  }

  const [environments, apiKeys, mcpGrants, members] = await Promise.all([
    listEnvironmentsForProject(orgId, projectId),
    listApiKeysForProject(orgId, projectId),
    listMcpOAuthGrantsForProject(orgId, projectId),
    listOrgMembers(orgId),
  ]);

  const t = await getTranslations('ApiKeys');
  const tEnv = await getTranslations('EnvBadge');
  // Client components can only receive plain serializable data across the
  // RSC boundary, never `@arbel/firebase-orm` model instances (their
  // internal ORM/connection state isn't serializable) — same reasoning as
  // `ProjectSwitcher` staying a server component instead of forwarding
  // `ProjectModel[]` to client code.
  const environmentOptions = environments.map((environment) => ({ id: environment.id, name: environment.name }));
  const environmentNameById = new Map(environmentOptions.map((environment) => [environment.id, environment.name]));

  /*
    Who minted each key, and who revoked it.

    Both ids were already loaded - `createdBy` has been on `ApiKeySummary` all along and
    `revoked_by` on the model - and the page rendered neither. A revoked key said only
    "Revoked", with no date and no actor. Those are the first two questions asked when
    auditing a credential: who issued this, and who took it away.

    Resolved to a display name through the org's member list; a key minted by someone who has
    since left resolves to nothing, so it says so rather than printing a raw uid.
  */
  const actorNameById = new Map(
    members.map((member) => [member.userId, member.displayName ?? member.email] as const),
  );
  const actorName = (userId: string | undefined): string =>
    (userId ? actorNameById.get(userId) : undefined) ?? t('unknownActorLabel');

  const now = Date.now();
  const numberFormat = new Intl.NumberFormat(locale);
  const stats = summarizeApiKeys(apiKeys, now);
  const sortedKeys = sortApiKeys(apiKeys);
  const activeKeys = sortedKeys.filter((apiKey) => !apiKey.revokedAt);
  const revokedKeys = sortedKeys.filter((apiKey) => apiKey.revokedAt);
  const activeCount = activeKeys.length;
  const liveMcpGrants = mcpGrants.filter((grant) => !grant.revokedAt && grant.isActive).length;

  function keyCard(apiKey: (typeof sortedKeys)[number]): React.ReactElement {
    const environmentName = environmentNameById.get(apiKey.environmentId);
    const status = apiKeyUsageStatus(apiKey, now);
    const style = STATUS_STYLE[status];
    return (
      <li
        key={apiKey.id}
        className={cn('flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 text-sm shadow-sm', apiKey.revokedAt && 'bg-muted/30')}
        data-testid={`api-key-${apiKey.id}`}
        data-status={status}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', style.tile)} aria-hidden="true">
              {apiKey.revokedAt ? <Ban className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <span className={cn('break-words font-semibold', apiKey.revokedAt && 'text-muted-foreground')}>{apiKey.name}</span>
              <span className="flex flex-wrap items-center gap-1.5">
                <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground" dir="ltr">
                  {apiKey.keyPrefix}
                </code>
                {environmentName ? <EnvironmentPill name={environmentName} label={tEnv(environmentName)} /> : null}
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{t(`kind.${apiKey.kind}.label`)}</span>
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <EditApiKeyNameForm orgId={orgId} projectId={projectId} apiKeyId={apiKey.id} initialName={apiKey.name} />
            {!apiKey.revokedAt ? <RevokeApiKeyButton orgId={orgId} projectId={projectId} apiKeyId={apiKey.id} /> : null}
          </div>
        </div>

        {apiKey.kind === 'publishable' && !apiKey.revokedAt ? (
          <EditAllowedOriginsForm orgId={orgId} projectId={projectId} apiKeyId={apiKey.id} initialOrigins={apiKey.allowedOrigins} />
        ) : null}

        {apiKey.scopes.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {apiKey.scopes.map((scope) => (
              <span key={scope} className="rounded-full border border-border bg-background px-2 py-0.5 font-mono text-[11px] text-foreground" dir="ltr">
                {scope}
              </span>
            ))}
          </div>
        ) : null}

        <div className="flex flex-col gap-0.5 border-t border-border/60 pt-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className={cn('h-2 w-2 shrink-0 rounded-full', style.dot)} aria-hidden="true" />
            {apiKey.revokedAt ? (
              apiKey.revokedBy ? (
                t('revokedDetailLabel', { revokedAt: apiKey.revokedAt, actor: actorName(apiKey.revokedBy) })
              ) : (
                t('revokedOnLabel', { revokedAt: apiKey.revokedAt })
              )
            ) : apiKey.lastUsedAt ? (
              <span title={apiKey.lastUsedAt}>{t('lastUsedRelative', { relative: formatRelativeTime(apiKey.lastUsedAt, now, locale) })}</span>
            ) : (
              t('neverUsedLabel')
            )}
          </span>
          <span>{t('createdByLabel', { actor: actorName(apiKey.createdBy) })}</span>
        </div>
      </li>
    );
  }

  return (
    <div className="container mx-auto flex max-w-6xl flex-col gap-6 py-10">
      <PageHero icon={KeyRound} eyebrow={t('eyebrow')} title={t('title', { projectName: project.name })} description={t('heroDescription')}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard title={t('kpiActive')} value={`${numberFormat.format(activeCount)}/${numberFormat.format(stats.total)}`} icon={ShieldCheck} />
          <StatCard
            title={t('kpiRecent')}
            value={numberFormat.format(stats.byStatus.recent)}
            progress={activeCount > 0 ? Math.round((stats.byStatus.recent / activeCount) * 100) : undefined}
            icon={Activity}
          />
          <StatCard title={t('kpiUnused')} value={numberFormat.format(stats.byStatus.unused)} subtext={t('kpiUnusedSub')} icon={Clock} />
          <StatCard title={t('kpiMcp')} value={numberFormat.format(liveMcpGrants)} icon={Bot} />
        </div>
      </PageHero>

      {stats.total > 0 ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <ChartCard title={t('statusTitle')} description={t('statusDescription')} icon={Activity} fill>
            <DonutChart
              label={t('statusTitle')}
              centerValue={numberFormat.format(stats.total)}
              centerLabel={t('statusCenter')}
              data={[
                { label: t('statusRecent'), value: stats.byStatus.recent, color: 'hsl(var(--success))' },
                { label: t('statusIdle'), value: stats.byStatus.idle, color: 'hsl(var(--warning))' },
                { label: t('statusUnused'), value: stats.byStatus.unused, color: 'hsl(var(--info))' },
                { label: t('statusDeactivated'), value: stats.byStatus.revoked, color: 'hsl(var(--muted-foreground))' },
              ]}
              size={150}
              layout="stacked"
            />
          </ChartCard>
          <ChartCard title={t('scopesTitle')} description={t('scopesDescription')} icon={Layers3} fill>
            {stats.scopes.length > 0 ? (
              <BarList items={stats.scopes.map((entry) => ({ key: entry.scope, label: entry.scope, value: entry.count }))} />
            ) : (
              <EmptyState compact icon={Layers3} title={t('scopesEmpty')} />
            )}
          </ChartCard>
          <ChartCard title={t('coverageTitle')} description={t('coverageDescription')} icon={Sparkles} fill>
            <ul className="flex flex-col gap-2">
              {environmentOptions.map((environment) => {
                const count = stats.activeByEnvironment.get(environment.id) ?? 0;
                return (
                  <li key={environment.id} className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2">
                    <EnvironmentPill name={environment.name} label={tEnv(environment.name)} />
                    <span className={cn('text-sm tabular-nums', count === 0 ? 'text-muted-foreground' : 'font-semibold text-foreground')}>
                      {count === 0 ? t('coverageNone') : t('coverageCount', { count })}
                    </span>
                  </li>
                );
              })}
            </ul>
          </ChartCard>
        </div>
      ) : null}

      <ChartCard title={t('existingKeysHeading')} description={t('existingKeysDescription')} icon={KeyRound}>
        {apiKeys.length === 0 ? (
          <EmptyState compact icon={KeyRound} title={t('noKeys')} description={t('noKeysDetail')} />
        ) : (
          <div className="flex flex-col gap-5">
            {activeKeys.length > 0 ? <ul className="grid gap-3 lg:grid-cols-2">{activeKeys.map(keyCard)}</ul> : null}
            {revokedKeys.length > 0 ? (
              <div className="flex flex-col gap-3">
                <h3 className="text-sm font-medium text-muted-foreground">{t('deactivatedHeading', { count: revokedKeys.length })}</h3>
                <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{revokedKeys.map(keyCard)}</ul>
              </div>
            ) : null}
          </div>
        )}
      </ChartCard>

      <div id={CREATE_API_KEY_ANCHOR} className="scroll-mt-20">
        <ChartCard title={t('createKeyHeading')} description={t('createKeyDescription')} icon={KeyRound}>
          {environmentOptions.length === 0 ? (
            <EmptyState compact icon={KeyRound} title={t('noEnvironments')} />
          ) : (
            <CreateApiKeyForm
              orgId={orgId}
              projectId={projectId}
              environments={environmentOptions}
              ingestBaseUrl={ingestApiUrl()}
              initialKind={preset.kind}
              initialEnvironmentId={preset.environmentId}
              initialScopes={preset.scopes}
            />
          )}
        </ChartCard>
      </div>

      <ChartCard title={t('mcpConnectionsHeading')} description={t('mcpEndpointIntro')} icon={Plug}>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1 rounded-xl border border-border bg-muted/30 px-3 py-2.5">
            <p className="text-sm">
              {t('mcpEndpointLabel')}{' '}
              <code className="break-all font-mono text-xs" dir="ltr">
                {mcpApiUrl()}
              </code>
            </p>
            <p className="text-xs text-muted-foreground">{t('mcpApiKeyIntro')}</p>
          </div>
          {mcpGrants.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('noMcpConnections')}</p>
          ) : (
            <ul className="grid gap-3 lg:grid-cols-2">
              {mcpGrants.map((grant) => {
                const tone = grant.revokedAt ? (grant.revokedDueToTokenReuse ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground') : grant.isActive ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning';
                return (
                  <li key={grant.id} className="flex items-start justify-between gap-3 rounded-2xl border border-border bg-card p-4 text-sm shadow-sm">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', tone)} aria-hidden="true">
                        <Bot className="h-4 w-4" />
                      </span>
                      <div className="flex min-w-0 flex-col gap-1">
                        <span className="break-all font-medium">{grant.clientId}</span>
                        <span className="text-xs text-muted-foreground">{t('mcpConnectionGrantedLabel', { createdAt: grant.createdAt })}</span>
                        <span className={cn('text-xs', grant.revokedDueToTokenReuse ? 'text-destructive' : 'text-muted-foreground')}>
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
                    </div>
                    {!grant.revokedAt ? <RevokeMcpConnectionButton orgId={orgId} projectId={projectId} grantId={grant.id} /> : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </ChartCard>
    </div>
  );
}
