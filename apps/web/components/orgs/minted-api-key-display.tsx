'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

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
    <div className="flex flex-col gap-3 rounded-md border border-input bg-muted/50 p-4">
      <p className="text-sm font-medium">{t('secretShownOnceWarning')}</p>
      <code data-testid="minted-api-key-value" className="break-all rounded-md bg-background p-3 text-sm">
        {rawKey}
      </code>
      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
          {copied ? t('copied') : t('copySecret')}
        </Button>
        <Button type="button" size="sm" onClick={onDismiss}>
          {t('done')}
        </Button>
      </div>
    </div>
  );
}
