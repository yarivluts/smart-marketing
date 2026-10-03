'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { PpButton, PpCard, PpPill, PpTable } from '@/components/pastel/primitives';
import { GitBranch, Layers } from 'lucide-react';
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
  /** Oldest first. */
  versions: SchemaVersionView[];
}

/** One schema family (kind+name): every version's field table, plus an "Evolve" action. */
export function SchemaFamilyCard({ orgId, projectId, kind, name, versions }: SchemaFamilyCardProps): React.ReactElement {
  const t = useTranslations('SchemaRegistry');
  const [evolving, setEvolving] = useState(false);
  const latest = versions[versions.length - 1];

  return (
    <PpCard
      as="article"
      title={name}
      subtitle={
        <span className="flex items-center gap-2">
          <span className="font-mono text-xs">{kind}</span>
          <span>·</span>
          <span>{t('familyHeading', { kind, name })}</span>
        </span>
      }
      icon={Layers}
      iconAccent={kind === 'event' ? 'primary' : kind === 'entity' ? 'mint' : 'amber'}
      action={
        <div className="flex items-center gap-2">
          <PpPill accent={kind === 'event' ? 'primary' : kind === 'entity' ? 'mint' : 'amber'}>
            {kind}
          </PpPill>
          {!evolving ? (
            <PpButton type="button" variant="secondary" size="sm" icon={GitBranch} onClick={() => setEvolving(true)}>
              {t('evolve')}
            </PpButton>
          ) : null}
        </div>
      }
    >
      <div className="space-y-6">
        {versions.map((version) => (
          <div key={version.id} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-semibold text-pp-on-surface-variant">
                {t('versionStatusLabel', {
                  version: version.version,
                  status: version.status === 'active' ? t('activeLabel') : t('supersededLabel'),
                })}
              </span>
              <PpPill accent={version.status === 'active' ? 'mint' : 'neutral'} dot={version.status === 'active'}>
                {version.status === 'active' ? t('activeLabel') : t('supersededLabel')}
              </PpPill>
            </div>
            <PpTable>
              <thead>
                <tr>
                  <th>{t('fieldNameHeader')}</th>
                  <th>{t('fieldTypeHeader')}</th>
                  <th>{t('fieldRequiredHeader')}</th>
                  <th>{t('fieldPiiHeader')}</th>
                  <th>{t('fieldIdentityKeyHeader')}</th>
                </tr>
              </thead>
              <tbody>
                {version.fields.map((field) => (
                  <tr key={field.name}>
                    <td className="font-mono text-xs font-bold text-pp-on-surface">{field.name}</td>
                    <td className="font-mono text-xs text-pp-primary">{field.type}</td>
                    <td>{field.isRequired ? <PpPill accent="amber">{t('yes')}</PpPill> : <span className="text-pp-outline">{t('no')}</span>}</td>
                    <td>{field.isPii ? <PpPill accent="pink">{t('yes')}</PpPill> : <span className="text-pp-outline">{t('no')}</span>}</td>
                    <td>{field.isIdentityKey ? <PpPill accent="sky">{t('yes')}</PpPill> : <span className="text-pp-outline">{t('no')}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </PpTable>
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
      </div>
    </PpCard>
  );
}
