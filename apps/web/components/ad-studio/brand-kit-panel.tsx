'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Palette, Plus, X } from 'lucide-react';
import { AD_STUDIO_BRAND_LIMITS, validateAdStudioBrandKit, type AdStudioBrandKit } from '@growthos/shared';
import { useRouter } from '@/i18n/navigation';

const inputClass = 'rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground';

/**
 * The project's brand kit: the name as ads must write it, the tone of voice, words never to use and
 * the brand colours. Every Ad Studio prompt follows it. Editable with `project.configure`; everyone
 * else who can use the studio sees what the ads follow.
 */
export function BrandKitPanel({
  orgId,
  projectId,
  initial,
  canEdit,
  logoUrl = null,
}: {
  orgId: string;
  projectId: string;
  initial: AdStudioBrandKit;
  canEdit: boolean;
  /** The current logo, or null without one. */
  logoUrl?: string | null;
}): React.ReactElement {
  const t = useTranslations('AdStudio.brand');
  const router = useRouter();
  const [kit, setKit] = React.useState<AdStudioBrandKit>(initial);
  const [saved, setSaved] = React.useState(JSON.stringify(initial));
  const [wordDraft, setWordDraft] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [message, setMessage] = React.useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const dirty = JSON.stringify(kit) !== saved;
  const issues = validateAdStudioBrandKit(kit);
  const logoEndpoint = `/api/orgs/${orgId}/projects/${projectId}/ad-studio/brand-kit/logo`;
  const [logoPending, setLogoPending] = React.useState(false);

  async function changeLogo(file: File | null): Promise<void> {
    setLogoPending(true);
    setMessage(null);
    try {
      const form = new FormData();
      if (file) form.append('file', file);
      const response = await fetch(logoEndpoint, file ? { method: 'POST', body: form } : { method: 'DELETE' });
      const body = (await response.json().catch(() => ({}))) as { code?: string };
      if (!response.ok) {
        setMessage({ tone: 'error', text: body.code === 'image_too_large' ? t('logoTooLarge') : body.code === 'unsupported_image' ? t('logoUnsupported') : t('saveFailed') });
        return;
      }
      setMessage({ tone: 'ok', text: file ? t('logoSaved') : t('logoRemoved') });
      router.refresh();
    } catch {
      setMessage({ tone: 'error', text: t('saveFailed') });
    } finally {
      setLogoPending(false);
    }
  }

  function addWord(): void {
    const word = wordDraft.trim();
    if (!word || kit.avoidWords.includes(word)) return;
    setKit({ ...kit, avoidWords: [...kit.avoidWords, word] });
    setWordDraft('');
  }

  async function save(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/ad-studio/brand-kit`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandKit: kit }),
      });
      const body = (await response.json().catch(() => ({}))) as { brandKit?: AdStudioBrandKit; issues?: string[] };
      if (!response.ok || !body.brandKit) {
        setMessage({ tone: 'error', text: body.issues?.length ? body.issues.map((code) => t(`issue.${code}`)).join(' · ') : t('saveFailed') });
        return;
      }
      const next = { brandName: body.brandKit.brandName, toneOfVoice: body.brandKit.toneOfVoice, avoidWords: body.brandKit.avoidWords, colors: body.brandKit.colors };
      setKit(next);
      setSaved(JSON.stringify(next));
      setMessage({ tone: 'ok', text: t('saved') });
      router.refresh();
    } catch {
      setMessage({ tone: 'error', text: t('saveFailed') });
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm" aria-labelledby="ad-studio-brand-heading" data-testid="ad-studio-brand-kit">
      <header className="flex items-start gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Palette className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <h2 id="ad-studio-brand-heading" className="text-base font-semibold">
            {t('title')}
          </h2>
          <p className="text-xs text-muted-foreground">{t('description')}</p>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3" data-testid="ad-studio-brand-logo">
        <span className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border border-border bg-white">
          {logoUrl ? <img src={logoUrl} alt={t('logo')} className="h-full w-full object-contain" /> : <span className="text-xs text-muted-foreground">{t('noLogo')}</span>}
        </span>
        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{t('logo')}</span>
          <span>{t('logoHint')}</span>
          {canEdit ? (
            <span className="flex flex-wrap gap-2">
              <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-border px-2.5 py-1 font-medium text-foreground hover:bg-muted">
                {logoPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
                {logoUrl ? t('replaceLogo') : t('uploadLogo')}
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  className="sr-only"
                  disabled={logoPending}
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    event.target.value = '';
                    if (file) void changeLogo(file);
                  }}
                />
              </label>
              {logoUrl ? (
                <button type="button" onClick={() => void changeLogo(null)} disabled={logoPending} className="rounded-lg border border-border px-2.5 py-1 font-medium text-foreground hover:bg-muted disabled:opacity-50">
                  {t('removeLogo')}
                </button>
              ) : null}
            </span>
          ) : null}
        </div>
      </div>

      <form onSubmit={save} className="flex flex-col gap-3">
        <fieldset disabled={!canEdit} className="grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            {t('brandName')}
            <input value={kit.brandName} onChange={(event) => setKit({ ...kit, brandName: event.target.value })} maxLength={AD_STUDIO_BRAND_LIMITS.brandName} dir="auto" className={inputClass} />
            <span className="font-normal">{t('brandNameHint')}</span>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            {t('toneOfVoice')}
            <textarea
              value={kit.toneOfVoice}
              onChange={(event) => setKit({ ...kit, toneOfVoice: event.target.value })}
              maxLength={AD_STUDIO_BRAND_LIMITS.toneOfVoice}
              rows={2}
              dir="auto"
              placeholder={t('toneOfVoicePlaceholder')}
              className={inputClass}
            />
          </label>
          <div className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            <label htmlFor="ad-studio-brand-avoid">{t('avoidWords')}</label>
            <div className="flex gap-2">
              <input
                id="ad-studio-brand-avoid"
                value={wordDraft}
                onChange={(event) => setWordDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addWord();
                  }
                }}
                maxLength={AD_STUDIO_BRAND_LIMITS.avoidWord}
                dir="auto"
                className={`${inputClass} min-w-0 flex-1`}
              />
              <button type="button" onClick={addWord} disabled={!wordDraft.trim() || kit.avoidWords.length >= AD_STUDIO_BRAND_LIMITS.avoidWords} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 text-xs disabled:opacity-50">
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                {t('add')}
              </button>
            </div>
            <ul className="flex flex-wrap gap-1.5" aria-label={t('avoidWords')}>
              {kit.avoidWords.map((word) => (
                <li key={word} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs text-foreground">
                  <span dir="auto">{word}</span>
                  {canEdit ? (
                    <button type="button" onClick={() => setKit({ ...kit, avoidWords: kit.avoidWords.filter((entry) => entry !== word) })} aria-label={t('remove', { item: word })}>
                      <X className="h-3 w-3" aria-hidden="true" />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            <span>{t('colors')}</span>
            <div className="flex flex-wrap items-center gap-2">
              {kit.colors.map((color, index) => (
                <span key={`${color}-${index}`} className="inline-flex items-center gap-1 rounded-lg border border-border px-1.5 py-1">
                  <input
                    type="color"
                    value={color}
                    onChange={(event) => setKit({ ...kit, colors: kit.colors.map((entry, at) => (at === index ? event.target.value.toLowerCase() : entry)) })}
                    aria-label={t('colorLabel', { index: index + 1 })}
                    className="h-7 w-7 cursor-pointer rounded border-0 bg-transparent p-0"
                  />
                  <span className="font-mono text-[11px] text-foreground" dir="ltr">
                    {color}
                  </span>
                  {canEdit ? (
                    <button type="button" onClick={() => setKit({ ...kit, colors: kit.colors.filter((_, at) => at !== index) })} aria-label={t('remove', { item: color })}>
                      <X className="h-3 w-3" aria-hidden="true" />
                    </button>
                  ) : null}
                </span>
              ))}
              {canEdit && kit.colors.length < AD_STUDIO_BRAND_LIMITS.colors ? (
                <button type="button" onClick={() => setKit({ ...kit, colors: [...kit.colors, '#5b4fe9'] })} className="inline-flex items-center gap-1 rounded-lg border border-dashed border-border px-2.5 py-1.5 text-xs">
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  {t('addColor')}
                </button>
              ) : null}
            </div>
          </div>
        </fieldset>
        {issues.length ? <p className="text-xs text-destructive">{issues.map((code) => t(`issue.${code}`)).join(' · ')}</p> : null}
        {canEdit ? (
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={pending || !dirty || issues.length > 0} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              {t('save')}
            </button>
            {message ? (
              <span role="status" className={message.tone === 'ok' ? 'text-sm text-success' : 'text-sm text-destructive'}>
                {message.text}
              </span>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{t('readOnly')}</p>
        )}
      </form>
    </section>
  );
}
