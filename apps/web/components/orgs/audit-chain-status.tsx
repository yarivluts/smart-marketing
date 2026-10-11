import { useLocale, useTranslations } from 'next-intl';
import { GitFork, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { AuditLogChainEntryRef, AuditLogChainVerification } from '@growthos/firebase-orm-models';

/** How many fork points the details list spells out before summarising the rest as a count. */
export const MAX_LISTED_FORKS = 5;

/** The DOM id a timeline entry carries, so the status panel can link straight to it. */
export function auditEntryAnchorId(entryId: string): string {
  return `audit-entry-${entryId}`;
}

export interface AuditChainStatusProps {
  chain: AuditLogChainVerification;
  /** Ids of the entries rendered in the page's timeline - only those can be linked to. */
  visibleEntryIds: ReadonlySet<string>;
  /** A person's display name for a member, the raw id otherwise. */
  actorName: (actorType: string, actorId: string) => string;
}

/**
 * The audit log's integrity verdict, stated so an admin knows what it means and what to do.
 * Three outcomes, kept distinct on purpose:
 * - intact: one linear chain, every entry verified;
 * - branched: every entry verified, but some were appended concurrently and share a parent - a
 *   known writer condition (see `recordAuditLogEntry`), never presented as tampering;
 * - broken: a stored entry was edited, or an entry others link to is gone - identified by id,
 *   action, time and actor, with a link to it when it is in the timeline below.
 */
export function AuditChainStatus({ chain, visibleEntryIds, actorName }: AuditChainStatusProps): React.ReactElement {
  const t = useTranslations('AuditLog');
  const locale = useLocale();
  const timeFormat = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'UTC' });
  const formatTime = (iso: string): string => (Number.isNaN(Date.parse(iso)) ? iso : t('chainEntryTime', { time: timeFormat.format(new Date(iso)) }));

  const entryLink = (entry: AuditLogChainEntryRef): React.ReactNode =>
    visibleEntryIds.has(entry.id) ? (
      <a href={`#${auditEntryAnchorId(entry.id)}`} className="font-mono underline underline-offset-2" dir="ltr">
        {entry.id}
      </a>
    ) : (
      <span className="font-mono" dir="ltr">
        {entry.id}
      </span>
    );

  if (!chain.valid) {
    const entry = chain.brokenEntry;
    const isHashMismatch = chain.reason === 'hash_mismatch';
    return (
      <section role="alert" data-testid="audit-chain-status" data-state="broken" className="flex flex-col gap-3 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
        <p className="flex items-center gap-2 font-medium text-destructive">
          <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
          {isHashMismatch ? t('chainBrokenHashMismatchTitle') : t('chainBrokenChainBreakTitle')}
        </p>
        {entry ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-foreground" data-testid="audit-chain-broken-entry">
            <dt className="text-muted-foreground">{t('chainEntryId')}</dt>
            <dd>
              {entryLink(entry)}
              {visibleEntryIds.has(entry.id) ? null : <span className="ms-2 text-xs text-muted-foreground">{t('chainEntryNotShown')}</span>}
            </dd>
            <dt className="text-muted-foreground">{t('chainEntryAction')}</dt>
            <dd className="font-mono" dir="ltr">
              {entry.action}
            </dd>
            <dt className="text-muted-foreground">{t('chainEntryRecordedAt')}</dt>
            <dd>{formatTime(entry.createdAt)}</dd>
            <dt className="text-muted-foreground">{t('chainEntryActor')}</dt>
            <dd dir="auto">{actorName(entry.actorType, entry.actorId)}</dd>
          </dl>
        ) : null}
        <p className="text-foreground">{isHashMismatch ? t('chainBrokenHashMismatchMeaning') : t('chainBrokenChainBreakMeaning')}</p>
        <p className="text-foreground">{t('chainBrokenNextSteps')}</p>
        <p className="text-xs text-muted-foreground">{t('kpiIntegritySubtext', { count: chain.entryCount })}</p>
      </section>
    );
  }

  if (chain.forks.length === 0) {
    return (
      <p
        data-testid="audit-chain-status"
        data-state="intact"
        className="flex items-center gap-2 rounded-xl border border-success/30 bg-success/5 px-4 py-3 text-sm text-muted-foreground"
      >
        <ShieldCheck className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
        {t('chainValid', { count: chain.entryCount })}
      </p>
    );
  }

  const branchedEntries = chain.forks.reduce((total, fork) => total + fork.branches.length - 1, 0);
  const listed = chain.forks.slice(0, MAX_LISTED_FORKS);
  return (
    <section data-testid="audit-chain-status" data-state="branched" className="flex flex-col gap-2 rounded-xl border border-info/30 bg-info/5 px-4 py-3 text-sm">
      <p className="flex items-center gap-2 font-medium text-foreground">
        <ShieldCheck className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
        {t('chainBranchedTitle', { count: chain.entryCount })}
      </p>
      <p className="text-muted-foreground">{t('chainBranchedBody', { forks: chain.forks.length, branched: branchedEntries })}</p>
      <details className="text-muted-foreground">
        <summary className="cursor-pointer text-foreground">{t('chainBranchedDetails')}</summary>
        <ul className="mt-2 flex flex-col gap-2" data-testid="audit-chain-forks">
          {listed.map((fork) => (
            <li key={fork.parent?.id ?? fork.branches[0].id} className="flex flex-col gap-1">
              <span className="flex items-center gap-1.5 text-foreground">
                <GitFork className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {fork.parent
                  ? t('chainForkAfter', { action: fork.parent.action, time: formatTime(fork.parent.createdAt), count: fork.branches.length })
                  : t('chainForkAtStart', { count: fork.branches.length })}
              </span>
              <span className="flex flex-wrap gap-x-3 gap-y-1 ps-5 text-xs">
                {fork.branches.map((branch) => (
                  <span key={branch.id} className="inline-flex items-center gap-1">
                    {entryLink(branch)}
                    <span className="font-mono" dir="ltr">
                      {branch.action}
                    </span>
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
        {chain.forks.length > listed.length ? <p className="mt-2 text-xs">{t('chainForksMore', { count: chain.forks.length - listed.length })}</p> : null}
      </details>
    </section>
  );
}
