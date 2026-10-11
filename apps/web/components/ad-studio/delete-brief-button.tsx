'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Trash2 } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';

/** Deletes an ad after an inline confirmation (the viewer's frame may not show browser dialogs). */
export function DeleteBriefButton({ orgId, projectId, briefId, afterDeleteHref }: { orgId: string; projectId: string; briefId: string; afterDeleteHref: string }): React.ReactElement {
  const t = useTranslations('AdStudio');
  const router = useRouter();
  const [confirming, setConfirming] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  async function remove(): Promise<void> {
    setPending(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/ad-studio/briefs/${briefId}`, { method: 'DELETE' });
      if (response.ok) router.push(afterDeleteHref);
    } finally {
      setPending(false);
    }
  }

  if (confirming) {
    return (
      <span className="flex items-center gap-2 text-sm" role="alertdialog" aria-label={t('deleteConfirm')}>
        <span>{t('deleteConfirm')}</span>
        <button type="button" onClick={remove} disabled={pending} className="rounded-lg bg-destructive px-2.5 py-1 text-xs font-semibold text-destructive-foreground disabled:opacity-60">
          {t('deleteAd')}
        </button>
        <button type="button" onClick={() => setConfirming(false)} className="rounded-lg border border-border px-2.5 py-1 text-xs">
          {t('cancel')}
        </button>
      </span>
    );
  }
  return (
    <button type="button" onClick={() => setConfirming(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10">
      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
      {t('deleteAd')}
    </button>
  );
}
