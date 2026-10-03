import * as React from 'react';

export interface MissingTriageItem {
  id: string;
  streamName: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  affectedDashboards: string[];
  blockedMetrics: string[];
  recommendedConnector: string;
}

export interface MissingTriageChecklistProps {
  items: MissingTriageItem[];
  onResolveItem?: (item: MissingTriageItem) => void;
  className?: string;
}

export function MissingTriageChecklist({
  items,
  onResolveItem,
  className = '',
}: MissingTriageChecklistProps): React.ReactElement {
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  const sorted = [...items].sort(
    (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority],
  );

  return (
    <div className={`space-y-4 ${className}`} data-testid="missing-triage-checklist">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-foreground">
          Missing Integrations Triage ({items.length})
        </h3>
      </div>

      {sorted.length > 0 ? (
        <div className="space-y-3">
          {sorted.map((item) => {
            const priorityBadge =
              item.priority === 'critical'
                ? 'bg-rose-500/10 text-rose-600 border-rose-500/20'
                : item.priority === 'high'
                ? 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                : 'bg-blue-500/10 text-blue-600 border-blue-500/20';

            return (
              <div
                key={item.id}
                className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4 shadow-soft"
              >
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center gap-2.5">
                    <span className="font-semibold text-sm text-foreground">{item.streamName}</span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${priorityBadge}`}
                    >
                      {item.priority}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="font-medium">Affected Dashboards:</span>
                    {item.affectedDashboards.map((dash) => (
                      <span key={dash} className="rounded-md bg-muted px-2 py-0.5 text-[10px]">
                        {dash}
                      </span>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="font-medium">Blocked Metrics:</span>
                    {item.blockedMetrics.join(', ')}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onResolveItem?.(item)}
                  className="rounded-xl bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-soft hover:bg-primary/90 shrink-0"
                >
                  Configure {item.recommendedConnector}
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-8 text-center space-y-2">
          <span className="text-2xl">🎉</span>
          <h4 className="font-bold text-sm text-foreground">All Prerequisite Data Streams Active!</h4>
          <p className="text-xs text-muted-foreground">
            No missing streams detected for currently configured dashboards.
          </p>
        </div>
      )}
    </div>
  );
}

export default MissingTriageChecklist;
