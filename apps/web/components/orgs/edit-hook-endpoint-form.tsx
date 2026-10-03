'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { PpButton, PpField, ppInputClass } from '@/components/pastel/primitives';
import { Edit2, Save, X } from 'lucide-react';

export interface EditHookEndpointFormProps {
  orgId: string;
  projectId: string;
  hookEndpointId: string;
  initialName: string;
  initialSignatureHeaderName?: string;
}

/** Toggles between an Edit button and an inline edit form for one hook endpoint row. */
export function EditHookEndpointForm({
  orgId,
  projectId,
  hookEndpointId,
  initialName,
  initialSignatureHeaderName,
}: EditHookEndpointFormProps): React.ReactElement {
  const t = useTranslations('Hooks');
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initialName);
  const [signatureHeaderName, setSignatureHeaderName] = useState(initialSignatureHeaderName ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEditing(): void {
    setName(initialName);
    setSignatureHeaderName(initialSignatureHeaderName ?? '');
    setError(null);
    setEditing(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/hook-endpoints/${hookEndpointId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          signatureHeaderName: initialSignatureHeaderName !== undefined ? signatureHeaderName : undefined,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        if (body?.error === 'missing_signature_header_name') {
          setError(t('signatureHeaderNameRequiredError'));
        } else {
          setError(t('editEndpointError'));
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
      <PpButton type="button" variant="ghost" size="sm" icon={Edit2} onClick={startEditing}>
        {t('editEndpoint')}
      </PpButton>
    );
  }

  return (
    <form className="flex w-full flex-col gap-4 rounded-2xl bg-pp-surface-container-low/50 p-4 border border-pp-outline-variant/30 mt-2" onSubmit={handleSubmit} noValidate>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <PpField label={t('nameLabel')} htmlFor={`edit-hook-endpoint-name-${hookEndpointId}`}>
          <input
            id={`edit-hook-endpoint-name-${hookEndpointId}`}
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={ppInputClass}
          />
        </PpField>
        {initialSignatureHeaderName !== undefined ? (
          <PpField label={t('signatureHeaderNameLabel')} htmlFor={`edit-hook-endpoint-signature-header-${hookEndpointId}`}>
            <input
              id={`edit-hook-endpoint-signature-header-${hookEndpointId}`}
              required
              placeholder="X-Hub-Signature-256"
              value={signatureHeaderName}
              onChange={(event) => setSignatureHeaderName(event.target.value)}
              className={ppInputClass}
            />
          </PpField>
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        <PpButton type="submit" variant="primary" size="sm" icon={Save} disabled={submitting || name.trim().length === 0}>
          {t('saveEndpoint')}
        </PpButton>
        <PpButton type="button" variant="ghost" size="sm" icon={X} disabled={submitting} onClick={() => setEditing(false)}>
          {t('cancelEditEndpoint')}
        </PpButton>
      </div>
      {error ? (
        <p role="alert" className="text-sm font-medium text-pp-error">
          {error}
        </p>
      ) : null}
    </form>
  );
}
