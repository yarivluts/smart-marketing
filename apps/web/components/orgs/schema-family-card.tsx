'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, ChevronDown, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { EvolveSchemaDefForm } from './evolve-schema-def-form';
import { SchemaKindIcon } from './schema-kind-icon';
import type { SchemaFieldRow } from './schema-fields-editor';

export interface SchemaVersionView {
  id: string;
  version: number;
  status: 'active' | 'superseded';
  fields: SchemaFieldRow[];
}

export interface SchemaFamilyCardProps {
  orgId: string;
  projectId: string;
  kind: string;
  name: string;
  /** Oldest first — KAN-31 AC "register v1 -> evolve to v2 -> both queryable", so every past version renders, not just the latest. */
  versions: SchemaVersionView[];
}

function Flag({ on, label }: { on: boolean; label: string }): React.ReactElement {
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs', on ? 'font-medium text-foreground' : 'text-muted-foreground')}>
      {on ? <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" /> : <Minus className="h-3.5 w-3.5 opacity-40" aria-hidden="true" />}
      {label}
    </span>
  );
}

/**
 * One schema family (kind+name): the active version's fields up front, every superseded version one
 * click away (still rendered, so "both queryable" stays true), plus an "Evolve" action that opens a
 * form prefilled from the latest version.
 */
export function SchemaFamilyCard({ orgId, projectId, kind, name, versions }: SchemaFamilyCardProps): React.ReactElement {
  const t = useTranslations('SchemaRegistry');
  const [evolving, setEvolving] = useState(false);
  const latest = versions[versions.length - 1];
  const piiCount = latest?.fields.filter((field) => field.isPii).length ?? 0;

  function versionTable(version: SchemaVersionView): React.ReactElement {
    return (
      <div className="overflow-x-auto rounded-lg border border-border/70">
        <table className="w-full text-start text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-2.5 py-1.5 text-start font-medium">{t('fieldNameHeader')}</th>
              <th className="px-2.5 py-1.5 text-start font-medium">{t('fieldTypeHeader')}</th>
              <th className="px-2.5 py-1.5 text-start font-medium">{t('fieldRequiredHeader')}</th>
              <th className="px-2.5 py-1.5 text-start font-medium">{t('fieldPiiHeader')}</th>
              <th className="px-2.5 py-1.5 text-start font-medium">{t('fieldIdentityKeyHeader')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {version.fields.map((field) => (
              <tr key={field.name}>
                <td className="px-2.5 py-1.5 font-mono text-xs text-foreground" dir="ltr">
                  {field.name}
                </td>
                <td className="px-2.5 py-1.5">
                  <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{field.type}</span>
                </td>
                <td className="px-2.5 py-1.5">
                  <Flag on={field.isRequired} label={field.isRequired ? t('yes') : t('no')} />
                </td>
                <td className="px-2.5 py-1.5">
                  <Flag on={field.isPii} label={field.isPii ? t('yes') : t('no')} />
                </td>
                <td className="px-2.5 py-1.5">
                  <Flag on={field.isIdentityKey} label={field.isIdentityKey ? t('yes') : t('no')} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function versionLabel(version: SchemaVersionView): React.ReactElement {
    return (
      <span className={cn('text-xs font-medium', version.status === 'active' ? 'text-success' : 'text-muted-foreground')}>
        {t('versionStatusLabel', {
          version: version.version,
          status: version.status === 'active' ? t('activeLabel') : t('supersededLabel'),
        })}
      </span>
    );
  }

  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm" data-testid={`schema-family-${kind}-${name}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <SchemaKindIcon kind={kind} />
          <div className="min-w-0">
            <span className="block truncate font-semibold text-foreground">{t('familyHeading', { kind, name })}</span>
            <span className="block text-xs text-muted-foreground">
              {t('familyMeta', { fields: latest?.fields.length ?? 0, versions: versions.length, pii: piiCount })}
            </span>
          </div>
        </div>
        {!evolving ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setEvolving(true)}>
            {t('evolve')}
          </Button>
        ) : null}
      </div>

      {versions.map((version) =>
        version.status === 'active' ? (
          <div key={version.id} className="flex flex-col gap-1.5">
            {versionLabel(version)}
            {versionTable(version)}
          </div>
        ) : (
          <details key={version.id} className="group rounded-lg">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 [&::-webkit-details-marker]:hidden">
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
              {versionLabel(version)}
            </summary>
            <div className="mt-1.5">{versionTable(version)}</div>
          </details>
        ),
      )}

      {evolving && latest ? (
        <EvolveSchemaDefForm
          orgId={orgId}
          projectId={projectId}
          kind={kind}
          name={name}
          initialFields={latest.fields}
          onClose={() => setEvolving(false)}
        />
      ) : null}
    </li>
  );
}
