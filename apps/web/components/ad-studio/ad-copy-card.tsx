'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Pencil, Sparkles } from 'lucide-react';
import { AD_STUDIO_COPY_FIELDS, AD_STUDIO_COPY_LIMITS, adCopyIssues, isAdCopyEmpty, type AdStudioAdCopy } from '@growthos/shared';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { useAdStudioErrorMessage, type AdStudioApiError } from './use-ad-studio-error';

export interface AdCopyCardProps {
  orgId: string;
  projectId: string;
  briefId: string;
  /** "video" or the image idea id: what the copy belongs to. */
  copyKey: string;
  copy: AdStudioAdCopy | null;
  /** The creative shown between the primary text and the headline, as in the feed; omitted for text only. */
  media?: React.ReactNode;
  /** The name over the ad, like the page name in a feed. */
  advertiser: string;
  aiAvailable: boolean;
  /** Called with the saved copy after a save or an AI write. */
  onSaved?: (copy: AdStudioAdCopy | null) => void;
}

const EMPTY: AdStudioAdCopy = { headline: '', primaryText: '', description: '' };

/**
 * The ad as it will run (KAN-278): primary text above the creative, then the headline and the
 * description, the way a feed shows it - an image or a clip alone does not carry the message. The
 * person edits the words in place or has the AI write them; copy never changes the creative itself.
 */
export function AdCopyCard({ orgId, projectId, briefId, copyKey, copy: initialCopy, media, advertiser, aiAvailable, onSaved }: AdCopyCardProps): React.ReactElement {
  const t = useTranslations('AdStudio.copy');
  const router = useRouter();
  const errorMessage = useAdStudioErrorMessage();
  const base = `/api/orgs/${orgId}/projects/${projectId}/ad-studio/briefs/${briefId}`;
  const [copy, setCopy] = React.useState(initialCopy);
  const [draft, setDraft] = React.useState<AdStudioAdCopy | null>(null);
  const [pending, setPending] = React.useState<'save' | 'write' | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  React.useEffect(() => setCopy(initialCopy), [initialCopy]);

  /** The copy of this creative in a returned brief. */
  function copyIn(brief: { videoCopy: AdStudioAdCopy | null; imageConcepts: { id: string; copy?: AdStudioAdCopy }[] }): AdStudioAdCopy | null {
    return copyKey === 'video' ? brief.videoCopy : (brief.imageConcepts.find((concept) => concept.id === copyKey)?.copy ?? null);
  }

  async function send(kind: 'save' | 'write', path: string, body: unknown): Promise<void> {
    setPending(kind);
    setMessage(null);
    try {
      const response = await fetch(`${base}${path}`, { method: kind === 'save' ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = (await response.json().catch(() => ({}))) as AdStudioApiError & { brief?: { videoCopy: AdStudioAdCopy | null; imageConcepts: { id: string; copy?: AdStudioAdCopy }[] } };
      if (!response.ok || !result.brief) {
        setMessage(errorMessage(result));
        return;
      }
      const saved = copyIn(result.brief);
      setCopy(saved);
      setDraft(null);
      onSaved?.(saved);
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  function save(): void {
    if (!draft) return;
    const value = isAdCopyEmpty(draft) ? null : draft;
    void send('save', '/copy', copyKey === 'video' ? { videoCopy: value } : { conceptCopies: { [copyKey]: value } });
  }

  const issues = draft ? adCopyIssues(draft) : [];
  const fieldLabel = { headline: t('headline'), primaryText: t('primaryText'), description: t('description') } as const;

  return (
    <div className="flex flex-col gap-2" data-testid={`ad-studio-copy-${copyKey}`}>
      <div className="overflow-hidden rounded-xl border border-border bg-background shadow-sm">
        <div className="flex items-center gap-2 px-3 pt-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary" aria-hidden="true">
            {advertiser.trim().charAt(0).toUpperCase()}
          </span>
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-xs font-semibold" dir="auto">
              {advertiser}
            </span>
            <span className="text-[10px] text-muted-foreground">{t('sponsored')}</span>
          </span>
        </div>
        <p className={cn('px-3 py-2 text-sm', !copy?.primaryText && 'italic text-muted-foreground')} dir="auto" data-testid="ad-studio-copy-primary">
          {copy?.primaryText || t('missingPrimary')}
        </p>
        {media ? <div className="bg-muted">{media}</div> : null}
        <div className="flex items-center justify-between gap-3 bg-muted/40 px-3 py-2">
          <div className="flex min-w-0 flex-col">
            <span className={cn('truncate text-sm font-semibold', !copy?.headline && 'italic text-muted-foreground')} dir="auto" data-testid="ad-studio-copy-headline">
              {copy?.headline || t('missingHeadline')}
            </span>
            {copy?.description ? (
              <span className="truncate text-xs text-muted-foreground" dir="auto">
                {copy.description}
              </span>
            ) : null}
          </div>
          <span className="shrink-0 rounded-md bg-muted px-2.5 py-1 text-xs font-semibold" aria-hidden="true">
            {t('cta')}
          </span>
        </div>
      </div>

      {draft ? (
        <div className="flex flex-col gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3" data-testid="ad-studio-copy-editor">
          {AD_STUDIO_COPY_FIELDS.map((field) => (
            <label key={field} className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              <span className="flex justify-between">
                {fieldLabel[field]}
                <span className={cn('tabular-nums', draft[field].length > AD_STUDIO_COPY_LIMITS[field] && 'text-destructive')}>
                  {draft[field].length}/{AD_STUDIO_COPY_LIMITS[field]}
                </span>
              </span>
              {field === 'primaryText' ? (
                <textarea rows={2} value={draft[field]} onChange={(event) => setDraft({ ...draft, [field]: event.target.value })} dir="auto" className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground" />
              ) : (
                <input value={draft[field]} onChange={(event) => setDraft({ ...draft, [field]: event.target.value })} dir="auto" className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground" />
              )}
            </label>
          ))}
          {issues.length ? <p className="text-xs text-destructive">{issues.map((code) => t(`issue.${code}`)).join(' · ')}</p> : null}
          <div className="flex gap-2">
            <button type="button" onClick={save} disabled={pending !== null || issues.length > 0} className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60">
              {pending === 'save' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
              {t('save')}
            </button>
            <button type="button" onClick={() => setDraft(null)} className="rounded-lg border border-border px-3 py-1.5 text-xs">
              {t('cancel')}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setDraft({ ...EMPTY, ...(copy ?? {}) })} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs hover:bg-muted">
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            {t('edit')}
          </button>
          <button
            type="button"
            onClick={() => void send('write', '/copy/generate', { keys: [copyKey], rewrite: true })}
            disabled={!aiAvailable || pending !== null}
            className="inline-flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/5 px-2.5 py-1 text-xs font-semibold text-primary disabled:opacity-50"
          >
            {pending === 'write' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />}
            {copy ? t('rewrite') : t('write')}
          </button>
        </div>
      )}
      {message ? (
        <p role="alert" className="text-xs text-destructive">
          {message}
        </p>
      ) : null}
    </div>
  );
}
