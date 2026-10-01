'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { ImagePlus, Loader2, Pencil, Sparkles, Trash2, Upload } from 'lucide-react';
import { AD_STUDIO_REFERENCE_DESCRIPTION_MAX, AD_STUDIO_REFERENCE_LABEL_MAX } from '@growthos/shared';
import { useRouter } from '@/i18n/navigation';
import type { AdStudioReferenceView } from '@/lib/ad-studio/engine';
import { cn } from '@/lib/utils';
import { useAdStudioErrorMessage, type AdStudioApiError } from './use-ad-studio-error';

export interface ReferenceLibraryProps {
  orgId: string;
  projectId: string;
  briefId: string;
  initialReferences: AdStudioReferenceView[];
  /** An image model is configured, so illustrations can be drawn. */
  illustrationAvailable: boolean;
}

type Mode = 'upload' | 'illustration';

const ASPECT_RATIOS = ['16:9', '9:16', '1:1', '4:5'] as const;

/**
 * The ad's reference images (KAN-243): real app screenshots and AI illustrations that scenes hand
 * to the video model, so a clip shows the real product. Upload one or draw an illustration; rename, describe or delete it here, and attach it to scenes in the script.
 */
export function ReferenceLibrary({ orgId, projectId, briefId, initialReferences, illustrationAvailable }: ReferenceLibraryProps): React.ReactElement {
  const t = useTranslations('AdStudio.references');
  const router = useRouter();
  const errorMessage = useAdStudioErrorMessage();
  const base = `/api/orgs/${orgId}/projects/${projectId}/ad-studio/briefs/${briefId}/references`;
  const [references, setReferences] = React.useState(initialReferences);
  const [mode, setMode] = React.useState<Mode | null>(null);
  const [label, setLabel] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [file, setFile] = React.useState<File | null>(null);
  const [prompt, setPrompt] = React.useState('');
  const [aspectRatio, setAspectRatio] = React.useState<(typeof ASPECT_RATIOS)[number]>('16:9');
  const [pending, setPending] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<{ id: string; label: string; description: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<string | null>(null);

  React.useEffect(() => setReferences(initialReferences), [initialReferences]);

  function open(next: Mode): void {
    setMode(mode === next ? null : next);
    setMessage(null);
  }

  async function add(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!mode) return;
    setPending(true);
    setMessage(null);
    try {
      let response: Response;
      if (mode === 'upload') {
        if (!file) return;
        const form = new FormData();
        form.set('file', file);
        form.set('label', label);
        form.set('description', description);
        response = await fetch(base, { method: 'POST', body: form });
      } else {
        response = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: 'illustration', prompt, aspectRatio, label, description }) });
      }
      const result = (await response.json().catch(() => ({}))) as AdStudioApiError & { reference?: AdStudioReferenceView };
      if (!response.ok || !result.reference) {
        setMessage(errorMessage(result));
        return;
      }
      setReferences((current) => [result.reference as AdStudioReferenceView, ...current]);
      setMode(null);
      setLabel('');
      setDescription('');
      setFile(null);
      setPrompt('');
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function saveEdit(): Promise<void> {
    if (!editing) return;
    const response = await fetch(`${base}/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label: editing.label, description: editing.description }) });
    const result = (await response.json().catch(() => ({}))) as AdStudioApiError & { reference?: AdStudioReferenceView };
    if (!response.ok || !result.reference) {
      setMessage(errorMessage(result));
      return;
    }
    setReferences((current) => current.map((entry) => (entry.id === editing.id ? (result.reference as AdStudioReferenceView) : entry)));
    setEditing(null);
    router.refresh();
  }

  async function remove(id: string): Promise<void> {
    setConfirmDelete(null);
    const response = await fetch(`${base}/${id}`, { method: 'DELETE' });
    if (!response.ok) {
      setMessage(errorMessage((await response.json().catch(() => ({}))) as AdStudioApiError));
      return;
    }
    setReferences((current) => current.filter((entry) => entry.id !== id));
    router.refresh();
  }

  const modes: { id: Mode; icon: typeof Upload; available: boolean }[] = [
    { id: 'upload', icon: Upload, available: true },
    { id: 'illustration', icon: Sparkles, available: illustrationAvailable },
  ];
  const inputClass = 'h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground';

  return (
    <section className="flex flex-col gap-4" aria-labelledby="ad-studio-references-heading" data-testid="ad-studio-references">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex max-w-2xl flex-col gap-1">
          <h2 id="ad-studio-references-heading" className="flex items-center gap-2 text-lg font-semibold">
            <ImagePlus className="h-5 w-5 text-primary" aria-hidden="true" />
            {t('title')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('description')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {modes.map(({ id, icon: Icon, available }) => (
            <button
              key={id}
              type="button"
              onClick={() => open(id)}
              disabled={!available}
              title={available ? undefined : t(`unavailable.${id}`)}
              aria-pressed={mode === id}
              className={cn('inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm disabled:opacity-50', mode === id ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted')}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {t(`add.${id}`)}
            </button>
          ))}
        </div>
      </div>

      {mode ? (
        <form onSubmit={add} className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4" data-testid="ad-studio-reference-form">
          {mode === 'upload' ? (
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              {t('fileLabel')}
              <input type="file" accept="image/png,image/jpeg" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="text-sm text-foreground" />
              <span className="font-normal">{t('fileHint')}</span>
            </label>
          ) : null}
          {mode === 'illustration' ? (
            <div className="flex flex-wrap gap-3">
              <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">
                {t('promptLabel')}
                <textarea required rows={2} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={t('promptPlaceholder')} dir="auto" className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground" />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                {t('aspectLabel')}
                <select value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value as (typeof ASPECT_RATIOS)[number])} className={inputClass}>
                  {ASPECT_RATIOS.map((ratio) => (
                    <option key={ratio} value={ratio}>
                      {ratio}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}
          <div className="grid gap-3 md:grid-cols-[16rem_1fr]">
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              {t('labelLabel')}
              <input required maxLength={AD_STUDIO_REFERENCE_LABEL_MAX} value={label} onChange={(event) => setLabel(event.target.value)} dir="auto" className={inputClass} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              {t('descriptionLabel')}
              <input maxLength={AD_STUDIO_REFERENCE_DESCRIPTION_MAX} value={description} onChange={(event) => setDescription(event.target.value)} placeholder={t('descriptionPlaceholder')} dir="auto" className={inputClass} />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button type="submit" disabled={pending || (mode === 'upload' && !file)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              {pending ? t(`working.${mode}`) : t(`submit.${mode}`)}
            </button>
            <button type="button" onClick={() => setMode(null)} className="h-9 rounded-lg border border-border px-3 text-sm">
              {t('cancel')}
            </button>
          </div>
        </form>
      ) : null}

      {message ? (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      ) : null}

      {references.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {references.map((reference) => (
            <li key={reference.id} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3" data-testid="ad-studio-reference">
              <div className="flex aspect-video items-center justify-center overflow-hidden rounded-lg bg-muted">
                {reference.status === 'ready' ? (
                  <img src={`${base}/${reference.id}/media`} alt={reference.label} className="h-full w-full object-contain" />
                ) : (
                  <span className="text-xs text-muted-foreground">{t(`status.${reference.status}`)}</span>
                )}
              </div>
              {editing?.id === reference.id ? (
                <div className="flex flex-col gap-2">
                  <input aria-label={t('labelLabel')} maxLength={AD_STUDIO_REFERENCE_LABEL_MAX} value={editing.label} onChange={(event) => setEditing({ ...editing, label: event.target.value })} dir="auto" className={inputClass} />
                  <input aria-label={t('descriptionLabel')} maxLength={AD_STUDIO_REFERENCE_DESCRIPTION_MAX} value={editing.description} onChange={(event) => setEditing({ ...editing, description: event.target.value })} dir="auto" className={inputClass} />
                  <div className="flex gap-2">
                    <button type="button" onClick={saveEdit} className="rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                      {t('save')}
                    </button>
                    <button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-border px-3 py-1 text-xs">
                      {t('cancel')}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-sm font-semibold" dir="auto">
                      {reference.label}
                    </span>
                    <span className="text-xs text-muted-foreground">{t(`source.${reference.source}`)}</span>
                    {reference.description ? (
                      <span className="text-xs text-muted-foreground" dir="auto">
                        {reference.description}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button type="button" onClick={() => setEditing({ id: reference.id, label: reference.label, description: reference.description })} className="rounded-lg p-1.5 hover:bg-muted" aria-label={t('edit')}>
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </button>
                    {confirmDelete === reference.id ? (
                      <button type="button" onClick={() => remove(reference.id)} className="rounded-lg bg-destructive px-2 py-1 text-xs font-semibold text-destructive-foreground">
                        {t('confirmDelete')}
                      </button>
                    ) : (
                      <button type="button" onClick={() => setConfirmDelete(reference.id)} className="rounded-lg p-1.5 text-destructive hover:bg-destructive/10" aria-label={t('delete')}>
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
