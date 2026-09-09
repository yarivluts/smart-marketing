'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { EvolveMetricDefForm } from './evolve-metric-def-form';
import { ArchiveMetricDefButton } from './archive-metric-def-button';
import { metricVersionToFormState, type MetricVersionView } from './metric-definition-editor';

export interface MetricFamilyCardProps {
  orgId: string;
  projectId: string;
  name: string;
  /** Oldest first, so every past version renders and historical versions stay visible even after an evolve. */
  versions: MetricVersionView[];
}

/** One metric family: every version's definition, plus an "Evolve" action that opens a form prefilled from the latest version. */
export function MetricFamilyCard({ orgId, projectId, name, versions }: MetricFamilyCardProps): React.ReactElement {
  const t = useTranslations('MetricRegistry');
  const [evolving, setEvolving] = useState(false);
  const latest = versions[versions.length - 1];
  const isArchived = latest?.status === 'archived';

  function statusLabel(status: MetricVersionView['status']): string {
    if (status === 'active') {
      return t('activeLabel');
    }
    return status === 'archived' ? t('archivedLabel') : t('supersededLabel');
  }

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
    <li className="flex flex-col gap-3 rounded-md border border-input p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{name}</span>
        {!evolving && !isArchived ? (
          <span className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setEvolving(true)}>
              {t('evolve')}
            </Button>
            <ArchiveMetricDefButton orgId={orgId} projectId={projectId} name={name} />
          </span>
        ) : null}
      </div>

      {versions.map((version) => (
        <div key={version.id} className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">
            {t('versionStatusLabel', {
              version: String(version.version),
              status: statusLabel(version.status),
            })}
          </span>
          <span>{formulaOrAggregationSummary(version)}</span>
          {version.dimensions.length > 0 ? <span className="text-muted-foreground">{t('dimensionsSummary', { dimensions: version.dimensions.join(', ') })}</span> : null}
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
    </li>
  );
}
