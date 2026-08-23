'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';

export interface CampaignTargetInputProps {
  orgId: string;
  projectId: string;
  campaignId: string;
  monthlyBudget: number | null;
}

/**
 * Inline-editable spend target cell (KAN-86, plan `14 §Gap 12`'s "inline-
 * editable... targets"). Commits on blur (not a separate save button) — the
 * `x-editable`-in-a-table pattern the gap doc itself references. An empty
 * value DELETEs the target (reverts to "no target") rather than PATCHing
 * budget `0`, since those mean different things (`CampaignSpendRow.status`).
 * Mirrors `SegmentWorkListControls`'s own per-row-independent PATCH +
 * `router.refresh()` convention.
 */
export function CampaignTargetInput({ orgId, projectId, campaignId, monthlyBudget }: CampaignTargetInputProps): React.ReactElement {
  const t = useTranslations('CampaignOps');
  const router = useRouter();
  const [value, setValue] = useState(monthlyBudget !== null ? String(monthlyBudget) : '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function commit(): Promise<void> {
    const trimmed = value.trim();
    if (trimmed.length > 0 && (!Number.isFinite(Number(trimmed)) || Number(trimmed) < 0)) {
      setError(t('targetUpdateError'));
      return;
    }
    setError(null);
    setPending(true);
    try {
      const url = `/api/orgs/${orgId}/projects/${projectId}/campaign-ops/targets/${encodeURIComponent(campaignId)}`;
      const response =
        trimmed.length === 0
          ? await fetch(url, { method: 'DELETE' })
          : await fetch(url, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ monthlyBudget: Number(trimmed) }),
            });
      if (!response.ok) {
        setError(t('targetUpdateError'));
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        min={0}
        step="any"
        inputMode="decimal"
        aria-label={t('targetInputLabel', { campaignId })}
        placeholder={t('targetInputPlaceholder')}
        value={value}
        disabled={pending}
        onChange={(event) => setValue(event.target.value)}
        onBlur={commit}
        className="h-8 w-24 rounded-md border border-input bg-background px-2 text-xs"
      />
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
