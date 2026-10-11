'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { allowedOriginsIssue } from '@growthos/shared';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

export interface EditAllowedOriginsFormProps {
  orgId: string;
  projectId: string;
  apiKeyId: string;
  initialOrigins: readonly string[];
}

function originsFromText(text: string): string[] {
  return text
    .split(/[\n,]+/)
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/**
 * The web origins a publishable (browser) key accepts events from: shown on the key's card, and
 * editable - a new domain or a staging site is added here, and takes effect on the next request.
 */
export function EditAllowedOriginsForm({
  orgId,
  projectId,
  apiKeyId,
  initialOrigins,
}: EditAllowedOriginsFormProps): React.ReactElement {
  const t = useTranslations('ApiKeys');
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(initialOrigins.join('\n'));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const issue = allowedOriginsIssue(originsFromText(text));

  async function save(): Promise<void> {
    setSaving(true);
    setError(false);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/keys/${apiKeyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowedOrigins: originsFromText(text) }),
      });
      if (!response.ok) {
        setError(true);
        return;
      }
      setEditing(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div
        className="flex flex-wrap items-center gap-1.5 text-xs"
        data-testid={`api-key-origins-${apiKeyId}`}
      >
        <span className="text-muted-foreground">{t('originsShort')}</span>
        {initialOrigins.map((origin) => (
          <code
            key={origin}
            className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px]"
            dir="ltr"
          >
            {origin}
          </code>
        ))}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-primary hover:underline"
        >
          {t('editOrigins')}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium" htmlFor={`origins-${apiKeyId}`}>
        {t('originsLabel')}
      </label>
      <textarea
        id={`origins-${apiKeyId}`}
        rows={3}
        dir="ltr"
        value={text}
        onChange={(event) => setText(event.target.value)}
        className="rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
      {issue ? (
        <span className="text-xs text-destructive">{t(`originsIssue.${issue}`)}</span>
      ) : null}
      {error ? (
        <span role="alert" className="text-xs text-destructive">
          {t('originsSaveError')}
        </span>
      ) : null}
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() => void save()}
          disabled={saving || issue !== null}
        >
          {t('saveOrigins')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setEditing(false);
            setText(initialOrigins.join('\n'));
          }}
        >
          {t('cancelRename')}
        </Button>
      </div>
    </div>
  );
}
