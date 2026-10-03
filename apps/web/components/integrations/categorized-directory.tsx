import * as React from 'react';

export type ConnectorCategory =
  | 'billing'
  | 'ads'
  | 'telemetry'
  | 'crm'
  | 'billing_revenue'
  | 'ad_networks'
  | 'telemetry_sdk'
  | 'crm_sales';

export interface ConnectorItem {
  id: string;
  name: string;
  category: ConnectorCategory;
  description: string;
  status: 'active' | 'degraded' | 'missing' | 'available';
  icon?: string;
  isPopular?: boolean;
  authType?: 'oauth' | 'api_key' | 'webhook' | 'sdk_snippet';
  requiredForMetrics?: string[];
  requiredForDashboards?: string[];
  docsUrl?: string;
}

export interface IntegrationsDirectoryProps {
  connectors: ConnectorItem[];
  onSelectConnector?: (connectorId: string) => void;
  onManageConnector?: (connectorId: string) => void;
  className?: string;
}

function normalizeCategory(category: ConnectorCategory): 'billing' | 'ads' | 'telemetry' | 'crm' {
  if (category === 'billing' || category === 'billing_revenue') return 'billing';
  if (category === 'ads' || category === 'ad_networks') return 'ads';
  if (category === 'telemetry' || category === 'telemetry_sdk') return 'telemetry';
  if (category === 'crm' || category === 'crm_sales') return 'crm';
  return 'billing';
}

export function IntegrationsDirectory({
  connectors,
  onSelectConnector,
  onManageConnector,
  className = '',
}: IntegrationsDirectoryProps): React.ReactElement {
  const [activeCategory, setActiveCategory] = React.useState<string>('all');
  const [searchQuery, setSearchQuery] = React.useState<string>('');

  const categories = [
    { id: 'all', label: 'All Connectors' },
    { id: 'billing', label: 'Billing & Revenue' },
    { id: 'ads', label: 'Ad Networks' },
    { id: 'telemetry', label: 'Telemetry & Identity' },
    { id: 'crm', label: 'CRM & Sales' },
  ];

  const filtered = connectors.filter((c) => {
    const norm = normalizeCategory(c.category);
    const matchesCategory = activeCategory === 'all' || norm === activeCategory || c.category === activeCategory;
    const matchesSearch =
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.id.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className={`space-y-6 ${className}`} data-testid="integrations-directory">
      {/* Category Tabs & Search */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id)}
              aria-pressed={activeCategory === cat.id}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                activeCategory === cat.id
                  ? 'bg-primary text-primary-foreground shadow-soft'
                  : 'bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="w-full sm:w-64">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search connectors..."
            aria-label="Search connectors"
            className="w-full rounded-xl border border-input bg-card px-3.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none shadow-soft"
          />
        </div>
      </div>

      {/* Connectors Grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((connector) => {
            const isConnected = connector.status === 'active';
            return (
              <div
                key={connector.id}
                className="flex flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-soft hover:shadow-soft-lg transition-all"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-foreground">{connector.name}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        isConnected
                          ? 'bg-emerald-500/10 text-emerald-600'
                          : connector.status === 'degraded'
                          ? 'bg-rose-500/10 text-rose-600'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {connector.status.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{connector.description}</p>
                </div>

                <div className="pt-4 mt-2 border-t border-border/60 flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground/80">
                    {connector.category}
                  </span>
                  {isConnected ? (
                    <button
                      type="button"
                      onClick={() => onManageConnector?.(connector.id)}
                      className="rounded-xl border border-input bg-background px-3 py-1 text-xs font-medium text-foreground hover:bg-muted"
                    >
                      Manage
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSelectConnector?.(connector.id)}
                      className="rounded-xl bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground shadow-soft hover:bg-primary/90"
                    >
                      Connect
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center">
          <p className="text-sm font-semibold text-foreground">No matching connectors found</p>
          <p className="text-xs text-muted-foreground pt-1">
            Try adjusting your search query or category filter.
          </p>
        </div>
      )}
    </div>
  );
}

export default IntegrationsDirectory;
