'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

export interface HookReceiveUrlProps {
  hookApiBaseUrl: string;
  hookId: string;
}

/** The full, always-redisplayable receive URL for one hook endpoint (KAN-53) — "point your webhook here". Not a one-time secret like an API key's raw value: `hook_id` is stored (and re-shown) in plaintext so an admin can always re-copy it. */
export function HookReceiveUrl({ hookApiBaseUrl, hookId }: HookReceiveUrlProps): React.ReactElement {
  const t = useTranslations('Hooks');
  const [copied, setCopied] = useState(false);
  const url = `${hookApiBaseUrl}/${hookId}`;

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="break-all rounded-md bg-muted/50 px-2 py-1 text-xs">{url}</code>
      <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
        {copied ? t('copied') : t('copyReceiveUrl')}
      </Button>
    </div>
  );
}
