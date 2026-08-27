'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface EditHookEndpointFormProps {
  orgId: string;
  projectId: string;
  hookEndpointId: string;
  initialName: string;
  /** `undefined` for a `none`-mode endpoint — the header-name field only ever renders in `hmac_sha256` mode, since `signatureMode` itself is immutable on this form. */
  initialSignatureHeaderName?: string;
}

/**
 * Toggles between a compact "Edit" button and an inline edit form for one
 * hook endpoint row on the Hooks admin page (KAN-123 — the same "create +
 * list only, no way to fix a typo'd name" gap KAN-100/KAN-117/KAN-119/
 * KAN-120/KAN-121 already closed for their own sibling registries).
 * `signatureMode`/`environmentId`/`hookId` stay immutable — see
 * `updateHookEndpoint`'s own doc comment for why (recreating `hookId` would
 * break the sending SaaS's already-configured webhook URL).
 */
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
      <Button type="button" variant="outline" size="sm" onClick={startEditing}>
        {t('editEndpoint')}
      </Button>
    );
  }

  return (
    <form className="flex w-full flex-col gap-3" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor={`edit-hook-endpoint-name-${hookEndpointId}`}>
          {t('nameLabel')}
        </label>
        <Input
          id={`edit-hook-endpoint-name-${hookEndpointId}`}
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      {initialSignatureHeaderName !== undefined ? (
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor={`edit-hook-endpoint-signature-header-${hookEndpointId}`}>
            {t('signatureHeaderNameLabel')}
          </label>
          <Input
            id={`edit-hook-endpoint-signature-header-${hookEndpointId}`}
            required
            placeholder="X-Hub-Signature-256"
            value={signatureHeaderName}
            onChange={(event) => setSignatureHeaderName(event.target.value)}
          />
        </div>
      ) : null}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={submitting || name.trim().length === 0}>
          {t('saveEndpoint')}
        </Button>
        <Button type="button" variant="outline" disabled={submitting} onClick={() => setEditing(false)}>
          {t('cancelEditEndpoint')}
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
