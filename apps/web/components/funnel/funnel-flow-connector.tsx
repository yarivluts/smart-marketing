'use client';

import React from 'react';
import { ChevronRight, TrendingDown } from 'lucide-react';

export interface FunnelFlowConnectorProps {
  dropOffPercent: number;
  fromStageLabel?: string;
  toStageLabel?: string;
  className?: string;
}

export function FunnelFlowConnector({
  dropOffPercent,
  className = '',
}: FunnelFlowConnectorProps): React.ReactElement {
  return (
    <div
      data-testid="funnel-flow-connector"
      className={`flex items-center justify-center py-2 md:py-0 md:px-2 ${className}`}
    >
      {/* Desktop Horizontal Connector */}
      <div className="hidden md:flex flex-col items-center gap-1">
        <div className="relative flex items-center">
          <div className="h-0.5 w-12 bg-gradient-to-r from-border via-primary/40 to-border rounded-full" />
          <ChevronRight className="h-4 w-4 text-primary/70 -ms-2 rtl:rotate-180" />
        </div>
        {dropOffPercent > 0 && (
          <span
            data-testid="connector-dropoff-badge"
            dir="ltr"
            className="inline-flex items-center gap-0.5 rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-600 dark:text-rose-400 border border-rose-200/50 dark:border-rose-900/40"
          >
            <TrendingDown className="h-2.5 w-2.5" />
            <span>{`-${dropOffPercent}%`}</span>
          </span>
        )}
      </div>

      {/* Mobile Vertical Connector */}
      <div className="flex md:hidden items-center justify-center gap-2 py-1">
        <div className="h-6 w-0.5 bg-gradient-to-b from-border via-primary/40 to-border rounded-full" />
        {dropOffPercent > 0 && (
          <span
            dir="ltr"
            className="inline-flex items-center gap-0.5 rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-600 dark:text-rose-400 border border-rose-200/50"
          >
            <TrendingDown className="h-2.5 w-2.5" />
            <span>{`-${dropOffPercent}% drop-off`}</span>
          </span>
        )}
      </div>
    </div>
  );
}
