import * as React from 'react';

export interface HealthStripStats {
  activeCount: number;
  degradedCount: number;
  missingCount: number;
  availableCount: number;
  totalThroughputPerMin?: number;
}

export interface IntegrationsHealthStripProps {
  stats: HealthStripStats;
  selectedFilter?: 'all' | 'active' | 'degraded' | 'missing' | 'available';
  onFilterChange?: (filter: 'all' | 'active' | 'degraded' | 'missing' | 'available') => void;
  className?: string;
}

export function IntegrationsHealthStrip({
  stats,
  selectedFilter = 'all',
  onFilterChange,
  className = '',
}: IntegrationsHealthStripProps): React.ReactElement {
  const cards = [
    {
      id: 'active' as const,
      label: 'Active Streams',
      count: stats.activeCount,
      color: 'text-emerald-500',
      bg: 'bg-emerald-500/10 border-emerald-500/30',
      icon: '✓',
    },
    {
      id: 'degraded' as const,
      label: 'Degraded / Retrying',
      count: stats.degradedCount,
      color: 'text-rose-500',
      bg: 'bg-rose-500/10 border-rose-500/30',
      icon: '⚠',
    },
    {
      id: 'missing' as const,
      label: 'Missing Prerequisites',
      count: stats.missingCount,
      color: 'text-amber-500',
      bg: 'bg-amber-500/10 border-amber-500/30',
      icon: '⚡',
    },
    {
      id: 'available' as const,
      label: 'Available in Catalog',
      count: stats.availableCount,
      color: 'text-blue-500',
      bg: 'bg-blue-500/10 border-blue-500/30',
      icon: '📦',
    },
  ];

  return (
    <section
      aria-label="Integrations Health Overview"
      className={`grid grid-cols-2 md:grid-cols-4 gap-3.5 ${className}`}
    >
      {cards.map((card) => {
        const isSelected = selectedFilter === card.id;
        return (
          <button
            key={card.id}
            type="button"
            onClick={() => onFilterChange?.(card.id)}
            aria-pressed={isSelected}
            aria-label={`${card.label}: ${card.count}`}
            className={`flex flex-col items-start justify-between rounded-2xl border p-4 text-start transition-all shadow-soft hover:shadow-soft-lg ${
              card.bg
            } ${isSelected ? 'ring-2 ring-primary ring-offset-2' : ''}`}
          >
            <div className="flex w-full items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">{card.label}</span>
              <span className={`text-base font-bold ${card.color}`}>{card.icon}</span>
            </div>
            <div className="pt-2">
              <span className="text-2xl font-black text-foreground tracking-tight">{card.count}</span>
            </div>
          </button>
        );
      })}
    </section>
  );
}

export default IntegrationsHealthStrip;
