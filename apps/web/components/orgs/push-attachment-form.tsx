'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import type { ResourceKind } from '@growthos/firebase-orm-models';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface PushAttachmentFormProps {
  orgId: string;
  resourceKind: ResourceKind;
  resourceId: string;
  projects: ReadonlyArray<{ id: string; name: string }>;
  /** Only meaningful for `resourceKind === 'credential'` — the org's full available-scope list, shown as a hint. */
  availableScopes?: readonly string[];
}

/**
 * The org-admin-pushed half of plan 08 §1.2 — an org-resource-owner attaches
 * a library resource straight to a project, landing `approved` immediately
 * (no pending request the project has to wait on). Only rendered for callers
 * who already hold `resources.manage`, the same gate the detach control uses.
 */
export function PushAttachmentForm({
  orgId,
  resourceKind,
  resourceId,
  projects,
  availableScopes,
}: PushAttachmentFormProps): React.ReactElement | null {
  const t = useTranslations('ResourceLibrary');
  const router = useRouter();
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
  const [scopes, setScopes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  if (projects.length === 0) {
    return null;
  }

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
      const response = await fetch(`/api/orgs/${orgId}/resource-attachments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, resourceKind, resourceId, scopeSelection }),
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
      <label className="sr-only" htmlFor={`push-project-${resourceId}`}>
        {t('pushProjectLabel')}
      </label>
      <select
        id={`push-project-${resourceId}`}
        value={projectId}
        onChange={(event) => setProjectId(event.target.value)}
        className="h-8 rounded-md border border-input bg-background px-2 text-xs"
      >
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </select>
      {resourceKind === 'credential' ? (
        <Input
          aria-label={t('pushScopeSelectionLabel')}
          placeholder={availableScopes?.join(', ') ?? ''}
          value={scopes}
          onChange={(event) => setScopes(event.target.value)}
        />
      ) : null}
      <Button type="submit" variant="outline" size="sm" disabled={submitting}>
        {t('pushToProject')}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {t('pushError')}
        </p>
      ) : null}
    </form>
  );
}
