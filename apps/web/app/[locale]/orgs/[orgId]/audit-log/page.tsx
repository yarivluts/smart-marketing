import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { ShieldCheck, ShieldAlert } from 'lucide-react';
import { OrgShell } from '@/components/orgs/org-shell';
import {
  PpPage,
  PpPageHeader,
  PpCard,
  PpKpiGrid,
  PpKpiCard,
  PpTable,
  PpEmptyState,
  PpIconChip,
  PpPill,
} from '@/components/pastel/primitives';
import { cn } from '@/lib/utils';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { listAuditLogEntriesForOrg, verifyAuditLogChainForOrg } from '@/lib/orgs/queries';
import { toAuditLogEntryView } from '@/lib/orgs/audit-log-view';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'AuditLog' });
  return { title: t('metaTitle') };
}

/**
 * An org's audit log (KAN-44, plan `13 §E6.2`: "every config/key/role/schema
 * change ... tamper-evident; visible in admin UI (basic list)") — gated on
 * `audit.read`, the same "Org admin console" surface plan `06 §1` frames it
 * as. There is no write UI here: every entry is recorded internally by the
 * service that performed the audited action.
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

  const [entries, chain] = await Promise.all([
    listAuditLogEntriesForOrg(orgId),
    verifyAuditLogChainForOrg(orgId),
  ]);
  const views = entries.map(toAuditLogEntryView);

  const t = await getTranslations('AuditLog');

  return (
    <OrgShell locale={locale} orgId={orgId}>
      <PpPage>
        <PpPageHeader
          eyebrow={t('eyebrow')}
          title={t('title')}
          description={t('description')}
        />

        {/* Cryptographic Hash-Chain Integrity Banner */}
        <div
          className={cn(
            'flex flex-col justify-between gap-4 rounded-2xl p-5 shadow-pp-candy transition-all duration-200 md:flex-row md:items-center',
            chain.valid
              ? 'border-s-4 border-s-pp-secondary-fixed-dim bg-pp-secondary-container/20'
              : 'border-s-4 border-s-pp-error bg-pp-error-container/20',
          )}
        >
          <div className="flex items-center gap-4">
            <PpIconChip
              icon={chain.valid ? ShieldCheck : ShieldAlert}
              accent={chain.valid ? 'mint' : 'error'}
              size="lg"
            />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-pp-display text-pp-headline-md font-bold text-pp-on-surface">
                  {chain.valid ? t('bannerVerifiedTitle') : t('bannerCompromisedTitle')}
                </h3>
                <span
                  className={cn(
                    'h-2.5 w-2.5 rounded-full',
                    chain.valid ? 'bg-pp-secondary animate-pulse' : 'bg-pp-error',
                  )}
                />
              </div>
              <p
                className={cn(
                  'mt-0.5 text-pp-body-md',
                  chain.valid
                    ? 'font-medium text-pp-on-secondary-container'
                    : 'font-medium text-pp-error',
                )}
              >
                {chain.valid
                  ? t('chainValid', { count: chain.entryCount })
                  : t('chainInvalid', { entryId: chain.brokenAtEntryId ?? '' })}
              </p>
            </div>
          </div>
          {chain.valid ? (
            <div className="flex items-center gap-2 self-start md:self-auto">
              <PpPill accent="mint" dot>
                {t('zeroModAllowed')}
              </PpPill>
            </div>
          ) : null}
        </div>

        {/* Security Posture KPI Cards */}
        <PpKpiGrid className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-2">
          <PpKpiCard
            label={t('kpiLedgerStatus')}
            value={chain.valid ? t('kpiValidValue') : t('kpiCompromisedValue')}
            accent={chain.valid ? 'mint' : 'error'}
            badge={chain.valid ? 'SHA-256' : 'BROKEN'}
            badgeAccent={chain.valid ? 'mint' : 'error'}
          />
          <PpKpiCard
            label={t('kpiTotalEvents')}
            value={chain.entryCount}
            accent="primary"
            badge={`${views.length} loaded`}
            badgeAccent="primary"
          />
        </PpKpiGrid>

        {/* Audit Log Ledger Table */}
        <PpCard
          title={t('title')}
          subtitle={t('listCapNote', { count: views.length })}
          flush
        >
          {views.length === 0 ? (
            <div className="p-pp-lg">
              <PpEmptyState icon={ShieldCheck} title={t('noEntries')} />
            </div>
          ) : (
            <PpTable>
              <thead>
                <tr>
                  <th>{t('thTimestampActor')}</th>
                  <th>{t('thActionSummary')}</th>
                  <th className="text-end">{t('thVerification')}</th>
                </tr>
              </thead>
              <tbody>
                {views.map((entry) => (
                  <tr key={entry.id}>
                    <td className="whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="text-pp-body-sm font-semibold text-pp-on-surface">
                          {entry.createdAt}
                        </span>
                        <span className="font-mono text-pp-label-sm text-pp-outline" dir="ltr">
                          {entry.actorType}: {entry.actorId}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="flex flex-col gap-0.5">
                        {/* entry.summary is raw untranslated English: dir="ltr" isolates for RTL */}
                        <span className="font-medium text-pp-on-surface" dir="ltr">
                          {entry.summary}
                        </span>
                        <span className="text-pp-label-sm text-pp-outline" dir="ltr">
                          {t('actorLine', {
                            actorType: entry.actorType,
                            actorId: entry.actorId,
                            action: entry.action,
                          })}
                        </span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap text-end">
                      <PpPill accent="mint" dot>
                        {t('verifiedPill')}
                      </PpPill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </PpTable>
          )}
        </PpCard>
      </PpPage>
    </OrgShell>
  );
}
