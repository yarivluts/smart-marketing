import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
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

  const [entries, chain] = await Promise.all([listAuditLogEntriesForOrg(orgId), verifyAuditLogChainForOrg(orgId)]);
  const views = entries.map(toAuditLogEntryView);

  const t = await getTranslations('AuditLog');

  return (
    <main className="container mx-auto flex max-w-3xl flex-col gap-8 py-16">
      <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>

      <p className={chain.valid ? 'text-sm text-muted-foreground' : 'text-sm font-medium text-destructive'}>
        {chain.valid ? t('chainValid', { count: chain.entryCount }) : t('chainInvalid', { entryId: chain.brokenAtEntryId ?? '' })}
      </p>

      {views.length === 0 ? (
        <p className="text-muted-foreground">{t('noEntries')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {views.map((entry) => (
            <li key={entry.id} className="flex flex-col gap-1 rounded-md border border-input px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{entry.summary}</span>
                <span className="text-xs text-muted-foreground">{entry.createdAt}</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {t('actorLine', { actorType: entry.actorType, actorId: entry.actorId, action: entry.action })}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">{t('listCapNote', { count: views.length })}</p>
    </main>
  );
}
