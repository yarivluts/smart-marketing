'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { API_KEY_SCOPES, type ApiKeyScope, type Environment } from '@growthos/shared';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MintedApiKeyDisplay } from './minted-api-key-display';
import { TouchpointSnippetDisplay } from './touchpoint-snippet-display';

export interface ProjectEnvironmentOption {
  id: string;
  name: Environment;
}

export interface CreateApiKeyFormProps {
  orgId: string;
  projectId: string;
  environments: readonly ProjectEnvironmentOption[];
  ingestBaseUrl: string;
}

interface MintedKey {
  keyPrefix: string;
  rawKey: string;
  scopes: ApiKeyScope[];
}

export function CreateApiKeyForm({ orgId, projectId, environments, ingestBaseUrl }: CreateApiKeyFormProps): React.ReactElement {
  const t = useTranslations('ApiKeys');
  const tEnv = useTranslations('EnvBadge');
  const router = useRouter();
  const [name, setName] = useState('');
  const [environmentId, setEnvironmentId] = useState(environments[0]?.id ?? '');
  const [selectedScopes, setSelectedScopes] = useState<ApiKeyScope[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);
  const [mintedKey, setMintedKey] = useState<MintedKey | null>(null);

  function toggleScope(scope: ApiKeyScope): void {
    setSelectedScopes((current) =>
      current.includes(scope) ? current.filter((value) => value !== scope) : [...current, scope],
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(false);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, environmentId, scopes: selectedScopes }),
      });
      if (!response.ok) {
        setError(true);
        return;
      }
      const body = (await response.json()) as { keyPrefix: string; rawKey: string };
      setMintedKey({ keyPrefix: body.keyPrefix, rawKey: body.rawKey, scopes: selectedScopes });
      setName('');
      setSelectedScopes([]);
    } finally {
      setSubmitting(false);
    }
  }

  function handleMintedKeyDismiss(): void {
    setMintedKey(null);
    router.refresh();
  }

  if (mintedKey) {
    return (
      <div className="flex flex-col gap-4">
        <MintedApiKeyDisplay rawKey={mintedKey.rawKey} onDismiss={handleMintedKeyDismiss} />
        {mintedKey.scopes.includes('ingest.write') ? (
          <TouchpointSnippetDisplay writeKey={mintedKey.rawKey} ingestBaseUrl={ingestBaseUrl} />
        ) : null}
      </div>
    );
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="api-key-name">
          {t('nameLabel')}
        </label>
        <Input id="api-key-name" required value={name} onChange={(event) => setName(event.target.value)} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="api-key-environment">
          {t('environmentLabel')}
        </label>
        <select
          id="api-key-environment"
          value={environmentId}
          onChange={(event) => setEnvironmentId(event.target.value)}
          className="h-10 rounded-md border border-input bg-background px-2 text-sm"
        >
          {environments.map((environment) => (
            <option key={environment.id} value={environment.id}>
              {tEnv(environment.name)}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-sm font-medium">{t('scopesLabel')}</legend>
        <div className="flex flex-col gap-1.5">
          {API_KEY_SCOPES.map((scope) => (
            <label key={scope} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selectedScopes.includes(scope)}
                onChange={() => toggleScope(scope)}
              />
              {scope}
            </label>
          ))}
        </div>
      </fieldset>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {t('createError')}
        </p>
      ) : null}
      <Button type="submit" disabled={submitting || selectedScopes.length === 0}>
        {t('createKey')}
      </Button>
    </form>
  );
}
