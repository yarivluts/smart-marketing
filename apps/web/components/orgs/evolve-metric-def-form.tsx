'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { metricDefinitionFormStateToRequestBody, MetricDefinitionEditor, type MetricDefinitionFormState } from './metric-definition-editor';

export interface EvolveMetricDefFormProps {
  orgId: string;
  projectId: string;
  name: string;
  initialState: MetricDefinitionFormState;
  /** Called both on cancel and after a successful evolve — in both cases the parent hides this form the same way (see the `router.refresh()` comment below for why success needs it too). */
  onClose: () => void;
}

/** Registers the next version of an already-registered metric, prefilled from its latest version (KAN-40; plan `04 §7`: "changing a definition is tracked"). */
export function EvolveMetricDefForm({ orgId, projectId, name, initialState, onClose }: EvolveMetricDefFormProps): React.ReactElement {
  const t = useTranslations('MetricRegistry');
  const router = useRouter();
  const [definitionState, setDefinitionState] = useState<MetricDefinitionFormState>(initialState);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/metric-defs/evolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, ...metricDefinitionFormStateToRequestBody(definitionState) }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string; reasons?: string[] } | null;
        setError(body?.error === 'invalid_definition' && body.reasons ? body.reasons.join('; ') : t('evolveError'));
        return;
      }
      // `router.refresh()` alone doesn't unmount this component (same key,
      // same position in the parent's list), so its local state would
      // otherwise keep showing the version just superseded instead of the
      // new active one — closing it forces a fresh prefill next time
      // "Evolve" is opened.
      router.refresh();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="flex flex-col gap-4 rounded-md border border-input p-4" onSubmit={handleSubmit} noValidate>
      <h3 className="text-sm font-semibold">{t('evolveHeading', { name })}</h3>
      <MetricDefinitionEditor state={definitionState} onChange={setDefinitionState} />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {t('evolveSubmit')}
        </Button>
        <Button type="button" variant="outline" onClick={onClose}>
          {t('cancel')}
        </Button>
      </div>
    </form>
  );
}
