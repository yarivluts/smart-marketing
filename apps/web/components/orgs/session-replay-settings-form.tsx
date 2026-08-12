'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface SessionReplaySettingsFormProps {
  orgId: string;
  projectId: string;
  initialTemplate: string;
}

/**
 * The admin surface for a project's session-replay deep-link template
 * (CLAUDE.md: "anything user-manageable gets an admin surface"). Deliberately
 * a free-text template rather than a vendor picker + project id — see
 * `ProjectModel.session_replay_url_template` for why the shape of every
 * vendor's filter URL makes a template the honest abstraction.
 */
export function SessionReplaySettingsForm({
  orgId,
  projectId,
  initialTemplate,
}: SessionReplaySettingsFormProps): React.ReactElement {
  const t = useTranslations('SessionReplaySettings');
  const router = useRouter();
  const [template, setTemplate] = useState(initialTemplate);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/session-replay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template }),
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
        <label className="text-sm font-medium" htmlFor="session-replay-template">
          {t('templateLabel')}
        </label>
        <Input
          id="session-replay-template"
          value={template}
          placeholder={t('templatePlaceholder')}
          onChange={(event) => setTemplate(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">{t('templateHelp')}</p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {saved && !error ? <p className="text-sm text-muted-foreground">{t('saved')}</p> : null}

      <div>
        <Button type="submit" disabled={submitting}>
          {t('save')}
        </Button>
      </div>
    </form>
  );
}
