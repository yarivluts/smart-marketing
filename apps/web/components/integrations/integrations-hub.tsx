'use client';

import * as React from 'react';
import { useIntegrationStatus } from '@/hooks/use-integration-status';
import { IntegrationsHealthStrip, type HealthStripStats } from './health-overview-strip';
import { IntegrationsDirectory, type ConnectorItem, type ConnectorCategory } from './categorized-directory';
import { MissingTriageChecklist, type MissingTriageItem } from './missing-triage-checklist';
import { SetupModal } from './setup-modal';
import { LiveEventTester } from './live-event-tester';
import { PageGuideButton } from '@/components/guides/page-guide-button';

export interface IntegrationsHubProps {
  orgId: string;
  projectId: string;
  projectName?: string;
  initialActiveConnectors?: string[];
  className?: string;
}

const CATALOG_CONNECTORS: Array<{
  id: string;
  name: string;
  category: ConnectorCategory;
  description: string;
  isPopular?: boolean;
  requiredForMetrics?: string[];
  requiredForDashboards?: string[];
  defaultPriority?: 'critical' | 'high' | 'medium' | 'low';
}> = [
  // 1. Billing & Revenue
  {
    id: 'stripe',
    name: 'Stripe Billing',
    category: 'billing',
    description: 'Customer transactions, recurring subscription state changes, and invoice payments.',
    isPopular: true,
    requiredForMetrics: ['MRR', 'ARR', 'MRR_WATERFALL', 'CHURN', 'LTV', 'ROI'],
    requiredForDashboards: ['MRR Velocity & Billing', 'Revenue Intelligence', 'Economics & Cohorts'],
    defaultPriority: 'critical',
  },
  {
    id: 'chargebee',
    name: 'Chargebee',
    category: 'billing',
    description: 'SaaS billing and recurring revenue subscription lifecycle.',
    requiredForMetrics: ['MRR', 'ARR', 'MRR_WATERFALL'],
    requiredForDashboards: ['MRR Velocity & Billing'],
    defaultPriority: 'high',
  },
  {
    id: 'paddle',
    name: 'Paddle',
    category: 'billing',
    description: 'Merchant of record global billing and subscription analytics.',
    requiredForMetrics: ['MRR', 'ARR', 'LTV'],
    requiredForDashboards: ['MRR Velocity & Billing'],
    defaultPriority: 'medium',
  },
  {
    id: 'recurly',
    name: 'Recurly',
    category: 'billing',
    description: 'Subscription management and recurring billing engine.',
    requiredForMetrics: ['MRR', 'CHURN'],
    requiredForDashboards: ['Net & Gross Churn'],
    defaultPriority: 'medium',
  },
  {
    id: 'ingest_api',
    name: 'Ingest Webhook API',
    category: 'billing',
    description: 'Direct HTTPS REST raw batch ingestion endpoint with HMAC verification.',
    requiredForMetrics: ['MRR', 'CAC', 'LTV'],
    requiredForDashboards: ['Telemetry Record Feed'],
    defaultPriority: 'low',
  },

  // 2. Ad Networks
  {
    id: 'google_ads',
    name: 'Google Ads API',
    category: 'ads',
    description: 'Ad campaign spends, RSA creatives, and keyword conversion tracking.',
    isPopular: true,
    requiredForMetrics: ['CAC', 'ROI', 'TROI', 'CAS'],
    requiredForDashboards: ['Marketing Cockpit', 'Spends Distribution', 'Campaigns'],
    defaultPriority: 'high',
  },
  {
    id: 'meta_ads',
    name: 'Meta Marketing API',
    category: 'ads',
    description: 'Facebook & Instagram ad spend, creative fatigue, and ROAS.',
    isPopular: true,
    requiredForMetrics: ['CAC', 'ROI', 'TROI', 'CAS'],
    requiredForDashboards: ['Marketing Cockpit', 'Spends Distribution', 'Creative Fatigue'],
    defaultPriority: 'high',
  },
  {
    id: 'tiktok_ads',
    name: 'TikTok Ads',
    category: 'ads',
    description: 'TikTok video ads spend, conversion events, and creative performance.',
    requiredForMetrics: ['CAC', 'ROI', 'TROI'],
    requiredForDashboards: ['Marketing Cockpit', 'Spends Distribution'],
    defaultPriority: 'medium',
  },
  {
    id: 'offline_csv',
    name: 'Offline Spend CSV',
    category: 'ads',
    description: 'Manual or scheduled CSV spend ingestion for offline and print advertising.',
    requiredForMetrics: ['ROI', 'CAC'],
    requiredForDashboards: ['Spends Distribution'],
    defaultPriority: 'low',
  },

  // 3. Telemetry & Identity
  {
    id: 'growthos_sdk',
    name: 'GrowthOS Web JS SDK',
    category: 'telemetry',
    description: 'First-party client event tracking, session replay, and UTM stitching.',
    isPopular: true,
    requiredForMetrics: ['DAU_MAU', 'CONVERSION_FUNNEL', 'ACCOUNT_SURVIVAL', 'TROI', 'CAS'],
    requiredForDashboards: ['Product Stickiness', 'Conversion Funnels', 'Session Replay'],
    defaultPriority: 'critical',
  },
  {
    id: 'node_sdk',
    name: 'GrowthOS Node/Python SDK',
    category: 'telemetry',
    description: 'Server-side backend event tracking and identity resolution pipelines.',
    requiredForMetrics: ['DAU_MAU', 'CONVERSION_FUNNEL'],
    requiredForDashboards: ['Product Stickiness'],
    defaultPriority: 'medium',
  },
  {
    id: 'ga4_proxy',
    name: 'GA4 / Segment Proxy',
    category: 'telemetry',
    description: 'Inbound stream proxy forwarding existing Google Analytics 4 or Segment events.',
    requiredForMetrics: ['DAU_MAU', 'CONVERSION_FUNNEL'],
    requiredForDashboards: ['Conversion Funnels'],
    defaultPriority: 'low',
  },
  {
    id: 'mcp_server',
    name: 'Model Context Protocol (MCP)',
    category: 'telemetry',
    description: 'Connect Claude Desktop, Cursor, Antigravity, or custom AI agents over Streamable HTTP.',
    isPopular: true,
    requiredForMetrics: ['MRR', 'CAC', 'DAU_MAU', 'CONVERSION_FUNNEL'],
    requiredForDashboards: ['Strategic Insights', 'AI Copilot & Actions', 'Model Context Protocol (MCP)'],
    defaultPriority: 'high',
  },

  // 4. CRM & Sales
  {
    id: 'hubspot',
    name: 'HubSpot CRM',
    category: 'crm',
    description: 'B2B CRM deal stages, sales pipeline, and rep revenue tracking.',
    isPopular: true,
    requiredForMetrics: ['DEMOS_PIPELINE', 'PAYING_ACCOUNTS_GROWTH'],
    requiredForDashboards: ['Paying Accounts & Tiers', 'Demos Pipeline'],
    defaultPriority: 'medium',
  },
  {
    id: 'salesforce',
    name: 'Salesforce',
    category: 'crm',
    description: 'Enterprise CRM opportunity stages, account sync, and sales velocity.',
    requiredForMetrics: ['DEMOS_PIPELINE', 'PAYING_ACCOUNTS_GROWTH'],
    requiredForDashboards: ['Paying Accounts & Tiers'],
    defaultPriority: 'medium',
  },
  {
    id: 'pipedrive',
    name: 'Pipedrive',
    category: 'crm',
    description: 'Sales pipeline stages, deal velocity, and activity tracking.',
    requiredForMetrics: ['DEMOS_PIPELINE'],
    requiredForDashboards: ['Demos Pipeline'],
    defaultPriority: 'low',
  },
];

export function IntegrationsHub({
  orgId,
  projectId,
  projectName = 'Growth Project',
  initialActiveConnectors = [],
  className = '',
}: IntegrationsHubProps): React.ReactElement {
  const {
    isConnectorActive,
    emitMockEvent,
    refetch,
  } = useIntegrationStatus({
    orgId,
    projectId,
    initialActiveConnectors,
  });

  const [selectedTab, setSelectedTab] = React.useState<'directory' | 'triage' | 'tester'>('directory');
  const [healthFilter, setHealthFilter] = React.useState<'all' | 'active' | 'degraded' | 'missing' | 'available'>('all');
  const [setupModalConnector, setSetupModalConnector] = React.useState<{ id: string; name: string } | null>(null);

  // Derive status for all catalog connectors
  const connectorsList: ConnectorItem[] = React.useMemo(() => {
    return CATALOG_CONNECTORS.map((catItem) => {
      const active = isConnectorActive(catItem.id);
      let status: 'active' | 'degraded' | 'missing' | 'available' = 'available';

      if (active) {
        status = 'active';
      } else if (
        catItem.id === 'stripe' ||
        catItem.id === 'growthos_sdk' ||
        catItem.id === 'google_ads' ||
        catItem.id === 'meta_ads'
      ) {
        // Known prerequisite connectors marked as missing if not active
        status = 'missing';
      }

      return {
        id: catItem.id,
        name: catItem.name,
        category: catItem.category,
        description: catItem.description,
        status,
        isPopular: catItem.isPopular,
      };
    });
  }, [isConnectorActive]);

  // Compute health stats
  const healthStats: HealthStripStats = React.useMemo(() => {
    let activeCount = 0;
    let degradedCount = 0;
    let missingCount = 0;
    let availableCount = 0;

    for (const item of connectorsList) {
      if (item.status === 'active') activeCount++;
      else if (item.status === 'degraded') degradedCount++;
      else if (item.status === 'missing') missingCount++;
      else availableCount++;
    }

    return {
      activeCount,
      degradedCount,
      missingCount,
      availableCount,
    };
  }, [connectorsList]);

  // Compute triage checklist items
  const triageItems: MissingTriageItem[] = React.useMemo(() => {
    const items: MissingTriageItem[] = [];

    // Billing stream
    if (!isConnectorActive('stripe') && !isConnectorActive('chargebee')) {
      items.push({
        id: 'triage-billing',
        streamName: 'Subscription Lifecycle Webhooks',
        priority: 'critical',
        affectedDashboards: ['MRR Velocity & Billing', 'Net & Gross Churn', 'Revenue Intelligence'],
        blockedMetrics: ['MRR_WATERFALL', 'GROSS_CHURN', 'NET_CHURN', 'LTV'],
        recommendedConnector: 'Stripe',
      });
    }

    // Ad spend stream
    if (!isConnectorActive('google_ads') && !isConnectorActive('meta_ads') && !isConnectorActive('tiktok_ads')) {
      items.push({
        id: 'triage-ads',
        streamName: 'Paid Ad Spend Feeds',
        priority: 'high',
        affectedDashboards: ['Ad Campaigns', 'TROI & Payback', 'Marketing Cockpit'],
        blockedMetrics: ['ROI', 'CAC', 'TROI', 'CAS'],
        recommendedConnector: 'Google Ads',
      });
    }

    // Product telemetry stream
    if (!isConnectorActive('growthos_sdk') && !isConnectorActive('node_sdk')) {
      items.push({
        id: 'triage-telemetry',
        streamName: 'Client Product Telemetry',
        priority: 'medium',
        affectedDashboards: ['Conversion Funnels', 'Stickiness', 'Session Replay'],
        blockedMetrics: ['DAU_MAU', 'CONVERSION_FUNNEL', 'ACCOUNT_SURVIVAL'],
        recommendedConnector: 'GrowthOS SDK',
      });
    }

    // CRM stream
    if (!isConnectorActive('hubspot') && !isConnectorActive('salesforce')) {
      items.push({
        id: 'triage-crm',
        streamName: 'CRM Deal Lifecycle',
        priority: 'low',
        affectedDashboards: ['Paying Accounts & Tiers', 'Demos Pipeline'],
        blockedMetrics: ['DEMOS_PIPELINE', 'PAYING_ACCOUNTS_GROWTH'],
        recommendedConnector: 'HubSpot',
      });
    }

    return items;
  }, [isConnectorActive]);

  const handleOpenSetup = (connectorId: string) => {
    const found = CATALOG_CONNECTORS.find((c) => c.id === connectorId);
    setSetupModalConnector({
      id: connectorId,
      name: found ? found.name : connectorId,
    });
  };

  const handleResolveTriageItem = (item: MissingTriageItem) => {
    const connectorMap: Record<string, string> = {
      Stripe: 'stripe',
      'Google Ads': 'google_ads',
      'GrowthOS SDK': 'growthos_sdk',
      HubSpot: 'hubspot',
    };
    const connectorId = connectorMap[item.recommendedConnector] || 'stripe';
    handleOpenSetup(connectorId);
  };

  // Filter directory based on health filter if selected
  const displayedConnectors = React.useMemo(() => {
    if (healthFilter === 'all') return connectorsList;
    return connectorsList.filter((c) => c.status === healthFilter);
  }, [connectorsList, healthFilter]);

  return (
    <div className={`space-y-8 ${className}`} data-testid="integrations-hub">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Integrations Hub</h1>
            <PageGuideButton pageKey="integrations" />
            <span className="rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
              Live Ingestion
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Connect and orchestrate data streams for {projectName} across Billing, Ad Networks, Telemetry SDK, and CRM.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => void refetch()}
            className="rounded-xl border border-input bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors shadow-soft"
          >
            ↻ Refresh Feeds
          </button>
          <button
            type="button"
            onClick={() => handleOpenSetup('stripe')}
            className="rounded-xl bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-soft hover:bg-primary/90 transition-colors"
          >
            + New Connection
          </button>
        </div>
      </div>

      {/* Bird's-eye Health Overview Strip */}
      <IntegrationsHealthStrip
        stats={healthStats}
        selectedFilter={healthFilter}
        onFilterChange={(filter) => {
          setHealthFilter(filter);
          if (filter === 'missing') {
            setSelectedTab('triage');
          } else {
            setSelectedTab('directory');
          }
        }}
      />

      {/* Main Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-border pb-2" role="tablist">
        <button
          type="button"
          data-testid="tab-directory"
          onClick={() => {
            setSelectedTab('directory');
            setHealthFilter('all');
          }}
          className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all ${
            selectedTab === 'directory'
              ? 'bg-primary text-primary-foreground shadow-soft'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          All Connectors ({connectorsList.length})
        </button>
        <button
          type="button"
          data-testid="tab-triage"
          aria-label="Missing Prerequisites Tab"
          onClick={() => setSelectedTab('triage')}
          className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all ${
            selectedTab === 'triage'
              ? 'bg-primary text-primary-foreground shadow-soft'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          <span>Missing Prerequisites</span>
          {triageItems.length > 0 ? (
            <span className="rounded-full bg-rose-500 text-white px-1.5 py-0.2 text-[10px] font-bold">
              {triageItems.length}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          data-testid="tab-tester"
          onClick={() => setSelectedTab('tester')}
          className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all ${
            selectedTab === 'tester'
              ? 'bg-primary text-primary-foreground shadow-soft'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          ⚡ Live Event Tester
        </button>
      </div>

      {/* Tab Panels */}
      {selectedTab === 'directory' ? (
        <IntegrationsDirectory
          connectors={displayedConnectors}
          onSelectConnector={handleOpenSetup}
          onManageConnector={handleOpenSetup}
        />
      ) : selectedTab === 'triage' ? (
        <MissingTriageChecklist
          items={triageItems}
          onResolveItem={handleResolveTriageItem}
        />
      ) : (
        <div className="max-w-xl mx-auto space-y-4">
          <div className="space-y-1">
            <h3 className="text-base font-bold text-foreground">Live Event Receiver Tester</h3>
            <p className="text-xs text-muted-foreground">
              Send synthetic payloads into your pipeline to immediately verify ingestion routes and trigger instant connected status transitions.
            </p>
          </div>
          <LiveEventTester
            connectorId="stripe"
            connectorName="Stripe Billing"
            orgId={orgId}
            projectId={projectId}
            onSuccess={() => {
              void refetch();
            }}
          />
        </div>
      )}

      {/* Interactive Step-by-Step Setup Modal */}
      {setupModalConnector ? (
        <SetupModal
          isOpen={true}
          onClose={() => setSetupModalConnector(null)}
          connectorId={setupModalConnector.id}
          connectorName={setupModalConnector.name}
          projectId={projectId}
          orgId={orgId}
          onSaveCredentials={async (apiKey: string) => {
            if (!orgId || !apiKey.trim()) return;
            try {
              const providerMap: Record<string, string> = {
                stripe: 'stripe',
                google_ads: 'google_ads',
                'google-ads': 'google_ads',
                meta_ads: 'meta_ads',
                'meta-ads': 'meta_ads',
                ga4: 'ga4',
              };
              const provider = providerMap[setupModalConnector.id] || 'generic';
              const createRes = await fetch(`/api/orgs/${orgId}/resources/credentials`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  name: `${setupModalConnector.name} Key`,
                  provider,
                  availableScopes: ['read', 'write'],
                }),
              });
              if (createRes.ok) {
                const data = (await createRes.json()) as { credentialId?: string };
                if (data.credentialId) {
                  await fetch(`/api/orgs/${orgId}/resources/credentials/${data.credentialId}/secret`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ secret: apiKey.trim() }),
                  });
                }
              }
            } catch (err) {
              console.error('Failed to save connector credentials', err);
            }
          }}
          onTestEventEmit={async () => {
            const res = await emitMockEvent(setupModalConnector.id);
            return {
              success: res.ok,
              eventId: res.batchId || `evt_${Date.now()}`,
            };
          }}
          onCompleteSetup={() => {
            setSetupModalConnector(null);
            void refetch();
          }}
        />
      ) : null}
    </div>
  );
}

export default IntegrationsHub;
