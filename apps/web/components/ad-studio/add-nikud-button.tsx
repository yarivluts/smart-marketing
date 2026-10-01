'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Sparkles } from 'lucide-react';
import { useAdStudioErrorMessage, type AdStudioApiError } from './use-ad-studio-error';

export interface AddNikudButtonProps {
  orgId: string;
  projectId: string;
  briefId: string;
  /** The narration as typed now. */
  text: string;
  /** Receives the narration with full nikud and numbers written out. */
  onVocalized: (pronunciation: string) => void;
  disabled?: boolean;
}

/**
 * "Add nikud" (KAN-239): vocalizes the narration as typed, right away and without saving, so the
 * person sees how the narrator will read it and can correct a vowel before saving. Hebrew ads only;
 * one AI text call.
 */
export function AddNikudButton({
  orgId,
  projectId,
  briefId,
  text,
  onVocalized,
  disabled = false,
}: AddNikudButtonProps): React.ReactElement {
  const t = useTranslations('AdStudio.nikud');
  const errorMessage = useAdStudioErrorMessage();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function vocalize(): Promise<void> {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/orgs/${orgId}/projects/${projectId}/ad-studio/briefs/${briefId}/vocalize`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        },
      );
      const body = (await response.json().catch(() => ({}))) as AdStudioApiError & {
        pronunciation?: string;
      };
      if (!response.ok || !body.pronunciation) {
        setError(errorMessage(body));
        return;
      }
      onVocalized(body.pronunciation);
    } finally {
      setPending(false);
    }
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        onClick={() => void vocalize()}
        disabled={disabled || pending || !text.trim()}
        className="inline-flex items-center gap-1 self-start rounded-lg border border-primary/40 bg-primary/5 px-2.5 py-1 text-xs font-semibold text-primary disabled:opacity-50"
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        {pending ? t('adding') : t('add')}
      </button>
      {error ? (
        <span role="alert" className="text-[11px] text-destructive">
          {error}
        </span>
      ) : null}
    </span>
  );
}
