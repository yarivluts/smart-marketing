'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { WIN_TYPES, type WinType } from '@growthos/shared';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { WinRuleFilterEditor, type WinRuleFilterRow } from './win-rule-filter-editor';

export interface CreateWinRuleFormProps {
  orgId: string;
  projectId: string;
  eventSchemaNames: string[];
}

/** Creates a win rule (KAN-65, E12.2): a name, an event schema, and zero or more filter clauses (all must match). An empty filter list means "any occurrence of this event is a win", e.g. `first_charge`. */
export function CreateWinRuleForm({ orgId, projectId, eventSchemaNames }: CreateWinRuleFormProps): React.ReactElement {
  const t = useTranslations('WinRules');
  const router = useRouter();
  const [name, setName] = useState('');
  const [schemaName, setSchemaName] = useState(eventSchemaNames[0] ?? '');
  const [winType, setWinType] = useState<WinType>('generic');
  const [filters, setFilters] = useState<WinRuleFilterRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim().length > 0 && schemaName.length > 0 && filters.every((filter) => filter.field.trim().length > 0 && filter.value.trim().length > 0);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/win-rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, schemaName, filters, winType }),
      });
      if (!response.ok) {
        setError(t('createError'));
        return;
      }
      setName('');
      setFilters([]);
      setWinType('generic');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="create-win-rule-name">
            {t('nameLabel')}
          </label>
          <Input
            id="create-win-rule-name"
            required
            placeholder={t('namePlaceholder')}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="create-win-rule-schema">
            {t('schemaLabel')}
          </label>
          <select
            id="create-win-rule-schema"
            value={schemaName}
            onChange={(event) => setSchemaName(event.target.value)}
            className="h-10 rounded-md border border-input bg-background px-2 text-sm"
          >
            {eventSchemaNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="create-win-rule-type">
            {t('winTypeFieldLabel')}
          </label>
          <select
            id="create-win-rule-type"
            value={winType}
            onChange={(event) => setWinType(event.target.value as WinType)}
            className="h-10 rounded-md border border-input bg-background px-2 text-sm"
          >
            {WIN_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`winTypeLabel.${type}`)}
              </option>
            ))}
          </select>
        </div>
      </div>
      {winType !== 'generic' ? <p className="text-xs text-muted-foreground">{t(`winTypeHint.${winType}`)}</p> : null}

      <WinRuleFilterEditor filters={filters} onChange={setFilters} />

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={submitting || !canSubmit} className="self-start">
        {t('createButton')}
      </Button>
    </form>
  );
}
