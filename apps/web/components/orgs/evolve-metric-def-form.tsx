'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { PpButton } from '@/components/pastel/primitives';
import { GitBranch, X } from 'lucide-react';
import { metricDefinitionFormStateToRequestBody, MetricDefinitionEditor, type MetricDefinitionFormState } from './metric-definition-editor';

export interface EvolveMetricDefFormProps {
  orgId: string;
  projectId: string;
  name: string;
  initialState: MetricDefinitionFormState;
  /** Called both on cancel and after a successful evolve. */
  onClose: () => void;
}

/** Registers the next version of an already-registered metric. */
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
      router.refresh();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="flex flex-col gap-4 rounded-2xl bg-pp-surface-container-low/50 p-4 border border-pp-outline-variant/30 mt-3" onSubmit={handleSubmit} noValidate>
      <h3 className="font-pp-display text-pp-headline-md text-pp-on-surface">{t('evolveHeading', { name })}</h3>
      <MetricDefinitionEditor state={definitionState} onChange={setDefinitionState} />
      {error ? (
        <p role="alert" className="text-sm font-medium text-pp-error">
          {error}
        </p>
      ) : null}
      <div className="flex items-center gap-3">
        <PpButton type="submit" variant="primary" size="sm" icon={GitBranch} disabled={submitting}>
          {t('evolveSubmit')}
        </PpButton>
        <PpButton type="button" variant="ghost" size="sm" icon={X} onClick={onClose}>
          {t('cancel')}
        </PpButton>
      </div>
    </form>
  );
}
