'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

export interface MintedHookSigningSecretDisplayProps {
  hookUrl: string;
  rawSigningSecret: string;
  onDismiss: () => void;
}

/**
 * Shows a newly minted `hmac_sha256` hook endpoint's URL and raw signing secret exactly once
 * (KAN-53) — the same "copy-once" pattern `MintedApiKeyDisplay` established for KAN-30, since
 * `HookEndpointModel` only ever persists the secret envelope-encrypted (see
 * `hook-endpoint.service.ts`) and can never show it again after this.
 */
export function MintedHookSigningSecretDisplay({
  hookUrl,
  rawSigningSecret,
  onDismiss,
}: MintedHookSigningSecretDisplayProps): React.ReactElement {
  const t = useTranslations('Hooks');
  const [copied, setCopied] = useState(false);

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(rawSigningSecret);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div data-testid="minted-hook-signing-secret-display" className="flex flex-col gap-3 rounded-md border border-input bg-muted/50 p-4">
      <p className="text-sm font-medium">{t('secretShownOnceWarning')}</p>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">{t('hookUrlLabel')}</span>
        <code className="break-all rounded-md bg-background p-3 text-sm">{hookUrl}</code>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">{t('signingSecretLabel')}</span>
        <code data-testid="minted-hook-signing-secret-value" className="break-all rounded-md bg-background p-3 text-sm">
          {rawSigningSecret}
        </code>
      </div>
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
