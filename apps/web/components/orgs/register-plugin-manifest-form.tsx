'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

export interface RegisterPluginManifestFormProps {
  orgId: string;
}

/** Registers a new `plugin.yaml` manifest version into the org's registry (KAN-46). */
export function RegisterPluginManifestForm({ orgId }: RegisterPluginManifestFormProps): React.ReactElement {
  const t = useTranslations('PluginRegistry');
  const router = useRouter();
  const [manifestYaml, setManifestYaml] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/plugins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manifestYaml }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string; reasons?: string[] } | null;
        if (body?.error === 'duplicate_manifest') {
          setError(t('duplicateManifestError'));
        } else if (body?.reasons?.length) {
          setError(body.reasons.join(' '));
        } else {
          setError(t('registerError'));
        }
        return;
      }
      setManifestYaml('');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="plugin-manifest-yaml">
          {t('manifestYamlLabel')}
        </label>
        <textarea
          id="plugin-manifest-yaml"
          className="min-h-48 rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm shadow-sm"
          placeholder={t('manifestYamlPlaceholder')}
          value={manifestYaml}
          onChange={(event) => setManifestYaml(event.target.value)}
          required
        />
        <p className="text-xs text-muted-foreground">{t('manifestYamlHint')}</p>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={submitting}>
        {t('registerButton')}
      </Button>
    </form>
  );
}
