'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import type { Environment } from '@growthos/shared';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { hookSignatureModeLabelKey } from '@/lib/orgs/hook-view';

// Client components must never import a *value* from `@growthos/firebase-orm-models` (its barrel
// drags in server-only code, e.g. `node:child_process` from the orchestration module, which breaks
// the client webpack bundle) — this local copy mirrors `schema-fields-editor.tsx`'s own
// `SCHEMA_FIELD_TYPES` constant for the same reason. Kept in sync with `HOOK_SIGNATURE_MODES`
// (`packages/firebase-orm-models/src/models/hook-endpoint.model.ts`) by hand, same as that sibling.
const HOOK_SIGNATURE_MODES = ['none', 'hmac_sha256'] as const;
type HookSignatureMode = (typeof HOOK_SIGNATURE_MODES)[number];

export interface HookEnvironmentOption {
  id: string;
  name: Environment;
}

export interface CreateHookEndpointFormProps {
  orgId: string;
  projectId: string;
  environments: readonly HookEnvironmentOption[];
}

/** Creates a new hook endpoint (KAN-53). Unlike an API key's raw secret, a `signature_mode: 'none'` endpoint's `hook_id` isn't one-way hashed — it stays visible in the list below any time an admin needs to re-copy the receive URL, so there is no "shown once" flow to build here. */
export function CreateHookEndpointForm({ orgId, projectId, environments }: CreateHookEndpointFormProps): React.ReactElement {
  const t = useTranslations('Hooks');
  const tEnv = useTranslations('EnvBadge');
  const router = useRouter();
  const [name, setName] = useState('');
  const [environmentId, setEnvironmentId] = useState(environments[0]?.id ?? '');
  const [signatureMode, setSignatureMode] = useState<HookSignatureMode>('none');
  const [signatureHeaderName, setSignatureHeaderName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(false);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/hook-endpoints`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          environmentId,
          signatureMode,
          signatureHeaderName: signatureMode === 'hmac_sha256' ? signatureHeaderName : undefined,
        }),
      });
      if (!response.ok) {
        setError(true);
        return;
      }
      setName('');
      setSignatureMode('none');
      setSignatureHeaderName('');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
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

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="hook-endpoint-signature-mode">
          {t('signatureModeLabel')}
        </label>
        <select
          id="hook-endpoint-signature-mode"
          value={signatureMode}
          onChange={(event) => setSignatureMode(event.target.value as HookSignatureMode)}
          className="h-10 rounded-md border border-input bg-background px-2 text-sm"
        >
          {HOOK_SIGNATURE_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {t(hookSignatureModeLabelKey(mode))}
            </option>
          ))}
        </select>
      </div>

      {signatureMode === 'hmac_sha256' ? (
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="hook-endpoint-signature-header">
            {t('signatureHeaderNameLabel')}
          </label>
          <Input
            id="hook-endpoint-signature-header"
            required
            placeholder="X-Hub-Signature-256"
            value={signatureHeaderName}
            onChange={(event) => setSignatureHeaderName(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">{t('signatureHeaderNameHint')}</p>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {t('createEndpointError')}
        </p>
      ) : null}
      <Button type="submit" disabled={submitting || environments.length === 0}>
        {t('createEndpoint')}
      </Button>
    </form>
  );
}
