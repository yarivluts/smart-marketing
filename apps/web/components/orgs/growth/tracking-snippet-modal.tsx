'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { Code, Copy, Check, ExternalLink, X } from 'lucide-react';

export interface TrackingSnippetModalProps {
  orgId: string;
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function TrackingSnippetModal({
  orgId,
  projectId,
  isOpen,
  onClose,
}: TrackingSnippetModalProps): React.ReactElement | null {
  const t = useTranslations('GrowthDashboard');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const snippetCode = `<!-- GrowthOS Marketing & Conversion Tracker -->\n<script\n  src="https://api.growthos.io/v1/sdk.js"\n  data-org="${orgId}"\n  data-project="${projectId}"\n  async\n></script>`;

  async function handleCopy(): Promise<void> {
    await navigator.clipboard.writeText(snippetCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in"
    >
      <div className="relative w-full max-w-xl rounded-3xl border border-border bg-card p-6 sm:p-8 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 end-5 rounded-full p-2 text-muted-foreground hover:bg-muted transition-colors"
          aria-label={t('closeModal')}
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="rounded-xl bg-primary/10 p-2 text-primary">
              <Code className="h-5 w-5" aria-hidden="true" />
            </div>
            <h2 className="text-xl font-bold text-foreground">{t('trackingSnippetTitle')}</h2>
          </div>
          <p className="text-xs text-muted-foreground">{t('trackingSnippetSubtitle')}</p>
        </div>

        <div className="mt-6 flex flex-col gap-5">
          {/* Tracking Snippet Box */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">{t('websiteSnippetLabel')}</span>
              <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={handleCopy}>
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copied ? t('copiedButton') : t('copyCodeButton')}</span>
              </Button>
            </div>
            <pre className="overflow-x-auto rounded-xl bg-muted/80 p-3.5 text-xs font-mono text-foreground dir-ltr">
              {snippetCode}
            </pre>
            <p className="text-[11px] text-muted-foreground">{t('snippetInstruction')}</p>
          </div>

          {/* Connect Ad Networks */}
          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-muted/30 p-4">
            <span className="text-xs font-bold text-foreground">{t('connectAdAccountsTitle')}</span>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Link
                href={`/orgs/${orgId}/plugins`}
                className="flex items-center justify-between rounded-xl border border-border/80 bg-background p-3 text-xs font-semibold hover:border-primary/50 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-blue-500" />
                  {t('connectGoogleAds')}
                </span>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
              </Link>
              <Link
                href={`/orgs/${orgId}/plugins`}
                className="flex items-center justify-between rounded-xl border border-border/80 bg-background p-3 text-xs font-semibold hover:border-primary/50 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-indigo-600" />
                  {t('connectMetaAds')}
                </span>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <Button onClick={onClose} className="rounded-xl px-6">
            {t('doneButton')}
          </Button>
        </div>
      </div>
    </div>
  );
}
