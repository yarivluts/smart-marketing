'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import type { ResourceKind } from '@growthos/firebase-orm-models';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface RequestAttachmentFormProps {
  orgId: string;
  projectId: string;
  resourceKind: ResourceKind;
  resourceId: string;
  /** Only meaningful for `resourceKind === 'credential'` — the org's full available-scope list, shown as a hint. */
  availableScopes?: readonly string[];
}

export function RequestAttachmentForm({
  orgId,
  projectId,
  resourceKind,
  resourceId,
  availableScopes,
}: RequestAttachmentFormProps): React.ReactElement {
  const t = useTranslations('ProjectResources');
  const router = useRouter();
  const [scopes, setScopes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(false);
    setSubmitting(true);
    try {
      const scopeSelection =
        resourceKind === 'credential'
          ? scopes
              .split(',')
              .map((scope) => scope.trim())
              .filter((scope) => scope.length > 0)
          : undefined;
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/resource-attachments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resourceKind, resourceId, scopeSelection }),
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

  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={handleSubmit} noValidate>
      {resourceKind === 'credential' ? (
        <Input
          aria-label={t('scopeSelectionLabel')}
          placeholder={availableScopes?.join(', ') ?? ''}
          value={scopes}
          onChange={(event) => setScopes(event.target.value)}
        />
      ) : null}
      <Button type="submit" variant="outline" size="sm" disabled={submitting}>
        {t('requestAttachment')}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {t('requestError')}
        </p>
      ) : null}
    </form>
  );
}
