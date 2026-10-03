'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { PpButton, PpField, ppInputClass } from '@/components/pastel/primitives';
import { PlusCircle } from 'lucide-react';
import {
  blankMetricDefinitionFormState,
  metricDefinitionFormStateToRequestBody,
  MetricDefinitionEditor,
  type MetricDefinitionFormState,
} from './metric-definition-editor';

export interface RegisterMetricDefFormProps {
  orgId: string;
  projectId: string;
}

/** Registers v1 of a new metric. */
export function RegisterMetricDefForm({ orgId, projectId }: RegisterMetricDefFormProps): React.ReactElement {
  const t = useTranslations('MetricRegistry');
  const router = useRouter();
  const [name, setName] = useState('');
  const [definitionState, setDefinitionState] = useState<MetricDefinitionFormState>(blankMetricDefinitionFormState());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/metric-defs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, ...metricDefinitionFormStateToRequestBody(definitionState) }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string; reasons?: string[] } | null;
        if (body?.error === 'duplicate_metric') {
          setError(t('duplicateMetricError'));
        } else if (body?.error === 'invalid_definition' && body.reasons) {
          setError(body.reasons.join('; '));
        } else {
          setError(t('registerError'));
        }
        return;
      }
      setName('');
      setDefinitionState(blankMetricDefinitionFormState());
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
      <PpField label={t('nameLabel')} htmlFor="metric-def-name">
        <input
          id="metric-def-name"
          required
          placeholder={t('namePlaceholder')}
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={ppInputClass}
        />
      </PpField>

      <MetricDefinitionEditor state={definitionState} onChange={setDefinitionState} />

      {error ? (
        <p role="alert" className="text-sm font-medium text-pp-error">
          {error}
        </p>
      ) : null}

      <div>
        <PpButton type="submit" variant="primary" icon={PlusCircle} disabled={submitting}>
          {t('register')}
        </PpButton>
      </div>
    </form>
  );
}
