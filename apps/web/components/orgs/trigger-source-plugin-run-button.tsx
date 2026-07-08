'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Environment } from '@growthos/shared';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

export interface SourceRunEnvironmentOption {
  id: string;
  name: Environment;
}

export interface TriggerSourcePluginRunButtonProps {
  orgId: string;
  projectId: string;
  installId: string;
  environments: readonly SourceRunEnvironmentOption[];
}

/** Picks an environment and manually triggers one sync run "right now" for a source-plugin install (KAN-47). */
export function TriggerSourcePluginRunButton({
  orgId,
  projectId,
  installId,
  environments,
}: TriggerSourcePluginRunButtonProps): React.ReactElement {
  const t = useTranslations('ProjectPlugins');
  const tEnv = useTranslations('EnvBadge');
  const router = useRouter();
  const [environmentId, setEnvironmentId] = useState(environments[0]?.id ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  async function handleClick(): Promise<void> {
    setError(false);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/plugins/${installId}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ environmentId }),
      });
      if (!response.ok) {
        setError(true);
        return;
      }
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  if (environments.length === 0) {
    return <p className="text-xs text-muted-foreground">{t('sourceRunNoEnvironments')}</p>;
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex items-center gap-2">
        <select
          value={environmentId}
          onChange={(event) => setEnvironmentId(event.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          aria-label={t('sourceRunEnvironmentLabel')}
        >
          {environments.map((environment) => (
            <option key={environment.id} value={environment.id}>
              {tEnv(environment.name)}
            </option>
          ))}
        </select>
        <Button type="button" variant="outline" size="sm" onClick={handleClick} disabled={submitting}>
          {t('sourceRunButton')}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {t('sourceRunError')}
        </p>
      ) : null}
    </div>
  );
}
