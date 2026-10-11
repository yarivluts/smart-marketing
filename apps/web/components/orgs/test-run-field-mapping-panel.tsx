'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
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

interface ApplyResponseBody extends TestRunResponseBody {
  applied: boolean;
  ingestSummary?: { accepted: number; quarantined: number; duplicates: number };
}

/**
 * Runs a saved mapping against a sample payload without persisting anything
 * (KAN-54 AC: "test-run on sample") — the sample is either pasted JSON or an
 * already-queued hook delivery's raw payload (KAN-53). Collapsed by default
 * on the field-mappings list so browsing the list stays uncluttered. Once a
 * test-run against a real queued delivery comes back clean, an "apply to
 * delivery" action (KAN-54 follow-up) lands the mapped record for real via
 * the ingest pipeline and marks the delivery handled — see
 * `applyFieldMappingToDelivery`'s own doc comment for why this reuses the
 * exact same validation path rather than trusting the earlier preview.
 */
export function TestRunFieldMappingPanel({ orgId, projectId, fieldMappingId, hookDeliveries }: TestRunFieldMappingPanelProps): React.ReactElement {
  const t = useTranslations('FieldMappings');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [samplePayload, setSamplePayload] = useState('');
  const [hookDeliveryId, setHookDeliveryId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TestRunResponseBody | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applySummary, setApplySummary] = useState<ApplyResponseBody['ingestSummary'] | null>(null);

  async function handleRun(): Promise<void> {
    setError(null);
    setResult(null);
    setApplyError(null);
    setApplySummary(null);
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

  async function handleApply(): Promise<void> {
    if (!hookDeliveryId) return;
    setApplyError(null);
    setApplySummary(null);
    setApplying(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/field-mappings/${fieldMappingId}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hookDeliveryId }),
      });
      if (!response.ok) {
        setApplyError(t('applyToDeliveryError'));
        return;
      }
      const body = (await response.json()) as ApplyResponseBody;
      if (!body.applied) {
        // Re-validation at apply time disagreed with the earlier preview (e.g. the schema evolved,
        // or the delivery changed, in between) — show the same error rendering a test-run would.
        setResult(body);
        setApplyError(t('applyToDeliveryValidationChanged'));
        return;
      }
      setApplySummary(body.ingestSummary ?? null);
      setHookDeliveryId('');
      router.refresh();
    } finally {
      setApplying(false);
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
        {isSuccess && hookDeliveryId ? (
          <Button type="button" variant="outline" size="sm" onClick={handleApply} disabled={applying}>
            {t('applyToDelivery')}
          </Button>
        ) : null}
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          {t('close')}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {applyError ? (
        <p role="alert" className="text-xs text-destructive">
          {applyError}
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
      {applySummary ? (
        <p className="text-xs text-green-600 dark:text-green-400">
          {t('applyToDeliverySuccess', {
            accepted: applySummary.accepted,
            quarantined: applySummary.quarantined,
            duplicates: applySummary.duplicates,
          })}
        </p>
      ) : null}
    </div>
  );
}
