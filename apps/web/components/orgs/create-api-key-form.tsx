'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { API_KEY_SCOPES, type ApiKeyScope, type Environment } from '@growthos/shared';
import { useRouter } from '@/i18n/navigation';
import { KeyRound } from 'lucide-react';
import { PpButton, PpField, ppInputClass } from '@/components/pastel/primitives';
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
        {/* Only offered for an `ingest.write`-only key: this snippet is meant to be pasted into
            public page source, so a key that also carries write access to schemas/metrics/exports
            must never be the one rendered inline here — the admin should mint a second, narrowly
            scoped key for the website instead. */}
        {mintedKey.scopes.length === 1 && mintedKey.scopes[0] === 'ingest.write' ? (
          <TouchpointSnippetDisplay writeKey={mintedKey.rawKey} ingestBaseUrl={ingestBaseUrl} />
        ) : null}
      </div>
    );
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <PpField label={t('nameLabel')} htmlFor="api-key-name">
          <input
            id="api-key-name"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={ppInputClass}
            placeholder="e.g. Analytics Data Pipeline Prod"
          />
        </PpField>

        <PpField label={t('environmentLabel')} htmlFor="api-key-environment">
          <select
            id="api-key-environment"
            value={environmentId}
            onChange={(event) => setEnvironmentId(event.target.value)}
            className={ppInputClass}
          >
            {environments.map((environment) => (
              <option key={environment.id} value={environment.id}>
                {tEnv(environment.name)}
              </option>
            ))}
          </select>
        </PpField>
      </div>

      <fieldset className="flex flex-col gap-2 pt-1">
        <legend className="block text-pp-label-md text-pp-on-surface mb-2">{t('scopesLabel')}</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 bg-pp-surface-container-low/60 p-3.5 rounded-2xl border border-pp-outline-variant/20">
          {API_KEY_SCOPES.map((scope) => {
            const isChecked = selectedScopes.includes(scope);
            return (
              <label
                key={scope}
                className={`flex items-center gap-2.5 p-2 rounded-xl cursor-pointer text-pp-body-sm transition-colors ${
                  isChecked
                    ? 'bg-pp-surface-container-lowest text-pp-on-surface font-semibold shadow-sm'
                    : 'text-pp-on-surface-variant hover:text-pp-on-surface'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleScope(scope)}
                  className="rounded text-pp-primary focus:ring-pp-primary/40 h-4 w-4"
                />
                <span className="font-mono text-xs">{scope}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {error ? (
        <p role="alert" className="text-sm text-pp-error font-medium">
          {t('createError')}
        </p>
      ) : null}
      <div className="flex justify-end pt-2">
        <PpButton
          type="submit"
          variant="primary"
          disabled={submitting || selectedScopes.length === 0}
          icon={KeyRound}
        >
          {t('createKey')}
        </PpButton>
      </div>
    </form>
  );
}
