'use client';

import React from 'react';
import { Award } from 'lucide-react';
import type { QualityCalibrationItem } from './goal-types';

export interface IntentQualityCalibrationProps {
  tiers?: QualityCalibrationItem[];
  className?: string;
}

export const DEFAULT_QUALITY_TIERS: QualityCalibrationItem[] = [
  { tier: 'diamond', tierLabel: 'Diamond (Tier 1)', signups: 120, payingSignups: 110, payingRatePercent: 92, avgCollectedRevenue40d: 1420 },
  { tier: 'gold', tierLabel: 'Gold (Tier 2)', signups: 340, payingSignups: 231, payingRatePercent: 68, avgCollectedRevenue40d: 890 },
  { tier: 'silver', tierLabel: 'Silver (Tier 3)', signups: 480, payingSignups: 163, payingRatePercent: 34, avgCollectedRevenue40d: 420 },
  { tier: 'bronze', tierLabel: 'Bronze (Tier 4)', signups: 260, payingSignups: 31, payingRatePercent: 12, avgCollectedRevenue40d: 160 },
];

export function IntentQualityCalibration({
  tiers = DEFAULT_QUALITY_TIERS,
  className = '',
}: IntentQualityCalibrationProps): React.ReactElement {
  return (
    <div
      data-testid="quality-calibration-card"
      className={`flex flex-col gap-4 rounded-2xl border border-border/80 bg-card p-6 shadow-xs ${className}`}
    >
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-foreground">Intent Quality Calibration</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Conversion efficiency and 40-day revenue realization by lead quality tier.
          </p>
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Award className="h-4 w-4" />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/70 text-muted-foreground font-medium">
              <th className="py-2.5 text-start">Quality Tier</th>
              <th className="py-2.5 text-end">Signups</th>
              <th className="py-2.5 text-end">Paying Rate</th>
              <th className="py-2.5 text-end">Avg 40d Revenue</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {tiers.map((q) => (
              <tr key={q.tier} className="hover:bg-muted/20 transition-colors">
                <td className="py-2.5 font-semibold text-foreground">{q.tierLabel}</td>
                <td className="py-2.5 text-end" dir="ltr">{q.signups}</td>
                <td className="py-2.5 text-end font-bold text-emerald-600 dark:text-emerald-400" dir="ltr">
                  {`${q.payingRatePercent}%`}
                </td>
                <td className="py-2.5 text-end font-bold text-foreground" dir="ltr">
                  {`$${q.avgCollectedRevenue40d.toLocaleString()}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
