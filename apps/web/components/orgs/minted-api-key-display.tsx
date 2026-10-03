'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Key, Copy, Check } from 'lucide-react';
import { PpButton, PpPill } from '@/components/pastel/primitives';

export interface MintedApiKeyDisplayProps {
  rawKey: string;
  onDismiss: () => void;
}

/**
 * Shows a newly minted key's raw secret exactly once (KAN-30's "copy-once"
 * requirement, mirroring `key.service.ts`'s own guarantee that the raw value
 * is never retrievable again after mint). Dismissing this component is
 * final — there is no way back to it without minting a fresh key.
 */
export function MintedApiKeyDisplay({ rawKey, onDismiss }: MintedApiKeyDisplayProps): React.ReactElement {
  const t = useTranslations('ApiKeys');
  const [copied, setCopied] = useState(false);

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(rawKey);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div
      data-testid="minted-api-key-display"
      className="flex flex-col gap-3 rounded-2xl border border-pp-outline-variant/30 bg-pp-surface-container-low p-5 shadow-pp-candy"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Key className="w-5 h-5 text-pp-primary" />
          <span className="text-pp-body-md font-bold text-pp-on-surface">{t('secretShownOnceWarning')}</span>
        </div>
        <PpPill accent="amber">{t('secretShownOnceWarning')}</PpPill>
      </div>

      <div className="rounded-xl bg-pp-inverse-surface p-4">
        <code data-testid="minted-api-key-value" className="break-all font-mono text-sm text-pp-inverse-on-surface">
          {rawKey}
        </code>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <PpButton
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleCopy}
          icon={copied ? Check : Copy}
        >
          {copied ? t('copied') : t('copySecret')}
        </PpButton>
        <PpButton type="button" variant="primary" size="sm" onClick={onDismiss}>
          {t('done')}
        </PpButton>
      </div>
    </div>
  );
}
