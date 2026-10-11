import { useLocale, useTranslations } from 'next-intl';
import { Fingerprint, UserRound, Zap } from 'lucide-react';
import type { RecordFeedEntryView } from '@/lib/orgs/record-feed-view';
import { formatRelativeTime } from '@/lib/orgs/recency';
import { cn } from '@/lib/utils';

export interface RecordFeedEntryListProps {
  entries: readonly RecordFeedEntryView[];
  /** Display name per environment id; an id with no entry renders as itself. */
  environmentDisplayNameById: ReadonlyMap<string, string>;
  /** The page's clock; when given, each record also shows how long ago it landed. */
  nowMs?: number;
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * The record feed's list of landed records (KAN-81) as a timeline, newest first, grouped under a
 * header per UTC day. Each record shows its declared fields as chips and its identity keys on their
 * own labelled line (KAN-210). The identity line is always rendered for an event feed — "no identity
 * keys on this record" is itself the answer an integrator debugging a stitching gap is looking for,
 * so it is stated rather than left as an absence.
 */
export function RecordFeedEntryList({ entries, environmentDisplayNameById, nowMs }: RecordFeedEntryListProps): React.ReactElement {
  const t = useTranslations('RecordFeed');
  const locale = useLocale();
  const dayFormat = new Intl.DateTimeFormat(locale, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const timeFormat = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC' });

  return (
    <ol className="flex flex-col" data-testid="record-feed-timeline">
      {entries.map((entry, index) => {
        const landed = new Date(entry.landedAt);
        const validDate = !Number.isNaN(landed.getTime());
        const newDay = validDate && (index === 0 || dayKey(entries[index - 1].landedAt) !== dayKey(entry.landedAt));
        const visibleFields = entry.fields.filter((field) => field.value !== '' || field.isPii);
        const emptyFields = entry.fields.filter((field) => field.value === '' && !field.isPii);
        return (
          <li key={entry.id} data-testid={`record-feed-entry-${entry.id}`} className="relative flex flex-col">
            {newDay ? (
              <div className="mb-2 mt-1 ps-10 text-xs font-semibold uppercase tracking-wide text-muted-foreground first:mt-0">{dayFormat.format(landed)}</div>
            ) : null}
            <div className="relative flex gap-3 pb-4">
              <div className="relative flex w-7 shrink-0 justify-center" aria-hidden="true">
                <span className={cn('absolute top-8 w-px bg-border', index === entries.length - 1 ? 'hidden' : '-bottom-1')} />
                <span className="z-10 mt-1 flex h-7 w-7 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary">
                  <Zap className="h-3.5 w-3.5" />
                </span>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-2 rounded-xl border border-border bg-card px-3 py-2.5 text-sm shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    {validDate ? (
                      <span className="font-mono text-xs font-semibold tabular-nums text-foreground" dir="ltr">
                        {timeFormat.format(landed)}
                      </span>
                    ) : null}
                    <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {environmentDisplayNameById.get(entry.environmentId) ?? entry.environmentId}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground" title={entry.landedAt}>
                    {nowMs !== undefined && validDate ? formatRelativeTime(entry.landedAt, nowMs, locale) : t('landedAtLine', { landedAt: entry.landedAt })}
                  </span>
                </div>
                {visibleFields.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {visibleFields.map((field) => (
                      <span
                        key={field.name}
                        className={cn('rounded-md border px-2 py-0.5 text-xs', field.isPii ? 'border-dashed border-border text-muted-foreground' : 'border-border bg-muted/40 text-foreground')}
                      >
                        {t('fieldLine', { name: field.name, value: field.value })}
                      </span>
                    ))}
                  </div>
                ) : null}
                {emptyFields.length > 0 ? (
                  <span className="text-[11px] text-muted-foreground">{t('emptyFieldsLine', { fields: emptyFields.map((field) => field.name).join(', ') })}</span>
                ) : null}
                <div role="group" aria-label={t('identityLabel')} className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="font-medium text-foreground">{t('identityLabel')}</span>
                  {entry.identity.length === 0 ? (
                    <span className="text-muted-foreground">{t('identityNone')}</span>
                  ) : (
                    entry.identity.map((key) => {
                      const Icon = key.name === 'customer_id' ? UserRound : Fingerprint;
                      return (
                        <span key={key.name} className="inline-flex max-w-full items-center gap-1 rounded-full border border-info/30 bg-info/10 px-2 py-0.5">
                          <Icon className="h-3 w-3 shrink-0 text-info" aria-hidden="true" />
                          <span dir="ltr" className={`truncate font-mono ${key.isPii ? 'text-muted-foreground' : ''}`}>
                            {t('fieldLine', { name: key.name, value: key.value })}
                          </span>
                        </span>
                      );
                    })
                  )}
                </div>
                <span className="truncate font-mono text-[11px] text-muted-foreground" dir="ltr">
                  {t('clientIdLine', { clientId: entry.clientId })}
                </span>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export interface RecordFeedFieldSelectProps {
  id: string;
  declaredFieldNames: readonly string[];
  identityFieldNames: readonly string[];
  defaultValue: string;
}

/** The record feed filter's field picker: the schema's declared non-PII fields and, in their own group, the event identity keys (KAN-210). */
export function RecordFeedFieldSelect({ id, declaredFieldNames, identityFieldNames, defaultValue }: RecordFeedFieldSelectProps): React.ReactElement {
  const t = useTranslations('RecordFeed');
  return (
    <select id={id} name="field" defaultValue={defaultValue} className="h-10 rounded-xl border border-input bg-background px-3 text-sm shadow-sm">
      <option value="">{t('filterFieldPlaceholder')}</option>
      {declaredFieldNames.length > 0 ? (
        <optgroup label={t('filterDeclaredFieldsGroup')}>
          {declaredFieldNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </optgroup>
      ) : null}
      {identityFieldNames.length > 0 ? (
        <optgroup label={t('identityLabel')}>
          {identityFieldNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </optgroup>
      ) : null}
    </select>
  );
}
