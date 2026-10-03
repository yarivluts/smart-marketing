'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { PpButton } from '@/components/pastel/primitives';
import { RefreshCw } from 'lucide-react';

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
 * schema (KAN-18 custom-schema marts).
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
      <PpButton type="button" variant="secondary" size="sm" icon={RefreshCw} onClick={handleClick} disabled={submitting}>
        {t('syncMartsButton')}
      </PpButton>
      {state.kind === 'error' ? (
        <p role="alert" className="text-xs text-pp-error">
          {t('syncMartsError')}
        </p>
      ) : null}
      {state.kind === 'not_configured' ? <p className="text-xs text-pp-outline">{t('syncMartsNotConfigured')}</p> : null}
      {state.kind === 'done' ? (
        <div className="flex flex-col gap-0.5">
          <p className="text-xs text-pp-secondary font-medium">{t('syncMartsDone', { count: state.syncedCount })}</p>
          {state.errors.map((entry) => (
            <p key={entry.schemaName} role="alert" className="text-xs text-pp-error">
              {t('syncMartsSchemaError', { schemaName: entry.schemaName, message: entry.message })}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
