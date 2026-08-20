'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

export interface SyncSchemaMartsButtonProps {
  orgId: string;
  projectId: string;
}

type SyncState =
  | { kind: 'idle' }
  | { kind: 'error' }
  | { kind: 'not_configured' }
  | { kind: 'done'; syncedCount: number; errors: { schemaName: string; message: string }[] };

/**
 * (Re)creates the warehouse mart view for every active measure/entity
 * schema (KAN-18 custom-schema marts) — the backfill path for schemas
 * registered before mart generation existed; register/evolve keep their own
 * schema's view in sync automatically from here on.
 */
export function SyncSchemaMartsButton({ orgId, projectId }: SyncSchemaMartsButtonProps): React.ReactElement {
  const t = useTranslations('SchemaRegistry');
  const [submitting, setSubmitting] = useState(false);
  const [state, setState] = useState<SyncState>({ kind: 'idle' });

  async function handleClick(): Promise<void> {
    setState({ kind: 'idle' });
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/schema-defs/sync-marts`, { method: 'POST' });
      if (!response.ok) {
        setState({ kind: 'error' });
        return;
      }
      const body = (await response.json()) as { synced: string[]; errors: { schemaName: string; message: string }[]; warehouseConfigured: boolean };
      if (!body.warehouseConfigured) {
        setState({ kind: 'not_configured' });
        return;
      }
      setState({ kind: 'done', syncedCount: body.synced.length, errors: body.errors });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button type="button" variant="outline" size="sm" onClick={handleClick} disabled={submitting}>
        {t('syncMartsButton')}
      </Button>
      {state.kind === 'error' ? (
        <p role="alert" className="text-xs text-destructive">
          {t('syncMartsError')}
        </p>
      ) : null}
      {state.kind === 'not_configured' ? <p className="text-xs text-muted-foreground">{t('syncMartsNotConfigured')}</p> : null}
      {state.kind === 'done' ? (
        <div className="flex flex-col gap-0.5">
          <p className="text-xs text-muted-foreground">{t('syncMartsDone', { count: state.syncedCount })}</p>
          {state.errors.map((entry) => (
            <p key={entry.schemaName} role="alert" className="text-xs text-destructive">
              {t('syncMartsSchemaError', { schemaName: entry.schemaName, message: entry.message })}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
