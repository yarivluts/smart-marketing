'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { WIN_TYPES, type WinType } from '@growthos/shared';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { WinRuleFilterEditor, type WinRuleFilterRow } from './win-rule-filter-editor';

export interface EditWinRuleFormProps {
  orgId: string;
  projectId: string;
  winRuleId: string;
  initialName: string;
  schemaName: string;
  initialFilters: readonly WinRuleFilterRow[];
  initialWinType: WinType;
}

/**
 * Toggles between a compact "Edit" button and an inline edit form for one
 * win rule row on the Win rules admin page (KAN-127 — the same "create +
 * list only, no way to fix a typo'd name or a wrong filter value" gap
 * KAN-100/KAN-117/KAN-119/KAN-120/KAN-121/KAN-123/KAN-124/KAN-125/KAN-126
 * already closed for their own sibling registries; `win-rule.service.ts`'s
 * `updateWinRule` already supported this full replace, only the admin UI
 * control to reach it was missing). Reuses the same `WinRuleFilterEditor`
 * the create-win-rule form uses for its own filter rows. `schemaName` stays
 * immutable — `updateWinRule` has no parameter for it.
 */
export function EditWinRuleForm({
  orgId,
  projectId,
  winRuleId,
  initialName,
  schemaName,
  initialFilters,
  initialWinType,
}: EditWinRuleFormProps): React.ReactElement {
  const t = useTranslations('WinRules');
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initialName);
  const [winType, setWinType] = useState<WinType>(initialWinType);
  const [filters, setFilters] = useState<WinRuleFilterRow[]>([...initialFilters]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim().length > 0 && filters.every((filter) => filter.field.trim().length > 0 && filter.value.trim().length > 0);

  function startEditing(): void {
    setName(initialName);
    setWinType(initialWinType);
    setFilters([...initialFilters]);
    setError(null);
    setEditing(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/win-rules/${winRuleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, filters, winType }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string; reasons?: string[] } | null;
        if (body?.reasons?.length) {
          setError(body.reasons.join(' '));
        } else {
          setError(t('editRuleError'));
        }
        return;
      }
      setEditing(false);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  if (!editing) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={startEditing}>
        {t('editRule')}
      </Button>
    );
  }

  return (
    <form className="flex w-full flex-col gap-3" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor={`edit-win-rule-name-${winRuleId}`}>
            {t('nameLabel')}
          </label>
          <Input
            id={`edit-win-rule-name-${winRuleId}`}
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{t('schemaLabel')}</span>
          <span className="text-sm text-muted-foreground">{schemaName}</span>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor={`edit-win-rule-type-${winRuleId}`}>
            {t('winTypeFieldLabel')}
          </label>
          <select
            id={`edit-win-rule-type-${winRuleId}`}
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

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={submitting || !canSubmit}>
          {t('saveRule')}
        </Button>
        <Button type="button" variant="outline" disabled={submitting} onClick={() => setEditing(false)}>
          {t('cancelEditRule')}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  );
}
