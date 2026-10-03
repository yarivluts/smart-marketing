'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { PpButton, PpCard, PpPill } from '@/components/pastel/primitives';
import { GitBranch, Calculator } from 'lucide-react';
import { EvolveMetricDefForm } from './evolve-metric-def-form';
import { metricVersionToFormState, type MetricVersionView } from './metric-definition-editor';

export interface MetricFamilyCardProps {
  orgId: string;
  projectId: string;
  name: string;
  /** Oldest first. */
  versions: MetricVersionView[];
}

/** One metric family: every version's definition, plus an "Evolve" action that opens a form prefilled from the latest version. */
export function MetricFamilyCard({ orgId, projectId, name, versions }: MetricFamilyCardProps): React.ReactElement {
  const t = useTranslations('MetricRegistry');
  const [evolving, setEvolving] = useState(false);
  const latest = versions[versions.length - 1];

  function formulaOrAggregationSummary(version: MetricVersionView): string {
    if (version.definitionKind === 'formula') {
      return t('formulaSummary', { formula: version.formula ?? '' });
    }
    const aggregation = version.aggregation;
    if (!aggregation) {
      return '';
    }
    const columnPart = aggregation.column ? `(${aggregation.table}.${aggregation.column})` : `(${aggregation.table})`;
    return t('aggregationSummary', { function: aggregation.function, columnPart });
  }

  return (
    <PpCard
      as="article"
      title={name}
      subtitle={
        latest ? (
          <span className="font-mono text-xs">
            {latest.definitionKind === 'formula' ? 'Formula' : latest.aggregation?.function.toUpperCase()}
          </span>
        ) : null
      }
      icon={Calculator}
      iconAccent="primary"
      action={
        <div className="flex items-center gap-2">
          {latest ? (
            <PpPill accent={latest.definitionKind === 'formula' ? 'pink' : 'mint'}>
              {latest.definitionKind}
            </PpPill>
          ) : null}
          {!evolving ? (
            <PpButton type="button" variant="secondary" size="sm" icon={GitBranch} onClick={() => setEvolving(true)}>
              {t('evolve')}
            </PpButton>
          ) : null}
        </div>
      }
    >
      <div className="space-y-4">
        {versions.map((version) => (
          <div
            key={version.id}
            className="flex flex-col gap-2 rounded-2xl bg-pp-surface-container-low/60 p-4 border border-pp-outline-variant/20"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-semibold text-pp-on-surface-variant">
                {t('versionStatusLabel', {
                  version: String(version.version),
                  status: version.status === 'active' ? t('activeLabel') : t('supersededLabel'),
                })}
              </span>
              <PpPill accent={version.status === 'active' ? 'mint' : 'neutral'} dot={version.status === 'active'}>
                {version.status === 'active' ? t('activeLabel') : t('supersededLabel')}
              </PpPill>
            </div>
            <div className="font-mono text-sm font-bold text-pp-primary">
              {formulaOrAggregationSummary(version)}
            </div>
            {version.dimensions.length > 0 ? (
              <div className="text-xs text-pp-on-surface-variant">
                {t('dimensionsSummary', { dimensions: version.dimensions.join(', ') })}
              </div>
            ) : null}
          </div>
        ))}

        {evolving && latest ? (
          <EvolveMetricDefForm
            orgId={orgId}
            projectId={projectId}
            name={name}
            initialState={metricVersionToFormState(latest)}
            onClose={() => setEvolving(false)}
          />
        ) : null}
      </div>
    </PpCard>
  );
}
