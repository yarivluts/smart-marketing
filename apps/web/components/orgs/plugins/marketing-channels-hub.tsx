'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Plug,
  Sparkles,
  CheckCircle2,
  Copy,
  Check,
  Globe,
  Radio,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface MarketingConnector {
  id: string;
  name: string;
  category: 'ad_platform' | 'ecommerce' | 'pixel' | 'payments';
  status: 'connected' | 'ready' | 'pending';
  accountName?: string;
  eventVolumeToday: number;
  matchQualityScore?: string;
  badgeKey: string;
  descKey: string;
}

export function MarketingChannelsHub({
  orgId,
  projectId,
  projectName,
}: {
  orgId: string;
  projectId: string;
  projectName: string;
}) {
  const t = useTranslations('MarketingChannels');

  const [copiedSnippet, setCopiedSnippet] = useState<boolean>(false);
  const connectors: MarketingConnector[] = [
    {
      id: 'conn-google',
      name: 'Google Ads',
      category: 'ad_platform',
      status: 'connected',
      accountName: 'EasySign Search & PMax (ID: 412-882-9011)',
      eventVolumeToday: 1420,
      matchQualityScore: '9.2 / 10',
      badgeKey: 'badgeEnhancedConversions',
      descKey: 'descGoogleAds',
    },
    {
      id: 'conn-meta',
      name: 'Meta Ads (Facebook & Instagram)',
      category: 'ad_platform',
      status: 'connected',
      accountName: 'EasySign Meta Pixel & CAPI (ID: 98124018)',
      eventVolumeToday: 2180,
      matchQualityScore: '8.9 / 10',
      badgeKey: 'badgeConversionsApi',
      descKey: 'descMetaAds',
    },
    {
      id: 'conn-tiktok',
      name: 'TikTok Ads',
      category: 'ad_platform',
      status: 'ready',
      eventVolumeToday: 0,
      badgeKey: 'badgeEventsApi',
      descKey: 'descTikTokAds',
    },
    {
      id: 'conn-stripe',
      name: 'Stripe / Credit Card Ingest',
      category: 'payments',
      status: 'connected',
      accountName: 'EasySign Production Ingest',
      eventVolumeToday: 384,
      badgeKey: 'badgeRealtimeBilling',
      descKey: 'descStripe',
    },
    {
      id: 'conn-ecommerce',
      name: 'Shopify / WooCommerce / EasySign Store',
      category: 'ecommerce',
      status: 'connected',
      accountName: 'EasySign Checkout Engine',
      eventVolumeToday: 912,
      badgeKey: 'badgeAutoCartCapture',
      descKey: 'descEcommerceStore',
    },
  ];

  const trackingSnippetCode = `<script>
  !function(w,d,s,g,r){w[g]=w[g]||function(){(w[g].q=w[g].q||[]).push(arguments)};
  r=d.createElement(s);r.async=1;r.src="https://api-preprod-1098891924957.me-west1.run.app/v1/pixel.js";
  d.head.appendChild(r);}(window,document,"script","growthos");
  growthos("init", "${orgId}", "${projectId}");
  growthos("pageview");
</script>`;

  const handleCopySnippet = () => {
    navigator.clipboard.writeText(trackingSnippetCode);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 rounded-3xl border border-border bg-card p-6 shadow-sm sm:flex-row sm:items-center">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Plug className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-foreground">
                {t('pageHeading', { projectName })}
              </h1>
              <p className="text-xs text-muted-foreground">{t('pageSubtitle')}</p>
            </div>
          </div>
        </div>

        {/* Global Match Quality Health */}
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-300">
          <ShieldCheck className="h-4 w-4 text-emerald-500" />
          <span>{t('capiHealthOptimal')}</span>
        </div>
      </div>

      {/* Website Tracking Snippet Box (Zero-Config Pixel) */}
      <div className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-base font-bold text-foreground">{t('trackingSnippetHeading')}</h2>
              <p className="text-xs text-muted-foreground">{t('trackingSnippetSubtitle')}</p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={handleCopySnippet}
            className="rounded-xl gap-1.5 text-xs font-bold"
          >
            {copiedSnippet ? (
              <>
                <Check className="h-3.5 w-3.5" />
                <span>{t('snippetCopiedBtn')}</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span>{t('copySnippetBtn')}</span>
              </>
            )}
          </Button>
        </div>

        <div className="rounded-2xl border border-border bg-muted/60 p-4 font-mono text-xs text-muted-foreground overflow-x-auto">
          <code>{trackingSnippetCode}</code>
        </div>
      </div>

      {/* Marketing Ad Channels & Connectors Grid */}
      <div className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-indigo-500" />
            <div>
              <h2 className="text-base font-bold text-foreground">{t('connectedChannelsHeading')}</h2>
              <p className="text-xs text-muted-foreground">{t('connectedChannelsSubtitle')}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {connectors.map((conn) => {
            const isConnected = conn.status === 'connected';

            return (
              <div
                key={conn.id}
                className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-background p-5 shadow-xs transition-all hover:border-primary/40 hover:shadow-soft"
              >
                {/* Connector Header */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-base font-bold text-foreground">{conn.name}</span>
                    <div
                      className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                        isConnected
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {isConnected ? (
                        <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                      ) : (
                        <Radio className="h-3 w-3" />
                      )}
                      <span>{t(`status_${conn.status}` as Parameters<typeof t>[0])}</span>
                    </div>
                  </div>

                  <span className="text-xs text-muted-foreground">
                    {t(conn.descKey as Parameters<typeof t>[0])}
                  </span>

                  {conn.accountName && (
                    <span className="text-[11px] font-semibold text-primary">
                      {conn.accountName}
                    </span>
                  )}
                </div>

                {/* Performance & Match Quality */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3 text-xs">
                  <div className="flex items-center gap-1 font-semibold text-muted-foreground">
                    <span>{t('eventsTodayLabel')}{':'}</span>
                    <span className="font-bold text-foreground">
                      {conn.eventVolumeToday.toLocaleString()}
                    </span>
                  </div>

                  {conn.matchQualityScore && (
                    <div className="flex items-center gap-1 font-semibold text-muted-foreground">
                      <span>{t('matchQualityScoreLabel')}{':'}</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">
                        {conn.matchQualityScore}
                      </span>
                    </div>
                  )}

                  <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-bold text-foreground">
                    {t(conn.badgeKey as Parameters<typeof t>[0])}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
