'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { RefreshCw } from 'lucide-react';

/** Shown when the saved version changed elsewhere while this editor holds unsaved edits. */
export function ServerChangedNotice({ onReload }: { onReload: () => void }): React.ReactElement {
  const t = useTranslations('AdStudio');
  return (
    <div role="status" className="flex flex-wrap items-center gap-2 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-sm" data-testid="ad-studio-server-changed">
      <span>{t('editing.changedElsewhere')}</span>
      <button type="button" onClick={onReload} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-semibold">
        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
        {t('editing.loadSaved')}
      </button>
    </div>
  );
}
