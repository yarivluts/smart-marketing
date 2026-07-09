'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { renderEmbedSnippet } from '@growthos/tracking-sdk';
import { Button } from '@/components/ui/button';

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
  const snippet = renderEmbedSnippet({ writeKey, ingestBaseUrl });

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-input bg-muted/50 p-4">
      <p className="text-sm font-medium">{t('touchpointSnippetHeading')}</p>
      <p className="text-sm text-muted-foreground">{t('touchpointSnippetIntro')}</p>
      <pre className="max-h-64 overflow-auto rounded-md bg-background p-3 text-xs">
        <code>{snippet}</code>
      </pre>
      <Button type="button" variant="outline" size="sm" onClick={handleCopy} className="self-start">
        {copied ? t('copied') : t('copySnippet')}
      </Button>
    </div>
  );
}
