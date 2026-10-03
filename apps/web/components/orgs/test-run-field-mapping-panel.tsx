'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { PpButton, ppInputClass } from '@/components/pastel/primitives';
import { Play, Check, X, FlaskConical } from 'lucide-react';
import { cn } from '@/lib/utils';

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
 * (KAN-54 AC: "test-run on sample").
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
      <PpButton type="button" variant="secondary" size="sm" icon={FlaskConical} onClick={() => setOpen(true)}>
        {t('testRun')}
      </PpButton>
    );
  }

  const isSuccess =
    result !== null &&
    result.errors.length === 0 &&
    result.envelopeErrors.length === 0 &&
    result.schemaRegistered &&
    result.schemaValidationErrors.length === 0;

  return (
    <div className="flex w-full flex-col gap-3 rounded-2xl bg-pp-surface-container-low/70 p-4 border border-pp-outline-variant/30 mt-2">
      {hookDeliveries.length > 0 ? (
        <select
          aria-label={t('sampleFromDeliveryLabel')}
          value={hookDeliveryId}
          onChange={(event) => setHookDeliveryId(event.target.value)}
          className={cn(ppInputClass, 'text-xs py-2')}
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
          className={cn(ppInputClass, 'min-h-24 p-3 font-mono text-xs')}
        />
      ) : null}
      <div className="flex items-center gap-2">
        <PpButton
          type="button"
          size="sm"
          icon={Play}
          onClick={handleRun}
          disabled={submitting || (!hookDeliveryId && samplePayload.trim().length === 0)}
        >
          {t('runTestRun')}
        </PpButton>
        {isSuccess && hookDeliveryId ? (
          <PpButton type="button" variant="secondary" size="sm" icon={Check} onClick={handleApply} disabled={applying}>
            {t('applyToDelivery')}
          </PpButton>
        ) : null}
        <PpButton type="button" variant="ghost" size="sm" icon={X} onClick={() => setOpen(false)}>
          {t('close')}
        </PpButton>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-pp-error font-medium">
          {error}
        </p>
      ) : null}
      {applyError ? (
        <p role="alert" className="text-xs text-pp-error font-medium">
          {applyError}
        </p>
      ) : null}
      {result ? (
        <div className="flex flex-col gap-2 text-xs">
          <pre className="max-h-48 overflow-auto rounded-xl bg-[#1e1e24] text-[#f2eff8] p-3 font-mono text-xs">
            {JSON.stringify(result.record, null, 2)}
          </pre>
          {result.errors.length > 0 ? (
            <p className="text-pp-error font-medium">{t('mappingErrors', { errors: result.errors.join(', ') })}</p>
          ) : null}
          {result.envelopeErrors.length > 0 ? (
            <p className="text-pp-error font-medium">{t('envelopeErrors', { errors: result.envelopeErrors.join(', ') })}</p>
          ) : null}
          {!result.schemaRegistered ? (
            <p className="text-pp-outline font-medium">{t('schemaNotRegisteredWarning')}</p>
          ) : null}
          {result.schemaValidationErrors.length > 0 ? (
            <p className="text-pp-error font-medium">
              {t('schemaValidationErrors', { errors: result.schemaValidationErrors.join(', ') })}
            </p>
          ) : null}
          {isSuccess ? <p className="text-pp-secondary font-bold">{t('testRunSuccess')}</p> : null}
        </div>
      ) : null}
      {applySummary ? (
        <p className="text-xs text-pp-secondary font-bold">
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
