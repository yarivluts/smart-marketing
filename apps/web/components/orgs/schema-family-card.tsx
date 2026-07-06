'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { EvolveSchemaDefForm } from './evolve-schema-def-form';
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

/** One schema family (kind+name): every version's field table, plus an "Evolve" action that opens a form prefilled from the latest version. */
export function SchemaFamilyCard({ orgId, projectId, kind, name, versions }: SchemaFamilyCardProps): React.ReactElement {
  const t = useTranslations('SchemaRegistry');
  const [evolving, setEvolving] = useState(false);
  const latest = versions[versions.length - 1];

  return (
    <li className="flex flex-col gap-3 rounded-md border border-input p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{t('familyHeading', { kind, name })}</span>
        {!evolving ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setEvolving(true)}>
            {t('evolve')}
          </Button>
        ) : null}
      </div>

      {versions.map((version) => (
        <div key={version.id} className="flex flex-col gap-1.5">
          <span className="text-sm text-muted-foreground">
            {t('versionStatusLabel', {
              version: version.version,
              status: version.status === 'active' ? t('activeLabel') : t('supersededLabel'),
            })}
          </span>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="pr-3">{t('fieldNameHeader')}</th>
                  <th className="pr-3">{t('fieldTypeHeader')}</th>
                  <th className="pr-3">{t('fieldRequiredHeader')}</th>
                  <th className="pr-3">{t('fieldPiiHeader')}</th>
                  <th>{t('fieldIdentityKeyHeader')}</th>
                </tr>
              </thead>
              <tbody>
                {version.fields.map((field) => (
                  <tr key={field.name}>
                    <td className="pr-3">{field.name}</td>
                    <td className="pr-3">{field.type}</td>
                    <td className="pr-3">{field.isRequired ? t('yes') : t('no')}</td>
                    <td className="pr-3">{field.isPii ? t('yes') : t('no')}</td>
                    <td>{field.isIdentityKey ? t('yes') : t('no')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

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
