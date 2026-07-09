'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const CREDENTIAL_PROVIDERS = ['google_ads', 'meta_ads', 'stripe', 'generic'] as const;

export interface CreateCredentialFormProps {
  orgId: string;
}

export function CreateCredentialForm({ orgId }: CreateCredentialFormProps): React.ReactElement {
  const t = useTranslations('ResourceLibrary');
  const router = useRouter();
  const [name, setName] = useState('');
  const [provider, setProvider] = useState<(typeof CREDENTIAL_PROVIDERS)[number]>('generic');
  const [scopes, setScopes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(false);
    setSubmitting(true);
    try {
      const availableScopes = scopes
        .split(',')
        .map((scope) => scope.trim())
        .filter((scope) => scope.length > 0);
      const response = await fetch(`/api/orgs/${orgId}/resources/credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, provider, availableScopes }),
      });
      if (!response.ok) {
        setError(true);
        return;
      }
      setName('');
      setScopes('');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="flex flex-wrap items-end gap-3" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="credential-name">
          {t('nameLabel')}
        </label>
        <Input id="credential-name" required value={name} onChange={(event) => setName(event.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="credential-provider">
          {t('providerLabel')}
        </label>
        <select
          id="credential-provider"
          value={provider}
          onChange={(event) => setProvider(event.target.value as (typeof CREDENTIAL_PROVIDERS)[number])}
          className="h-10 rounded-md border border-input bg-background px-2 text-sm"
        >
          {CREDENTIAL_PROVIDERS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="credential-scopes">
          {t('availableScopesLabel')}
        </label>
        <Input
          id="credential-scopes"
          placeholder={t('availableScopesPlaceholder')}
          value={scopes}
          onChange={(event) => setScopes(event.target.value)}
        />
      </div>
      <Button type="submit" disabled={submitting}>
        {t('createCredential')}
      </Button>
      {error ? (
        <p role="alert" className="w-full text-sm text-destructive">
          {t('createError')}
        </p>
      ) : null}
    </form>
  );
}
