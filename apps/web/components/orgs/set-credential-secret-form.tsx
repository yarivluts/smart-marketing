'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface SetCredentialSecretFormProps {
  orgId: string;
  credentialId: string;
  hasSecret: boolean;
}

/**
 * Write-only secret entry for a shared credential (KAN-29): the raw secret
 * is only ever submitted, never fetched back — matches how a password field
 * behaves, and keeps the decrypted value off the wire in both directions
 * except this one submit.
 */
export function SetCredentialSecretForm({ orgId, credentialId, hasSecret }: SetCredentialSecretFormProps): React.ReactElement {
  const t = useTranslations('ResourceLibrary');
  const router = useRouter();
  const [secret, setSecret] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(false);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/resources/credentials/${credentialId}/secret`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret }),
      });
      if (!response.ok) {
        setError(true);
        return;
      }
      setSecret('');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="flex flex-wrap items-end gap-3" onSubmit={handleSubmit} noValidate>
      <span className="text-xs text-muted-foreground">{hasSecret ? t('secretSet') : t('secretNotSet')}</span>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor={`credential-secret-${credentialId}`}>
          {t('secretLabel')}
        </label>
        <Input
          id={`credential-secret-${credentialId}`}
          type="password"
          autoComplete="off"
          value={secret}
          onChange={(event) => setSecret(event.target.value)}
        />
      </div>
      <Button type="submit" disabled={submitting || secret.trim().length === 0}>
        {hasSecret ? t('updateSecret') : t('setSecret')}
      </Button>
      {error ? (
        <p role="alert" className="w-full text-sm text-destructive">
          {t('setSecretError')}
        </p>
      ) : null}
    </form>
  );
}
