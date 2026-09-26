import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { Link } from '@/i18n/navigation';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { listEnvironmentsForProject, listHookDeliveriesForProject, listHookEndpointsForProject, listOrgProjects } from '@/lib/orgs/queries';
import { hookApiUrl } from '@/lib/orgs/hook-api-url';
import { hookDeliveryStatusLabelKey, hookSignatureModeLabelKey } from '@/lib/orgs/hook-view';
import { dailyDeliveriesByStatus, deliveryStatusCounts, endpointDeliveryStats } from '@/lib/orgs/hook-viz';
import { formatRelativeTime } from '@/lib/orgs/recency';
import { CreateHookEndpointForm } from '@/components/orgs/create-hook-endpoint-form';
import { DisableHookEndpointButton } from '@/components/orgs/disable-hook-endpoint-button';
import { EnableHookEndpointButton } from '@/components/orgs/enable-hook-endpoint-button';
import { EditHookEndpointForm } from '@/components/orgs/edit-hook-endpoint-form';
import { SetHookSigningSecretForm } from '@/components/orgs/set-hook-signing-secret-form';
import { HookReceiveUrl } from '@/components/orgs/hook-receive-url';
import { HookDeliveryStatusButtons } from '@/components/orgs/hook-delivery-status-buttons';
import { EnvironmentPill } from '@/components/orgs/environment-pill';
import { StatCard } from '@/components/ui/stat-card';
import { ChartCard, DonutChart, EmptyState, PageHero, Sparkline, TrendChart } from '@/components/viz';
import { cn } from '@/lib/utils';
import { CheckCircle2, Clock, DatabaseZap, Inbox, Lock, LockOpen, Plus, Trash2, Webhook } from 'lucide-react';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Hooks' });
  return { title: t('metaTitle') };
}

const TREND_DAYS = 14;

const DELIVERY_STYLE = {
  pending: { icon: Clock, tone: 'bg-warning/10 text-warning border-warning/30' },
  reviewed: { icon: CheckCircle2, tone: 'bg-success/10 text-success border-success/30' },
  discarded: { icon: Trash2, tone: 'bg-muted text-muted-foreground border-border' },
} as const;

/**
 * A project's inbound webhook receivers + review queue (KAN-53, E9.1):
 * create a per-environment hook endpoint (optionally HMAC-signed), see its
 * always-redisplayable receive URL, and browse every raw payload that has
 * landed — "unknown payloads visible in queue, nothing lost" per the AC.
 * Gated on `ingest.write`, the same permission the sibling ingest-health/
 * keys admin surfaces already reuse for inbound-data management.
 *
 * Deliveries are charted per day by status and per endpoint (count, waiting, last received and a
 * 14-day sparkline); the queue shows each delivery's status as an icon, all from the same list.
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
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'ingest.write', { orgId, projectId })) {
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

  const now = Date.now();
  const numberFormat = new Intl.NumberFormat(locale);
  const counts = deliveryStatusCounts(hookDeliveries);
  const perEndpoint = endpointDeliveryStats(hookDeliveries, now, TREND_DAYS);
  const endpointNameById = new Map(hookEndpoints.map((endpoint) => [endpoint.id, endpoint.name]));
  const activeEndpoints = hookEndpoints.filter((endpoint) => !endpoint.disabled_at).length;
  const dayLabel = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const daily = dailyDeliveriesByStatus(hookDeliveries, now, TREND_DAYS).map((row) => ({ ...row, date: dayLabel.format(new Date(`${row.date}T00:00:00.000Z`)) }));
  const recentTotal = daily.reduce((sum, row) => sum + row.pending + row.reviewed + row.discarded, 0);

  return (
    <main className="container mx-auto flex max-w-6xl flex-col gap-6 py-10">
      <PageHero icon={Webhook} eyebrow={t('eyebrow')} title={t('title', { projectName: project.name })} description={t('heroDescription')}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard title={t('kpiEndpoints')} value={t('kpiOfTotal', { value: activeEndpoints, total: hookEndpoints.length })} icon={Webhook} />
          <StatCard title={t('kpiDeliveries')} value={numberFormat.format(hookDeliveries.length)} subtext={t('kpiDeliveriesSub', { count: recentTotal })} icon={Inbox} />
          <StatCard
            title={t('kpiPending')}
            value={numberFormat.format(counts.pending)}
            subtext={t('kpiPendingSub')}
            icon={Clock}
          />
          <StatCard title={t('kpiApplied')} value={numberFormat.format(counts.applied)} subtext={t('kpiAppliedSub')} icon={DatabaseZap} />
        </div>
      </PageHero>

      {hookDeliveries.length > 0 ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <ChartCard title={t('trendTitle')} description={t('trendDescription', { days: TREND_DAYS })} icon={Inbox} className="lg:col-span-2" fill>
            {recentTotal > 0 ? (
              <TrendChart
                label={t('trendTitle')}
                xKey="date"
                data={daily}
                series={[
                  { key: 'pending', label: t('deliveryStatusPending'), color: 'hsl(var(--warning))' },
                  { key: 'reviewed', label: t('deliveryStatusReviewed'), color: 'hsl(var(--success))' },
                  { key: 'discarded', label: t('deliveryStatusDiscarded'), color: 'hsl(var(--muted-foreground))' },
                ]}
                kind="bar"
                stacked
                height={240}
              />
            ) : (
              <EmptyState compact icon={Inbox} title={t('trendEmpty', { days: TREND_DAYS })} />
            )}
          </ChartCard>
          <ChartCard title={t('statusTitle')} description={t('statusDescription')} icon={CheckCircle2} fill>
            <DonutChart
              label={t('statusTitle')}
              centerValue={numberFormat.format(hookDeliveries.length)}
              centerLabel={t('statusCenter')}
              data={[
                { label: t('deliveryStatusPending'), value: counts.pending, color: 'hsl(var(--warning))' },
                { label: t('deliveryStatusReviewed'), value: counts.reviewed, color: 'hsl(var(--success))' },
                { label: t('deliveryStatusDiscarded'), value: counts.discarded, color: 'hsl(var(--muted-foreground))' },
              ]}
              size={150}
              layout="stacked"
            />
          </ChartCard>
        </div>
      ) : null}

      <ChartCard title={t('existingEndpointsHeading')} description={t('endpointsDescription')} icon={Webhook}>
        {hookEndpoints.length === 0 ? (
          <EmptyState compact icon={Webhook} title={t('noEndpoints')} description={t('noEndpointsDetail')} />
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {hookEndpoints.map((endpoint) => {
              const environmentName = environmentNameById.get(endpoint.environment_id);
              const stats = perEndpoint.get(endpoint.id);
              const signed = endpoint.signature_mode === 'hmac_sha256';
              return (
                <li
                  key={endpoint.id}
                  className={cn('flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 text-sm shadow-sm', endpoint.disabled_at && 'bg-muted/30')}
                  data-testid={`hook-endpoint-${endpoint.id}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-3">
                      <span
                        className={cn(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                          endpoint.disabled_at ? 'bg-muted text-muted-foreground' : signed ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning',
                        )}
                        aria-hidden="true"
                      >
                        {signed ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
                      </span>
                      <div className="flex min-w-0 flex-col gap-1">
                        <span className="font-semibold">
                          {endpoint.name}
                          {environmentName ? ` (${tEnv(environmentName)})` : ''}
                        </span>
                        <span
                          className={cn(
                            'w-fit text-xs',
                            endpoint.disabled_at ? 'rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground' : 'text-muted-foreground',
                          )}
                        >
                          {endpoint.disabled_at ? t('disabledLabel') : t(hookSignatureModeLabelKey(endpoint.signature_mode))}
                        </span>
                      </div>
                    </div>
                    {!endpoint.disabled_at ? (
                      <DisableHookEndpointButton orgId={orgId} projectId={projectId} hookEndpointId={endpoint.id} />
                    ) : (
                      <EnableHookEndpointButton orgId={orgId} projectId={projectId} hookEndpointId={endpoint.id} />
                    )}
                  </div>

                  <div className="grid grid-cols-[auto_auto_1fr] items-end gap-4 rounded-xl border border-border/70 bg-muted/30 px-3 py-2">
                    <div className="flex flex-col">
                      <span className="text-lg font-bold tabular-nums text-foreground" dir="ltr">
                        {numberFormat.format(stats?.total ?? 0)}
                      </span>
                      <span className="text-[11px] text-muted-foreground">{t('endpointReceived')}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className={cn('text-lg font-bold tabular-nums', (stats?.pending ?? 0) > 0 ? 'text-warning' : 'text-foreground')} dir="ltr">
                        {numberFormat.format(stats?.pending ?? 0)}
                      </span>
                      <span className="text-[11px] text-muted-foreground">{t('endpointWaiting')}</span>
                    </div>
                    <div className="flex min-w-0 flex-col items-end">
                      {stats ? <Sparkline values={stats.daily} className="h-8 w-32" label={t('endpointSparklineLabel', { days: TREND_DAYS })} /> : null}
                      <span className="text-[11px] text-muted-foreground" title={stats?.lastReceivedAt ?? undefined}>
                        {stats?.lastReceivedAt ? t('endpointLastReceived', { relative: formatRelativeTime(stats.lastReceivedAt, now, locale) }) : t('endpointNothingYet')}
                      </span>
                    </div>
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
                    <>
                      <SetHookSigningSecretForm
                        orgId={orgId}
                        projectId={projectId}
                        hookEndpointId={endpoint.id}
                        hasSigningSecret={Boolean(endpoint.signing_secret_encrypted)}
                      />
                      {endpoint.previous_signing_secret_expires_at && endpoint.previous_signing_secret_expires_at > new Date().toISOString() ? (
                        <p className="text-xs text-muted-foreground">
                          {t('previousSecretGraceNotice', { expiresAt: endpoint.previous_signing_secret_expires_at })}
                        </p>
                      ) : null}
                    </>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </ChartCard>

      <ChartCard title={t('createEndpointHeading')} description={t('createEndpointDescription')} icon={Plus}>
        {environmentOptions.length === 0 ? (
          <EmptyState compact icon={Plus} title={t('noEnvironments')} />
        ) : (
          <CreateHookEndpointForm orgId={orgId} projectId={projectId} environments={environmentOptions} />
        )}
      </ChartCard>

      <ChartCard title={t('queueHeading')} icon={Inbox}>
        <div className="flex flex-col gap-3">
          {/*
            What "pending" actually means, which the queue never said.

            receiveHookPayload stores the delivery and returns; it does not touch the schema
            registry and does not create records - a hook delivery never reaches ingest on its
            own. It becomes data only when applyFieldMappingToDelivery runs, and the only way to
            run that is the admin field-mappings surface, one delivery at a time.

            So the two buttons the queue offered - Reviewed and Discard - both leave the payload
            un-ingested, and a user could walk the entire queue marking deliveries reviewed and
            end up with zero records, having been told "202" on every POST. Stating it, and
            linking to the action that does ingest, is the difference between a review queue and
            a dead end.
          */}
          <p className="rounded-xl border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-muted-foreground">
            {t('queueNotIngestedNote')}{' '}
            <Link className="font-medium text-primary underline" href={`/orgs/${orgId}/projects/${projectId}/field-mappings`}>
              {t('queueFieldMappingsLink')}
            </Link>
          </p>
          {hookDeliveries.length === 0 ? (
            <EmptyState compact icon={Inbox} title={t('noDeliveries')} />
          ) : (
            <ul className="flex flex-col gap-2">
              {hookDeliveries.map((delivery) => {
                const style = DELIVERY_STYLE[delivery.status];
                const Icon = delivery.applied_at ? DatabaseZap : style.icon;
                const endpointName = endpointNameById.get(delivery.hook_endpoint_id);
                const environmentName = environmentNameById.get(delivery.environment_id);
                return (
                  <li key={delivery.id} className="flex gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-sm" data-status={delivery.status}>
                    <span className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border', delivery.applied_at ? 'border-primary/30 bg-primary/10 text-primary' : style.tone)} aria-hidden="true">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="flex min-w-0 flex-col gap-1">
                          <span className="font-medium">
                            {t('deliverySummary', {
                              receivedAt: delivery.received_at,
                              status: t(hookDeliveryStatusLabelKey(delivery.status)),
                            })}
                          </span>
                          {endpointName ? (
                            <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                              <Webhook className="h-3 w-3" aria-hidden="true" />
                              <span>{endpointName}</span>
                              {environmentName ? <EnvironmentPill name={environmentName} label={tEnv(environmentName)} /> : null}
                              <span title={delivery.received_at}>{formatRelativeTime(delivery.received_at, now, locale)}</span>
                            </span>
                          ) : null}
                        </div>
                        {delivery.status === 'pending' ? <HookDeliveryStatusButtons orgId={orgId} projectId={projectId} hookDeliveryId={delivery.id} /> : null}
                      </div>
                      {delivery.applied_at ? (
                        <p className="text-xs font-medium text-primary">{t('appliedViaMapping', { batchId: delivery.applied_batch_id ?? '' })}</p>
                      ) : null}
                      <pre className="max-h-40 overflow-auto rounded-lg bg-muted/50 p-2 text-xs" dir="ltr">
                        {delivery.raw_payload}
                      </pre>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </ChartCard>
    </main>
  );
}
