'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Sparkles, Save, Check, ExternalLink } from 'lucide-react';
import { PpButton, PpField, PpPill, ppInputClass } from '@/components/pastel/primitives';

export interface SessionReplaySettingsFormProps {
  orgId: string;
  projectId: string;
  initialTemplate: string;
  templateLabel?: string;
  templatePlaceholder?: string;
  templateHelp?: string;
  saveLabel?: string;
  savedLabel?: string;
  saveErrorLabel?: string;
  availableTokensHeading?: string;
  previewHeading?: string;
}

const AVAILABLE_TOKENS = ['{landing_page}', '{session_id}', '{customer_id}', '{utm_campaign}'] as const;

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
  templateLabel,
  templatePlaceholder,
  templateHelp,
  saveLabel,
  savedLabel,
  saveErrorLabel,
  availableTokensHeading,
  previewHeading,
}: SessionReplaySettingsFormProps): React.ReactElement {
  const t = useTranslations('SessionReplaySettings');
  const router = useRouter();
  const [template, setTemplate] = useState(initialTemplate);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function insertToken(token: string): void {
    setTemplate((prev) => (prev ? `${prev}&${token.replace(/[{}]/g, '')}=${token}` : token));
  }

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
        setError(saveErrorLabel ?? t('saveError'));
        return;
      }
      setSaved(true);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  const sampleResolvedUrl = template
    ? template
        .replace('{landing_page}', 'https://example.com/pricing')
        .replace('{session_id}', 'sess_99a8b7c6')
        .replace('{customer_id}', 'usr_44921')
        .replace('{utm_campaign}', 'spring_growth')
    : null;

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-2">
        <PpField
          label={templateLabel ?? t('templateLabel')}
          htmlFor="session-replay-template"
          hint={templateHelp ?? t('templateHelp', { landing_page: '{landing_page}' })}
        >
          <input
            id="session-replay-template"
            value={template}
            placeholder={templatePlaceholder ?? t('templatePlaceholder', { landing_page: '{landing_page}' })}
            onChange={(event) => setTemplate(event.target.value)}
            className={ppInputClass}
          />
        </PpField>

        <div className="flex flex-col gap-1.5 pt-2">
          <span className="text-xs font-semibold text-pp-outline uppercase tracking-wider">
            {availableTokensHeading ?? t('availableTokensHeading')}
          </span>
          <div className="flex flex-wrap gap-2">
            {AVAILABLE_TOKENS.map((token) => (
              <button
                key={token}
                type="button"
                onClick={() => insertToken(token)}
                className="px-3 py-1 rounded-full bg-pp-primary-fixed/60 hover:bg-pp-primary-fixed text-pp-on-primary-fixed text-xs font-mono font-semibold transition-colors flex items-center gap-1 active:scale-95"
              >
                <span>+ {token}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {sampleResolvedUrl ? (
        <div className="p-4 rounded-2xl bg-pp-surface-container-low/80 border border-pp-outline-variant/20 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-pp-outline uppercase tracking-wider">
              {previewHeading ?? t('previewHeading')}
            </span>
            <PpPill accent="mint">Preview</PpPill>
          </div>
          <p className="text-xs text-pp-on-surface-variant font-mono break-all bg-pp-surface-container-lowest p-3 rounded-xl border border-pp-outline-variant/15">
            {sampleResolvedUrl}
          </p>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-pp-error font-medium">
          {error}
        </p>
      ) : null}
      {saved && !error ? <p className="text-sm text-pp-secondary font-medium">{savedLabel ?? t('saved')}</p> : null}

      <div className="flex justify-end pt-2">
        <PpButton type="submit" variant="primary" disabled={submitting} icon={Save}>
          {saveLabel ?? t('save')}
        </PpButton>
      </div>
    </form>
  );
}
