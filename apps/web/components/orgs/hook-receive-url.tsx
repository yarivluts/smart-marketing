'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { PpButton } from '@/components/pastel/primitives';
import { Copy, Check } from 'lucide-react';

export interface HookReceiveUrlProps {
  hookApiBaseUrl: string;
  hookId: string;
}

/** The full, always-redisplayable receive URL for one hook endpoint (KAN-53). */
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
      <code className="break-all rounded-xl bg-pp-surface-container px-3 py-1.5 font-mono text-xs text-pp-on-surface select-all">
        {url}
      </code>
      <PpButton
        type="button"
        variant="secondary"
        size="sm"
        icon={copied ? Check : Copy}
        onClick={handleCopy}
      >
        {copied ? t('copied') : t('copyReceiveUrl')}
      </PpButton>
    </div>
  );
}
