'use client';

import * as React from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileCode,
  Loader2,
  Mail,
  Play,
  Sparkles,
  Zap,
} from 'lucide-react';
import {
  METRIC_INGESTION_MAPPINGS,
  type GrowthOsMetricKey,
  type MetricIngestionRequirement,
} from '@growthos/shared';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { useIntegrationStatus } from '@/hooks/use-integration-status';
import { cn } from '@/lib/utils';

export interface MissingIntegrationAlertProps {
  orgId: string;
  projectId: string;
  metricKey?: GrowthOsMetricKey;
  connectorId?: string;
  requirement?: Partial<MetricIngestionRequirement>;
  customTitle?: string;
  customMissingPoints?: string[];
  customImpactMetrics?: string[];
  variant?: 'banner' | 'card_overlay' | 'inline_chip';
  onConnected?: (connectorId: string) => void;
  className?: string;
  isCompact?: boolean;
}

const CONNECTOR_DISPLAY_NAMES: Record<string, string> = {
  stripe: 'Stripe Billing & Subscriptions',
  google_ads: 'Google Ads',
  meta_ads: 'Meta Ads (Facebook & Instagram)',
  tiktok_ads: 'TikTok Ads',
  growthos_sdk: 'GrowthOS Web Telemetry SDK',
  hubspot: 'HubSpot CRM',
  salesforce: 'Salesforce CRM',
  chargebee: 'Chargebee',
  paddle: 'Paddle',
  recurly: 'Recurly',
  offline_csv: 'Manual Offline Spend CSV',
};

const CONNECTOR_DOCS_URLS: Record<string, string> = {
  stripe: 'https://docs.growthos.io/integrations/stripe-webhooks',
  google_ads: 'https://docs.growthos.io/integrations/google-ads',
  meta_ads: 'https://docs.growthos.io/integrations/meta-ads',
  tiktok_ads: 'https://docs.growthos.io/integrations/tiktok-ads',
  growthos_sdk: 'https://docs.growthos.io/sdks/javascript',
  hubspot: 'https://docs.growthos.io/integrations/hubspot',
  salesforce: 'https://docs.growthos.io/integrations/salesforce',
};

export function MissingIntegrationAlert({
  orgId,
  projectId,
  metricKey,
  connectorId: explicitConnectorId,
  requirement: explicitRequirement,
  customTitle,
  customMissingPoints,
  customImpactMetrics,
  variant = 'banner',
  onConnected,
  className,
  isCompact = false,
}: MissingIntegrationAlertProps): React.ReactElement | null {
  const { toast } = useToast();
  const { isConnectorActive, emitMockEvent } = useIntegrationStatus({
    orgId,
    projectId,
    metricKey,
  });

  const [isSendingMock, setIsSendingMock] = React.useState(false);
  const [isCopiedSnippet, setIsCopiedSnippet] = React.useState(false);
  const [isOAuthModalOpen, setIsOAuthModalOpen] = React.useState(false);
  const [isDeveloperGuideOpen, setIsDeveloperGuideOpen] = React.useState(false);
  const [isOAuthConnecting, setIsOAuthConnecting] = React.useState(false);
  const [apiKeyInput, setApiKeyInput] = React.useState('');

  // Derive metric requirement
  const mapping = metricKey ? METRIC_INGESTION_MAPPINGS[metricKey] : undefined;
  const targetConnectorId =
    explicitConnectorId ||
    explicitRequirement?.supportedConnectors?.[0] ||
    mapping?.supportedConnectors[0] ||
    'stripe';

  const isConnected = isConnectorActive(targetConnectorId);

  // If already connected and not forcing display, return connected banner or null for overlay
  const connectorName = CONNECTOR_DISPLAY_NAMES[targetConnectorId] || targetConnectorId;

  // Missing data points text
  const missingPoints: string[] = React.useMemo(() => {
    if (customMissingPoints && customMissingPoints.length > 0) {
      return customMissingPoints;
    }
    if (mapping) {
      const items: string[] = [];
      for (const fieldReq of mapping.requiredFields) {
        items.push(`${fieldReq.eventType.replace(/_/g, ' ')} stream (${fieldReq.fields.slice(0, 3).join(', ')})`);
      }
      return items.length > 0 ? items : [`Missing ${mapping.name} upstream events`];
    }
    return [`${connectorName} data stream not detected`];
  }, [customMissingPoints, mapping, connectorName]);

  // Affected metrics text
  const affectedMetrics: string[] = React.useMemo(() => {
    if (customImpactMetrics && customImpactMetrics.length > 0) {
      return customImpactMetrics;
    }
    if (mapping) {
      return [mapping.name];
    }
    return ['Executive KPIs', 'Conversion Analytics'];
  }, [customImpactMetrics, mapping]);

  const impactDescription =
    explicitRequirement?.missingImpactDescription ||
    mapping?.missingImpactDescription ||
    'Cannot accurately calculate conversion metrics without active data feeds.';

  const scriptSnippet = `<script src="https://cdn.growthos.io/growthos.js" data-project-id="${projectId}" async></script>`;

  const handleCopySnippet = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(scriptSnippet);
      setIsCopiedSnippet(true);
      toast({
        title: 'Snippet Copied!',
        description: '1-line tracking snippet copied to clipboard.',
        variant: 'success',
      });
      setTimeout(() => setIsCopiedSnippet(false), 2500);
    } catch {
      toast({
        title: 'Copy Failed',
        description: 'Please copy the script tag manually.',
        variant: 'destructive',
      });
    }
  }, [scriptSnippet, toast]);

  const handleSendMockEvent = React.useCallback(async () => {
    setIsSendingMock(true);
    try {
      const result = await emitMockEvent(
        targetConnectorId,
        mapping?.requiredEventTypes[0],
        'default_mock_test',
      );
      if (result.ok) {
        toast({
          title: 'Mock Event Ingested!',
          description: `Successfully sent test payload to ${connectorName}. Connector status updated to Connected.`,
          variant: 'success',
        });
        onConnected?.(targetConnectorId);
      } else {
        toast({
          title: 'Test Event Failed',
          description: result.error || 'Failed to emit mock event.',
          variant: 'destructive',
        });
      }
    } finally {
      setIsSendingMock(false);
    }
  }, [emitMockEvent, targetConnectorId, mapping, connectorName, onConnected, toast]);

  const handleSimulateOAuthConnect = React.useCallback(async () => {
    setIsOAuthConnecting(true);
    try {
      const result = await emitMockEvent(
        targetConnectorId,
        undefined,
        apiKeyInput ? 'configured_credentials' : 'quick_connect',
      );
      if (result.ok) {
        setIsOAuthModalOpen(false);
        toast({
          title: 'Connected Successfully',
          description: `${connectorName} has been authorized and connected.`,
          variant: 'success',
        });
        onConnected?.(targetConnectorId);
      } else {
        toast({
          title: 'Connection Failed',
          description: result.error || 'Failed to authorize connector.',
          variant: 'destructive',
        });
      }
    } finally {
      setIsOAuthConnecting(false);
    }
  }, [emitMockEvent, targetConnectorId, connectorName, apiKeyInput, onConnected, toast]);

  if (isConnected) {
    return (
      <div
        data-testid="integration-connected-banner"
        className={cn(
          'flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400',
          className,
        )}
      >
        <div className="flex items-center gap-2.5">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
          <span>
            <strong>{connectorName}</strong> is connected and actively streaming data.
          </span>
        </div>
        <Badge variant="success" className="bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
          Connected
        </Badge>
      </div>
    );
  }

  // Render Inline Chip Variant
  if (variant === 'inline_chip') {
    return (
      <>
        <button
          type="button"
          onClick={() => setIsOAuthModalOpen(true)}
          data-testid="missing-integration-chip"
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-colors',
            className,
          )}
        >
          <AlertTriangle className="h-3 w-3 text-amber-500" />
          <span>Connect {connectorName}</span>
        </button>

        {/* OAuth Modal */}
        <Dialog open={isOAuthModalOpen} onOpenChange={setIsOAuthModalOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                Connect {connectorName}
              </DialogTitle>
              <DialogDescription>
                Authorizing {connectorName} enables real-time stream ingestion and unlocks full metric calculations.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-3 py-2 text-sm">
              <div className="rounded-lg border border-border bg-muted/40 p-3">
                <p className="font-medium text-foreground">Impacted Metrics:</p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {affectedMetrics.map((m) => (
                    <Badge key={m} variant="secondary" className="text-xs">
                      {m}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSendMockEvent}
                disabled={isSendingMock}
                className="gap-1.5"
              >
                {isSendingMock ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                Send Mock Event
              </Button>
              <Button
                size="sm"
                onClick={handleSimulateOAuthConnect}
                disabled={isOAuthConnecting}
                className="gap-1.5"
              >
                {isOAuthConnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                Authorize & Connect
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // Render Banner / Full Card Alert Variant
  return (
    <div
      data-testid="missing-integration-alert"
      className={cn(
        'relative overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent p-5 shadow-sm transition-all',
        className,
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3.5">
          <div className="rounded-xl bg-amber-500/20 p-2 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-5 w-5" />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-foreground">
                {customTitle || `Missing Integration: ${connectorName}`}
              </h3>
              <Badge variant="warning" className="bg-amber-500/20 text-amber-700 dark:text-amber-300">
                Setup Required
              </Badge>
            </div>

            <p className="text-sm text-muted-foreground leading-relaxed">
              {impactDescription}
            </p>

            {!isCompact && (
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 text-xs">
                <div className="rounded-lg border border-border/80 bg-background/60 p-2.5 backdrop-blur-sm">
                  <span className="font-medium text-foreground">Missing Data Points:</span>
                  <ul className="mt-1 list-disc list-inside space-y-0.5 text-muted-foreground">
                    {missingPoints.map((pt) => (
                      <li key={pt} className="truncate">{pt}</li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-lg border border-border/80 bg-background/60 p-2.5 backdrop-blur-sm">
                  <span className="font-medium text-foreground">Impact on Metrics:</span>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {affectedMetrics.map((metric) => (
                      <Badge key={metric} variant="secondary" className="text-[11px] font-normal">
                        {metric}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Quick Action Button Group */}
        <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end sm:shrink-0">
          <Button
            size="sm"
            onClick={() => setIsOAuthModalOpen(true)}
            className="w-full sm:w-auto gap-1.5 bg-amber-600 hover:bg-amber-700 text-white shadow-sm"
          >
            <Zap className="h-3.5 w-3.5" />
            1-Click Connect
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={handleSendMockEvent}
            disabled={isSendingMock}
            className="w-full sm:w-auto gap-1.5 border-amber-500/30 hover:bg-amber-500/10 text-foreground"
          >
            {isSendingMock ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5 text-amber-500" />
            )}
            Test / Send Mock Event
          </Button>

          <div className="flex w-full sm:w-auto items-center justify-between sm:justify-end gap-2 text-xs">
            <button
              type="button"
              onClick={handleCopySnippet}
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
            >
              {isCopiedSnippet ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
              {isCopiedSnippet ? 'Snippet Copied' : 'Copy 1-line Script'}
            </button>

            <span className="text-muted-foreground/40">·</span>

            <button
              type="button"
              onClick={() => setIsDeveloperGuideOpen(true)}
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
            >
              <Mail className="h-3 w-3" />
              Developer Guide
            </button>
          </div>
        </div>
      </div>

      {/* 1-Click OAuth Modal */}
      <Dialog open={isOAuthModalOpen} onOpenChange={setIsOAuthModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-500" />
              1-Click Connect {connectorName}
            </DialogTitle>
            <DialogDescription>
              Connect your account securely to enable real-time ingestion, automated reconciliation, and executive dashboards.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 py-3 text-sm">
            <div className="rounded-xl border border-border bg-muted/30 p-3.5 flex flex-col gap-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Selected Connector</span>
                <Badge variant="outline">{targetConnectorId}</Badge>
              </div>

              {/* Inbound Endpoint / Script Snippet */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] font-medium text-foreground">
                  <span>{targetConnectorId === 'growthos_sdk' ? 'Tracking Script' : 'Inbound Webhook Endpoint'}</span>
                  <button
                    type="button"
                    onClick={() => {
                      const text = targetConnectorId === 'growthos_sdk'
                        ? scriptSnippet
                        : `https://api.growthos.io/v1/webhooks/${projectId}/${targetConnectorId}`;
                      void navigator.clipboard.writeText(text);
                      toast({ title: 'Endpoint Copied!', description: 'Copied to clipboard.', variant: 'success' });
                    }}
                    className="text-primary hover:underline flex items-center gap-1 text-[11px]"
                  >
                    <Copy className="h-3 w-3" />
                    Copy
                  </button>
                </div>
                <div className="rounded-lg border border-border bg-background/80 p-2 font-mono text-[11px] text-foreground break-all select-all">
                  {targetConnectorId === 'growthos_sdk'
                    ? scriptSnippet
                    : `https://api.growthos.io/v1/webhooks/${projectId}/${targetConnectorId}`}
                </div>
              </div>

              {/* API Key / Token input */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-foreground flex items-center justify-between">
                  <span>API Key / Webhook Token</span>
                  <span className="text-[10px] text-muted-foreground">Optional for test mode</span>
                </label>
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="sk_live_... / access_token"
                  className="w-full rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary"
                />
              </div>

              <p className="text-[11px] text-muted-foreground">
                Authorizing registers this connector in project plugins, enables stream ingestion, and unlocks full dashboard metrics.
              </p>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSendMockEvent}
              disabled={isSendingMock}
              className="gap-1.5"
            >
              {isSendingMock ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              Instant Mock Test
            </Button>
            <Button
              size="sm"
              onClick={handleSimulateOAuthConnect}
              disabled={isOAuthConnecting}
              className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
            >
              {isOAuthConnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
              Authorize & Connect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Developer Setup Guide Modal */}
      <Dialog open={isDeveloperGuideOpen} onOpenChange={setIsDeveloperGuideOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileCode className="h-5 w-5 text-primary" />
              Setup Guide for Developers
            </DialogTitle>
            <DialogDescription>
              Forward these setup instructions to your engineering team to install the {connectorName} integration.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3.5 py-2 text-sm">
            <div>
              <p className="font-medium text-foreground mb-1">1. Embed Web SDK Snippet:</p>
              <div className="relative rounded-lg bg-muted p-3 font-mono text-xs text-muted-foreground overflow-x-auto">
                <code>{scriptSnippet}</code>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleCopySnippet}
                  className="absolute end-2 top-2 h-7 px-2"
                >
                  {isCopiedSnippet ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>

            <div>
              <p className="font-medium text-foreground mb-1">2. Ingest REST Webhook Endpoint:</p>
              <div className="rounded-lg bg-muted p-3 font-mono text-xs text-muted-foreground">
                <code>POST https://api.growthos.io/v1/hooks/wh_live_{(projectId || 'project_default').slice(0, 8)}</code>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <a
                href={CONNECTOR_DOCS_URLS[targetConnectorId] || 'https://docs.growthos.io'}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                Read Full Documentation
              </a>

              <a
                href={`mailto:?subject=GrowthOS%20Setup%20Instructions%20for%20${encodeURIComponent(connectorName)}&body=Hi%20team,%0A%0APlease%20install%20the%20following%20GrowthOS%20snippet:%0A%0A${encodeURIComponent(scriptSnippet)}`}
                className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                <Mail className="h-3 w-3" />
                Email Instructions to Developer
              </a>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsDeveloperGuideOpen(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
