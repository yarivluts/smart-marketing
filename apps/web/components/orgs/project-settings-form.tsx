'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface ProjectSettingsFormProps {
  orgId: string;
  projectId: string;
  initialName: string;
  initialVertical: string;
}

/**
 * The admin surface for a project's own `name`/`vertical`
 * (CLAUDE.md: "anything user-manageable gets an admin surface") — until now
 * these could only ever be set once, at project-creation time, with no way
 * to correct a typo afterward. `session_replay_url_template` has its own
 * dedicated settings page and isn't edited here.
 */
export function ProjectSettingsForm({
  orgId,
  projectId,
  initialName,
  initialVertical,
}: ProjectSettingsFormProps): React.ReactElement {
  const t = useTranslations('ProjectSettings');
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [vertical, setVertical] = useState(initialVertical);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSaved(false);

    if (!name.trim()) {
      setError(t('nameRequiredError'));
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, vertical }),
      });
      if (!response.ok) {
        setError(t('saveError'));
        return;
      }
      setSaved(true);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="project-settings-name">
          {t('nameLabel')}
        </label>
        <Input id="project-settings-name" value={name} onChange={(event) => setName(event.target.value)} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="project-settings-vertical">
          {t('verticalLabel')}
        </label>
        <Input id="project-settings-vertical" value={vertical} onChange={(event) => setVertical(event.target.value)} />
        <p className="text-xs text-muted-foreground">{t('verticalHelp')}</p>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {saved && !error ? <p className="text-sm text-muted-foreground">{t('saved')}</p> : null}

      <div>
        <Button type="submit" disabled={submitting}>
          {t('save')}
        </Button>
      </div>
    </form>
  );
}
