'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface CreateProjectFormProps {
  orgId: string;
}

export function CreateProjectForm({ orgId }: CreateProjectFormProps): React.ReactElement {
  const t = useTranslations('NewProjectPage');
  const router = useRouter();
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);
  const [missingName, setMissingName] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(false);
    if (name.trim() === '') {
      setMissingName(true);
      return;
    }
    setMissingName(false);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!response.ok) {
        setError(true);
        return;
      }
      const { projectId } = (await response.json()) as { projectId: string };
      router.push(`/orgs/${orgId}/projects/${projectId}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="project-name">
          {t('nameLabel')}
        </label>
        <Input
          id="project-name"
          required
          value={name}
          aria-invalid={missingName}
          aria-describedby={missingName ? 'project-name-error' : 'project-name-hint'}
          onChange={(event) => setName(event.target.value)}
        />
        {missingName ? (
          <p id="project-name-error" role="alert" className="text-sm text-destructive">
            {t('nameRequired')}
          </p>
        ) : (
          <p id="project-name-hint" className="text-sm text-muted-foreground">
            {t('nameHint')}
          </p>
        )}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {t('genericError')}
        </p>
      ) : null}
      <Button type="submit" disabled={submitting}>
        {t('submit')}
      </Button>
    </form>
  );
}
