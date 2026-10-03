'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { renderEmbedSnippet } from '@growthos/tracking-sdk';
import { Copy, Check, Code } from 'lucide-react';
import { PpButton } from '@/components/pastel/primitives';

export interface TouchpointSnippetDisplayProps {
  writeKey: string;
  ingestBaseUrl: string;
}

/**
 * The KAN-57 touchpoint-capture embed snippet for a just-minted `ingest.write`
 * key — shown alongside `MintedApiKeyDisplay` since the raw key is only ever
 * available in that same "copy-once" moment (`listApiKeysForProject` never
 * returns it again). Pasting this `<script>` tag into a site captures
 * UTM/click-ids at entry and attaches them to every event the tracker sends.
 */
export function TouchpointSnippetDisplay({ writeKey, ingestBaseUrl }: TouchpointSnippetDisplayProps): React.ReactElement {
  const t = useTranslations('ApiKeys');
  const [copied, setCopied] = useState(false);
  const snippet = useMemo(() => renderEmbedSnippet({ writeKey, ingestBaseUrl }), [writeKey, ingestBaseUrl]);

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-pp-outline-variant/30 bg-pp-surface-container-low p-5 shadow-pp-candy">
      <div className="flex items-center gap-2">
        <Code className="w-5 h-5 text-pp-secondary" />
        <p className="text-pp-body-md font-bold text-pp-on-surface">{t('touchpointSnippetHeading')}</p>
      </div>
      <p className="text-pp-body-sm text-pp-on-surface-variant">{t('touchpointSnippetIntro')}</p>
      <pre className="max-h-64 overflow-auto rounded-xl bg-pp-inverse-surface p-4 text-xs font-mono text-pp-inverse-on-surface">
        <code>{snippet}</code>
      </pre>
      <div className="pt-1">
        <PpButton
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleCopy}
          icon={copied ? Check : Copy}
        >
          {copied ? t('copied') : t('copySnippet')}
        </PpButton>
      </div>
    </div>
  );
}
