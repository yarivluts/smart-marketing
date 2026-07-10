'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface SetHookSigningSecretFormProps {
  orgId: string;
  projectId: string;
  hookEndpointId: string;
  hasSigningSecret: boolean;
}

/** Sets or rotates an `hmac_sha256` hook endpoint's signing secret (KAN-53, KAN-29 vault) — write-only, the same posture the Org Resource Library's credential-secret form establishes. */
export function SetHookSigningSecretForm({ orgId, projectId, hookEndpointId, hasSigningSecret }: SetHookSigningSecretFormProps): React.ReactElement {
  const t = useTranslations('Hooks');
  const router = useRouter();
  const [signingSecret, setSigningSecret] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(false);
    setSuccess(false);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/hook-endpoints/${hookEndpointId}/secret`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signingSecret }),
      });
      if (!response.ok) {
        setError(true);
        return;
      }
      setSigningSecret('');
      setSuccess(true);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium" htmlFor={`hook-secret-${hookEndpointId}`}>
          {hasSigningSecret ? t('rotateSigningSecretLabel') : t('setSigningSecretLabel')}
        </label>
        <Input
          id={`hook-secret-${hookEndpointId}`}
          type="password"
          required
          value={signingSecret}
          onChange={(event) => setSigningSecret(event.target.value)}
          className="h-8 text-xs"
        />
      </div>
      <Button type="submit" variant="outline" size="sm" disabled={submitting}>
        {hasSigningSecret ? t('rotateSigningSecret') : t('setSigningSecret')}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {t('setSigningSecretError')}
        </p>
      ) : null}
      {success ? <p className="text-xs text-muted-foreground">{t('setSigningSecretSuccess')}</p> : null}
    </form>
  );
}
