import { useTranslations } from 'next-intl';
import type { RecordFeedEntryView } from '@/lib/orgs/record-feed-view';

export interface RecordFeedEntryListProps {
  entries: readonly RecordFeedEntryView[];
  /** Display name per environment id; an id with no entry renders as itself. */
  environmentDisplayNameById: ReadonlyMap<string, string>;
}

/**
 * The record feed's list of landed records (KAN-81), with each event's identity keys on their own
 * labelled line (KAN-210). The identity line is always rendered for an event feed — "no identity
 * keys on this record" is itself the answer an integrator debugging a stitching gap is looking for,
 * so it is stated rather than left as an absence.
 */
export function RecordFeedEntryList({ entries, environmentDisplayNameById }: RecordFeedEntryListProps): React.ReactElement {
  const t = useTranslations('RecordFeed');
  return (
    <ul className="flex flex-col gap-2">
      {entries.map((entry) => (
        <li key={entry.id} data-testid={`record-feed-entry-${entry.id}`} className="flex flex-col gap-1 rounded-md border border-input px-3 py-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">{environmentDisplayNameById.get(entry.environmentId) ?? entry.environmentId}</span>
            <span className="text-xs text-muted-foreground">{t('landedAtLine', { landedAt: entry.landedAt })}</span>
          </div>
          {entry.fields.map((field) => (
            <span key={field.name} className={field.isPii ? 'text-muted-foreground' : ''}>
              {t('fieldLine', { name: field.name, value: field.value })}
            </span>
          ))}
          <div role="group" aria-label={t('identityLabel')} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
            <span className="font-medium text-foreground">{t('identityLabel')}</span>
            {entry.identity.length === 0 ? (
              <span className="text-muted-foreground">{t('identityNone')}</span>
            ) : (
              entry.identity.map((key) => (
                <span key={key.name} dir="ltr" className={`font-mono ${key.isPii ? 'text-muted-foreground' : ''}`}>
                  {t('fieldLine', { name: key.name, value: key.value })}
                </span>
              ))
            )}
          </div>
          <span className="text-xs text-muted-foreground">{t('clientIdLine', { clientId: entry.clientId })}</span>
        </li>
      ))}
    </ul>
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
    <select id={id} name="field" defaultValue={defaultValue} className="rounded-md border border-input bg-background px-2 py-1 text-sm">
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
