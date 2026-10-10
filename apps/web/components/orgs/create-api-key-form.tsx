'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import {
  API_KEY_SCOPES,
  allowedOriginsIssue,
  type ApiKeyKind,
  type ApiKeyScope,
  type Environment,
} from '@growthos/shared';
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
  /**
   * Preselections, e.g. from a "create a browser key for prod" link on the Installation page
   * (`?kind=publishable&environmentId=...`). Each is ignored when it does not match a real option.
   */
  initialKind?: ApiKeyKind;
  initialEnvironmentId?: string;
  initialScopes?: readonly ApiKeyScope[];
}

interface MintedKey {
  keyPrefix: string;
  rawKey: string;
  kind: ApiKeyKind;
}

/** One origin per line (or comma separated), blanks dropped. */
function originsFromText(text: string): string[] {
  return text
    .split(/[\n,]+/)
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function CreateApiKeyForm({
  orgId,
  projectId,
  environments,
  ingestBaseUrl,
  initialKind,
  initialEnvironmentId,
  initialScopes,
}: CreateApiKeyFormProps): React.ReactElement {
  const t = useTranslations('ApiKeys');
  const tEnv = useTranslations('EnvBadge');
  const router = useRouter();
  const [name, setName] = useState('');
  const [environmentId, setEnvironmentId] = useState(
    environments.some((environment) => environment.id === initialEnvironmentId)
      ? (initialEnvironmentId as string)
      : (environments[0]?.id ?? ''),
  );
  const [kind, setKind] = useState<ApiKeyKind>(initialKind ?? 'secret');
  const [originsText, setOriginsText] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<ApiKeyScope[]>(() =>
    API_KEY_SCOPES.filter((scope) => initialScopes?.includes(scope)),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);
  const [mintedKey, setMintedKey] = useState<MintedKey | null>(null);

  const originsIssue = allowedOriginsIssue(originsFromText(originsText));

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
        body: JSON.stringify(
          kind === 'publishable'
            ? { name, environmentId, kind, allowedOrigins: originsFromText(originsText) }
            : { name, environmentId, scopes: selectedScopes },
        ),
      });
      if (!response.ok) {
        setError(true);
        return;
      }
      const body = (await response.json()) as { keyPrefix: string; rawKey: string };
      setMintedKey({ keyPrefix: body.keyPrefix, rawKey: body.rawKey, kind });
      setName('');
      setSelectedScopes([]);
      setOriginsText('');
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
        {/* Only for a publishable key: the snippet goes into public page source, and a secret key
            there would leak (the API refuses a secret key sent from a web page). */}
        {mintedKey.kind === 'publishable' ? (
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
        <Input
          id="api-key-name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
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
        <legend className="text-sm font-medium">{t('kindLabel')}</legend>
        {(['secret', 'publishable'] as const).map((option) => (
          <label key={option} className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="api-key-kind"
              className="mt-1"
              checked={kind === option}
              onChange={() => setKind(option)}
            />
            <span className="flex flex-col">
              <span className="font-medium">{t(`kind.${option}.label`)}</span>
              <span className="text-muted-foreground">{t(`kind.${option}.hint`)}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {kind === 'publishable' ? (
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="api-key-origins">
            {t('originsLabel')}
          </label>
          <textarea
            id="api-key-origins"
            rows={3}
            dir="ltr"
            value={originsText}
            onChange={(event) => setOriginsText(event.target.value)}
            placeholder="https://www.example.com"
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <span className="text-xs text-muted-foreground">{t('originsHint')}</span>
          {originsText.trim() && originsIssue ? (
            <span className="text-xs text-destructive">{t(`originsIssue.${originsIssue}`)}</span>
          ) : null}
        </div>
      ) : (
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
      )}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {t('createError')}
        </p>
      ) : null}
      <Button
        type="submit"
        disabled={
          submitting ||
          (kind === 'publishable' ? originsIssue !== null : selectedScopes.length === 0)
        }
      >
        {t('createKey')}
      </Button>
    </form>
  );
}
