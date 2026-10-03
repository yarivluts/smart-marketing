'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import type { Environment } from '@growthos/shared';
import { useRouter } from '@/i18n/navigation';
import { PpButton, PpField, ppInputClass } from '@/components/pastel/primitives';
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <PpField label={t('nameLabel')} htmlFor="hook-endpoint-name">
          <input
            id="hook-endpoint-name"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={ppInputClass}
            placeholder="e.g. Hubspot Leads Sync"
          />
        </PpField>

        <PpField label={t('environmentLabel')} htmlFor="hook-endpoint-environment">
          <select
            id="hook-endpoint-environment"
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <PpField label={t('signatureModeLabel')} htmlFor="hook-endpoint-signature-mode">
          <select
            id="hook-endpoint-signature-mode"
            value={signatureMode}
            onChange={(event) => setSignatureMode(event.target.value as HookSignatureMode)}
            className={ppInputClass}
          >
            {HOOK_SIGNATURE_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {t(hookSignatureModeLabelKey(mode))}
              </option>
            ))}
          </select>
        </PpField>

        {signatureMode === 'hmac_sha256' ? (
          <PpField
            label={t('signatureHeaderNameLabel')}
            htmlFor="hook-endpoint-signature-header"
            hint={t('signatureHeaderNameHint')}
          >
            <input
              id="hook-endpoint-signature-header"
              required
              placeholder="X-Hub-Signature-256"
              value={signatureHeaderName}
              onChange={(event) => setSignatureHeaderName(event.target.value)}
              className={ppInputClass}
            />
          </PpField>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-pp-error font-medium">
          {t('createEndpointError')}
        </p>
      ) : null}
      <div className="flex justify-end pt-2">
        <PpButton type="submit" variant="primary" disabled={submitting || environments.length === 0}>
          {t('createEndpoint')}
        </PpButton>
      </div>
    </form>
  );
}
