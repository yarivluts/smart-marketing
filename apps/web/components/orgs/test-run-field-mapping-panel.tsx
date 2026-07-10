'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

export interface TestRunHookDeliveryOption {
  id: string;
  receivedAt: string;
}

export interface TestRunFieldMappingPanelProps {
  orgId: string;
  projectId: string;
  fieldMappingId: string;
  hookDeliveries: readonly TestRunHookDeliveryOption[];
}

interface TestRunResponseBody {
  record: Record<string, unknown>;
  errors: string[];
  envelopeErrors: string[];
  schemaRegistered: boolean;
  schemaValidationErrors: string[];
}

/**
 * Runs a saved mapping against a sample payload without persisting anything
 * (KAN-54 AC: "test-run on sample") — the sample is either pasted JSON or an
 * already-queued hook delivery's raw payload (KAN-53). Collapsed by default
 * on the field-mappings list so browsing the list stays uncluttered.
 */
export function TestRunFieldMappingPanel({ orgId, projectId, fieldMappingId, hookDeliveries }: TestRunFieldMappingPanelProps): React.ReactElement {
  const t = useTranslations('FieldMappings');
  const [open, setOpen] = useState(false);
  const [samplePayload, setSamplePayload] = useState('');
  const [hookDeliveryId, setHookDeliveryId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TestRunResponseBody | null>(null);

  async function handleRun(): Promise<void> {
    setError(null);
    setResult(null);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/field-mappings/test-run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fieldMappingId,
          ...(hookDeliveryId ? { hookDeliveryId } : { samplePayload }),
        }),
      });
      if (!response.ok) {
        setError(t('testRunError'));
        return;
      }
      setResult((await response.json()) as TestRunResponseBody);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        {t('testRun')}
      </Button>
    );
  }

  const isSuccess =
    result !== null &&
    result.errors.length === 0 &&
    result.envelopeErrors.length === 0 &&
    result.schemaRegistered &&
    result.schemaValidationErrors.length === 0;

  return (
    <div className="flex w-full flex-col gap-2 rounded-md border border-input p-2">
      {hookDeliveries.length > 0 ? (
        <select
          aria-label={t('sampleFromDeliveryLabel')}
          value={hookDeliveryId}
          onChange={(event) => setHookDeliveryId(event.target.value)}
          className="h-10 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="">{t('samplePastedLabel')}</option>
          {hookDeliveries.map((delivery) => (
            <option key={delivery.id} value={delivery.id}>
              {delivery.receivedAt}
            </option>
          ))}
        </select>
      ) : null}
      {!hookDeliveryId ? (
        <textarea
          aria-label={t('samplePayloadLabel')}
          placeholder={t('samplePayloadPlaceholder')}
          value={samplePayload}
          onChange={(event) => setSamplePayload(event.target.value)}
          className="min-h-24 rounded-md border border-input bg-background p-2 font-mono text-xs"
        />
      ) : null}
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" onClick={handleRun} disabled={submitting || (!hookDeliveryId && samplePayload.trim().length === 0)}>
          {t('runTestRun')}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          {t('close')}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {result ? (
        <div className="flex flex-col gap-1 text-xs">
          <pre className="max-h-40 overflow-auto rounded-md bg-muted/50 p-2">{JSON.stringify(result.record, null, 2)}</pre>
          {result.errors.length > 0 ? <p className="text-destructive">{t('mappingErrors', { errors: result.errors.join(', ') })}</p> : null}
          {result.envelopeErrors.length > 0 ? <p className="text-destructive">{t('envelopeErrors', { errors: result.envelopeErrors.join(', ') })}</p> : null}
          {!result.schemaRegistered ? <p className="text-muted-foreground">{t('schemaNotRegisteredWarning')}</p> : null}
          {result.schemaValidationErrors.length > 0 ? (
            <p className="text-destructive">{t('schemaValidationErrors', { errors: result.schemaValidationErrors.join(', ') })}</p>
          ) : null}
          {isSuccess ? <p className="text-green-600 dark:text-green-400">{t('testRunSuccess')}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
