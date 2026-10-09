'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, FunctionSquare, GitBranch, Sigma } from 'lucide-react';
import { parseMetricUnit } from '@growthos/shared';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { EvolveMetricDefForm } from './evolve-metric-def-form';
import { ArchiveMetricDefButton } from './archive-metric-def-button';
import { metricVersionToFormState, type MetricVersionView } from './metric-definition-editor';

export interface MetricFamilyCardProps {
  orgId: string;
  projectId: string;
  name: string;
  /** Oldest first, so every past version renders and historical versions stay visible even after an evolve. */
  versions: MetricVersionView[];
  /** Where "Trace lineage" points (the page's lineage view focused on this metric); omitted, no link. */
  lineageHref?: string;
  /** How many active formula metrics reference this one. */
  usedByCount?: number;
}

/**
 * One metric family: its latest definition up front, every earlier version one click away (still
 * rendered, so pinned historical versions stay inspectable), plus "Evolve" (a form prefilled from
 * the latest version) and "Archive".
 */
export function MetricFamilyCard({ orgId, projectId, name, versions, lineageHref, usedByCount = 0 }: MetricFamilyCardProps): React.ReactElement {
  const t = useTranslations('MetricRegistry');
  const [evolving, setEvolving] = useState(false);
  const latest = versions[versions.length - 1];
  const isArchived = latest?.status === 'archived';
  const KindIcon = latest?.definitionKind === 'formula' ? FunctionSquare : Sigma;

  function statusLabel(status: MetricVersionView['status']): string {
    if (status === 'active') {
      return t('activeLabel');
    }
    return status === 'archived' ? t('archivedLabel') : t('supersededLabel');
  }

  function unitLabel(unit: string | null): string {
    const parsed = unit ? parseMetricUnit(unit) : null;
    if (!parsed) {
      return t('unitNone');
    }
    return parsed.currency ? t('unitCurrencyWithCode', { code: parsed.currency }) : t(`unitOption.${parsed.kind}`);
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

  function versionBody(version: MetricVersionView): React.ReactElement {
    return (
      <div className="flex flex-col gap-1.5 text-sm">
        <code className="block overflow-x-auto whitespace-nowrap rounded-lg bg-muted/60 px-2.5 py-1.5 font-mono text-xs text-foreground" dir="ltr">
          {formulaOrAggregationSummary(version)}
        </code>
        {version.dimensions.length > 0 ? <span className="text-xs text-muted-foreground">{t('dimensionsSummary', { dimensions: version.dimensions.join(', ') })}</span> : null}
        <span className="text-xs text-muted-foreground">{t('unitSummary', { unit: unitLabel(version.unit) })}</span>
      </div>
    );
  }

  function versionLabel(version: MetricVersionView): React.ReactElement {
    return (
      <span className={cn('text-xs font-medium', version.status === 'active' ? 'text-success' : 'text-muted-foreground')}>
        {t('versionStatusLabel', {
          version: String(version.version),
          status: statusLabel(version.status),
        })}
      </span>
    );
  }

  return (
    <li
      id={`metric-${name}`}
      className={cn('flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm', isArchived && 'opacity-70')}
      data-testid={`metric-family-${name}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
              latest?.definitionKind === 'formula' ? 'bg-info/10 text-info' : 'bg-primary/10 text-primary',
            )}
            aria-hidden="true"
          >
            <KindIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <span className="block truncate font-mono text-sm font-semibold text-foreground" dir="ltr">
              {name}
            </span>
            <span className="block text-xs text-muted-foreground">
              {t('cardMeta', {
                kind: latest?.definitionKind === 'formula' ? t('kindFormula') : t('kindAggregation'),
                versions: versions.length,
                usedBy: usedByCount,
              })}
            </span>
          </div>
        </div>
        {!evolving && !isArchived ? (
          <span className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setEvolving(true)}>
              {t('evolve')}
            </Button>
            <ArchiveMetricDefButton orgId={orgId} projectId={projectId} name={name} />
          </span>
        ) : null}
      </div>

      {versions.map((version) =>
        version === latest ? (
          <div key={version.id} className="flex flex-col gap-1.5">
            {versionLabel(version)}
            {versionBody(version)}
          </div>
        ) : (
          <details key={version.id} className="group">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 [&::-webkit-details-marker]:hidden">
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
              {versionLabel(version)}
            </summary>
            <div className="mt-1.5">{versionBody(version)}</div>
          </details>
        ),
      )}

      {lineageHref ? (
        <Link href={lineageHref} className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-primary underline-offset-4 hover:underline">
          <GitBranch className="h-3.5 w-3.5" aria-hidden="true" />
          {t('traceLineage')}
        </Link>
      ) : null}

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
