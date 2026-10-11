'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CodeBlockProps {
  code: string;
  /** Translated label shown above the code, e.g. "Terminal" or "TypeScript". */
  label: string;
  className?: string;
}

/**
 * A code sample: always left-to-right (also inside the Hebrew UI), horizontally scrollable on a
 * phone, with a copy button. The text is exactly what the guide's tests run.
 */
export function CodeBlock({ code, label, className }: CodeBlockProps): React.ReactElement {
  const t = useTranslations('Developers.common');
  const [copied, setCopied] = useState(false);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <figure className={cn('min-w-0 overflow-hidden rounded-2xl bg-pp-obsidian text-white shadow-pp-candy', className)}>
      <figcaption className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2">
        <span className="text-pp-label-sm uppercase tracking-wider text-white/60">{label}</span>
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-pp-label-sm text-white/80 hover:bg-white/10 hover:text-white"
        >
          {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
          {copied ? t('copied') : t('copy')}
        </button>
      </figcaption>
      <pre dir="ltr" className="overflow-x-auto p-4 text-left text-[13px] leading-relaxed">
        <code className="font-mono">{code}</code>
      </pre>
    </figure>
  );
}
