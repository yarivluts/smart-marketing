'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import type { Environment } from '@growthos/shared';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MintedHookSigningSecretDisplay } from './minted-hook-signing-secret-display';

// See `register-schema-def-form.tsx`'s doc comment: client components must not import kind
// vocabulary from `@growthos/firebase-orm-models` either.
const HOOK_SIGNATURE_MODES = ['none', 'hmac_sha256'] as const;
type HookSignatureMode = (typeof HOOK_SIGNATURE_MODES)[number];

export interface HookProjectEnvironmentOption {
  id: string;
  name: Environment;
}

export interface CreateHookEndpointFormProps {
  orgId: string;
  projectId: string;
  environments: readonly HookProjectEnvironmentOption[];
  hooksBaseUrl: string;
}

interface MintedHookEndpoint {
  hookUrl: string;
  rawSigningSecret?: string;
}

export function CreateHookEndpointForm({
  orgId,
  projectId,
  environments,
  hooksBaseUrl,
}: CreateHookEndpointFormProps): React.ReactElement {
  const t = useTranslations('Hooks');
  const tEnv = useTranslations('EnvBadge');
  const router = useRouter();
  const [name, setName] = useState('');
  const [environmentId, setEnvironmentId] = useState(environments[0]?.id ?? '');
  const [signatureMode, setSignatureMode] = useState<HookSignatureMode>('none');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);
  const [minted, setMinted] = useState<MintedHookEndpoint | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(false);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/hooks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, environmentId, signatureMode }),
      });
      if (!response.ok) {
        setError(true);
        return;
      }
      const body = (await response.json()) as { hookEndpointId: string; rawSigningSecret?: string };
      setMinted({
        hookUrl: `${hooksBaseUrl}/${projectId}/${body.hookEndpointId}`,
        rawSigningSecret: body.rawSigningSecret,
      });
      setName('');
      setSignatureMode('none');
    } finally {
      setSubmitting(false);
    }
  }

  function handleMintedDismiss(): void {
    setMinted(null);
    router.refresh();
  }

  if (minted) {
    if (minted.rawSigningSecret) {
      return (
        <MintedHookSigningSecretDisplay
          hookUrl={minted.hookUrl}
          rawSigningSecret={minted.rawSigningSecret}
          onDismiss={handleMintedDismiss}
        />
      );
    }
    return (
      <div data-testid="minted-hook-url-display" className="flex flex-col gap-3 rounded-md border border-input bg-muted/50 p-4">
        <span className="text-xs text-muted-foreground">{t('hookUrlLabel')}</span>
        <code className="break-all rounded-md bg-background p-3 text-sm">{minted.hookUrl}</code>
        <Button type="button" size="sm" onClick={handleMintedDismiss}>
          {t('done')}
        </Button>
      </div>
    );
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="hook-endpoint-name">
          {t('nameLabel')}
        </label>
        <Input id="hook-endpoint-name" required value={name} onChange={(event) => setName(event.target.value)} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="hook-endpoint-environment">
          {t('environmentLabel')}
        </label>
        <select
          id="hook-endpoint-environment"
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
        <legend className="text-sm font-medium">{t('signatureModeLabel')}</legend>
        <div className="flex flex-col gap-1.5">
          {HOOK_SIGNATURE_MODES.map((mode) => (
            <label key={mode} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="hook-signature-mode"
                checked={signatureMode === mode}
                onChange={() => setSignatureMode(mode)}
              />
              {t(`signatureMode.${mode}`)}
            </label>
          ))}
        </div>
      </fieldset>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {t('createError')}
        </p>
      ) : null}
      <Button type="submit" disabled={submitting}>
        {t('createHookEndpoint')}
      </Button>
    </form>
  );
}
