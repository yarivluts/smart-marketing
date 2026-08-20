'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Environment } from '@growthos/shared';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

export interface DrainPipelineEnvironmentOption {
  id: string;
  name: Environment;
}

export interface DrainPipelineMessagesButtonProps {
  orgId: string;
  projectId: string;
  environments: readonly DrainPipelineEnvironmentOption[];
}

interface DrainResponse {
  delivered: number;
  failed: number;
}

/** Picks an environment and manually drains its still-`queued` pipeline messages right now (KAN-33's catch-up sweep). */
export function DrainPipelineMessagesButton({
  orgId,
  projectId,
  environments,
}: DrainPipelineMessagesButtonProps): React.ReactElement {
  const t = useTranslations('IngestHealth');
  const tEnv = useTranslations('EnvBadge');
  const router = useRouter();
  const [environmentId, setEnvironmentId] = useState(environments[0]?.id ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);
  const [result, setResult] = useState<DrainResponse | null>(null);

  async function handleClick(): Promise<void> {
    setError(false);
    setResult(null);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/ingest-health/drain-pipeline-messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ environmentId }),
      });
      if (!response.ok) {
        setError(true);
        return;
      }
      const body = (await response.json()) as DrainResponse;
      setResult(body);
      if (body.delivered > 0) {
        router.refresh();
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (environments.length === 0) {
    return <p className="text-xs text-muted-foreground">{t('pipelineDrainNoEnvironments')}</p>;
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex items-center gap-2">
        <select
          value={environmentId}
          onChange={(event) => setEnvironmentId(event.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          aria-label={t('pipelineDrainEnvironmentLabel')}
        >
          {environments.map((environment) => (
            <option key={environment.id} value={environment.id}>
              {tEnv(environment.name)}
            </option>
          ))}
        </select>
        <Button type="button" variant="outline" size="sm" onClick={handleClick} disabled={submitting}>
          {t('pipelineDrainButton')}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {t('pipelineDrainError')}
        </p>
      ) : null}
      {result ? <p className="text-xs text-muted-foreground">{t('pipelineDrainResult', { delivered: result.delivered, failed: result.failed })}</p> : null}
    </div>
  );
}
