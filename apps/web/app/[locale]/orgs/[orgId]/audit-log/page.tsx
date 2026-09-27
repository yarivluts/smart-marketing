import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { Activity, CalendarDays, History, ShieldAlert, ShieldCheck, Users } from 'lucide-react';
import { OrgShell } from '@/components/orgs/org-shell';
import { StatCard } from '@/components/ui/stat-card';
import { BarList } from '@/components/viz/bar-list';
import { ChartCard } from '@/components/viz/chart-card';
import { DonutChart } from '@/components/viz/donut-chart';
import { EmptyState } from '@/components/viz/empty-state';
import { InitialsAvatar } from '@/components/viz/initials-avatar';
import { PageHero } from '@/components/viz/page-hero';
import { Timeline } from '@/components/viz/timeline';
import { TrendChart } from '@/components/viz/trend-chart';
import { AUDIT_CATEGORY_ICONS, AUDIT_CATEGORY_TONES } from '@/components/orgs/audit-action-style';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { DEFAULT_AUDIT_LOG_LIST_LIMIT } from '@growthos/firebase-orm-models';
import { splitOverFetchedFeed } from '@/lib/orgs/capped-list-view';
import { listAuditLogEntriesForOrg, listOrgMembers, verifyAuditLogChainForOrg } from '@/lib/orgs/queries';
import { toAuditLogEntryView } from '@/lib/orgs/audit-log-view';
import { AUDIT_ACTION_CATEGORIES, auditActionCategory, auditActionDomain, dailyTotals, groupByDay, shortDayLabel, topCounts } from '@/lib/orgs/workspace-view';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'AuditLog' });
  return { title: t('metaTitle') };
}

const ACTIVITY_DAYS = 30;

/**
 * An org's audit log (KAN-44, plan `13 §E6.2`: "every config/key/role/schema
 * change ... tamper-evident; visible in admin UI (basic list)") — gated on
 * `audit.read`, the same "Org admin console" surface plan `06 §1` frames it
 * as. There is no write UI here: every entry is recorded internally by the
 * service that performed the audited action. Shown as a day-grouped timeline
 * with who did what, plus activity per day, by kind and by actor - all counted
 * from the entries loaded below.
 */
export default async function AuditLogPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Faudit-log`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'audit.read', { orgId })) {
    notFound();
  }

  const [entries, chain, members] = await Promise.all([
    listAuditLogEntriesForOrg(orgId, DEFAULT_AUDIT_LOG_LIST_LIMIT + 1),
    verifyAuditLogChainForOrg(orgId),
    listOrgMembers(orgId),
  ]);
  // Over-fetched by one so truncation is measured, not inferred from length.
  // An audit log that silently shows a window while reading as the whole log is
  // the worst place for this defect: it is the surface people consult precisely
  // to establish that something did or did not happen.
  const auditPage = splitOverFetchedFeed(entries, DEFAULT_AUDIT_LOG_LIST_LIMIT);
  const views = auditPage.rows.map(toAuditLogEntryView);

  const t = await getTranslations('AuditLog');
  const numberFormat = new Intl.NumberFormat(locale);
  const timeFormat = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' });
  const dayFormat = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

  // Who an actor id is: a member's name/email when it is a person in this org, else the raw id.
  const memberByUserId = new Map(members.map((member) => [member.userId, member]));
  const actorName = (actorType: string, actorId: string): string => {
    const member = actorType === 'user' ? memberByUserId.get(actorId) : undefined;
    return member ? member.displayName || member.email : actorId;
  };

  const now = Date.now();
  const perDay = dailyTotals(views, (entry) => entry.createdAt, () => 1, ACTIVITY_DAYS, now);
  const busiest = perDay.reduce((best, bucket) => (bucket.value > best.value ? bucket : best), { day: '', value: 0 });
  const actorCounts = topCounts(views.map((entry) => `${entry.actorType}:${entry.actorId}`));
  const categoryCounts = topCounts(views.map((entry) => auditActionCategory(entry.action)));
  const domainCounts = topCounts(views.map((entry) => auditActionDomain(entry.action)), 8);
  const groups = groupByDay(views);

  return (
    <OrgShell locale={locale} orgId={orgId}>
      <main className="container mx-auto flex max-w-6xl flex-col gap-6 py-10">
        <PageHero icon={History} eyebrow={t('eyebrow')} title={t('title')} description={t('heroDescription')}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              title={t('kpiIntegrity')}
              value={chain.valid ? t('kpiIntegrityOk') : t('kpiIntegrityBroken')}
              icon={chain.valid ? ShieldCheck : ShieldAlert}
              subtext={t('kpiIntegritySubtext', { count: chain.entryCount })}
            />
            <StatCard title={t('kpiEntries')} value={numberFormat.format(views.length)} icon={History} subtext={auditPage.truncated ? t('kpiEntriesTruncated') : undefined} />
            <StatCard title={t('kpiActors')} value={numberFormat.format(actorCounts.length)} icon={Users} />
            <StatCard
              title={t('kpiBusiestDay')}
              value={busiest.value > 0 ? numberFormat.format(busiest.value) : '-'}
              icon={CalendarDays}
              subtext={busiest.value > 0 ? t('kpiBusiestDaySubtext', { day: shortDayLabel(busiest.day) }) : t('kpiBusiestDayNone', { days: ACTIVITY_DAYS })}
            />
          </div>
        </PageHero>

        <p
          className={
            chain.valid
              ? 'flex items-center gap-2 rounded-xl border border-success/30 bg-success/5 px-4 py-3 text-sm text-muted-foreground'
              : 'flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm font-medium text-destructive'
          }
        >
          {chain.valid ? <ShieldCheck className="h-4 w-4 shrink-0 text-success" aria-hidden="true" /> : <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />}
          {chain.valid ? t('chainValid', { count: chain.entryCount }) : t('chainInvalid', { entryId: chain.brokenAtEntryId ?? '' })}
        </p>

        {views.length === 0 ? (
          <EmptyState icon={History} title={t('noEntries')} description={t('noEntriesHint')} />
        ) : (
          <>
            <div className="grid gap-6 lg:grid-cols-3">
              <ChartCard className="lg:col-span-2" title={t('perDayTitle')} description={t('perDayDescription', { days: ACTIVITY_DAYS })} icon={Activity}>
                <TrendChart
                  label={t('perDayTitle')}
                  data={perDay.map((bucket) => ({ day: shortDayLabel(bucket.day), changes: bucket.value }))}
                  xKey="day"
                  series={[{ key: 'changes', label: t('perDaySeries') }]}
                  kind="bar"
                  height={220}
                />
              </ChartCard>
              <ChartCard title={t('byKindTitle')} description={t('byKindDescription')} icon={ShieldCheck}>
                <DonutChart
                  label={t('byKindTitle')}
                  centerValue={numberFormat.format(views.length)}
                  centerLabel={t('byKindCenter')}
                  data={AUDIT_ACTION_CATEGORIES.filter((category) => categoryCounts.some((entry) => entry.key === category)).map((category) => ({
                    label: t(`category_${category}`),
                    value: categoryCounts.find((entry) => entry.key === category)?.count ?? 0,
                    color: CATEGORY_COLORS[category],
                  }))}
                  size={150}
                  layout="stacked"
                />
              </ChartCard>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <ChartCard className="lg:col-span-2 lg:row-span-2" title={t('timelineTitle')} description={t('timelineDescription')} icon={History}>
                <Timeline
                  label={t('timelineTitle')}
                  groups={groups.map((group) => ({
                    key: group.day,
                    label: Number.isNaN(Date.parse(group.day)) ? group.day : dayFormat.format(new Date(`${group.day}T00:00:00.000Z`)),
                    sublabel: t('dayCount', { count: group.entries.length }),
                    items: group.entries.map((entry) => {
                      const category = auditActionCategory(entry.action);
                      const name = actorName(entry.actorType, entry.actorId);
                      return {
                        key: entry.id,
                        icon: AUDIT_CATEGORY_ICONS[category],
                        tone: AUDIT_CATEGORY_TONES[category],
                        leading: <InitialsAvatar name={name} seed={entry.actorId} size="sm" className="mt-0.5" />,
                        // `entry.summary` is raw, untranslated English generated by the recording service (e.g. `Created board "My Board"`)
                        // — un-isolated in an RTL page, the bidi algorithm treats its quote marks as weak/neutral and can reorder them
                        // to the wrong side (found via session-B dogfooding QA, 2026-08-17: a leading quote appeared before "Created"
                        // with the closing one missing). `dir="ltr"` isolates the run so it renders in its own natural order.
                        title: (
                          <span className="font-medium" dir="ltr" data-testid="audit-entry-summary">
                            {entry.summary}
                          </span>
                        ),
                        meta: (
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="text-foreground/80">{name}</span>
                            <span aria-hidden="true">·</span>
                            <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px]" dir="ltr">
                              {t('actorLine', { actorType: entry.actorType, actorId: entry.actorId, action: entry.action })}
                            </span>
                          </span>
                        ),
                        time: Number.isNaN(Date.parse(entry.createdAt)) ? entry.createdAt : timeFormat.format(new Date(entry.createdAt)),
                      };
                    }),
                  }))}
                />
                <p className="mt-4 text-xs text-muted-foreground">
                  {auditPage.truncated ? t('listCapNoteTruncated', { count: views.length }) : t('listCapNote', { count: views.length })}
                </p>
              </ChartCard>
              <ChartCard title={t('byActorTitle')} description={t('byActorDescription')} icon={Users}>
                <ul className="flex flex-col gap-2">
                  {actorCounts.slice(0, 8).map((entry) => {
                    const separator = entry.key.indexOf(':');
                    const actorType = entry.key.slice(0, separator);
                    const actorId = entry.key.slice(separator + 1);
                    const name = actorName(actorType, actorId);
                    const share = Math.round((entry.count / views.length) * 100);
                    return (
                      <li key={entry.key} className="flex items-center gap-3">
                        <InitialsAvatar name={name} seed={actorId} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2 text-sm">
                            <span className="truncate text-foreground" dir="auto">{name}</span>
                            <span className="shrink-0 tabular-nums text-muted-foreground" dir="ltr">
                              {numberFormat.format(entry.count)}
                            </span>
                          </div>
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${share}%` }} />
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </ChartCard>
              <ChartCard title={t('byObjectTitle')} description={t('byObjectDescription')} icon={Activity}>
                <BarList
                  items={domainCounts.map((entry) => ({ key: entry.key, label: entry.key, value: entry.count }))}
                  valueFormatter={(value) => numberFormat.format(value)}
                />
              </ChartCard>
            </div>
          </>
        )}
      </main>
    </OrgShell>
  );
}

const CATEGORY_COLORS: Record<(typeof AUDIT_ACTION_CATEGORIES)[number], string> = {
  create: 'hsl(var(--success))',
  update: 'hsl(var(--info))',
  delete: 'hsl(var(--destructive))',
  access: 'hsl(var(--warning))',
  data: 'hsl(var(--primary))',
  run: 'hsl(268 75% 62%)',
  other: 'hsl(var(--muted-foreground))',
};
