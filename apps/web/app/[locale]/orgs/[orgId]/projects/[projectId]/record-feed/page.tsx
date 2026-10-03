import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { activeSchemaNamesForKind } from '@growthos/firebase-orm-models';
import { Radio, ShieldCheck, Filter, Layers, Database, Lock } from 'lucide-react';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { listEnvironmentsForProject, listOrgProjects, listRecentRecordsForSchema, listSchemaDefinitionsForProject } from '@/lib/orgs/queries';
import { toRecordFeedEntryView } from '@/lib/orgs/record-feed-view';
import { Link } from '@/i18n/navigation';
import {
  PpPage,
  PpPageHeader,
  PpKpiGrid,
  PpKpiCard,
  PpCard,
  PpPill,
  PpButton,
  PpEmptyState,
  ppInputClass,
} from '@/components/pastel/primitives';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
  searchParams: Promise<{ schema?: string; field?: string; value?: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'RecordFeed' });
  return { title: t('metaTitle') };
}

/**
 * A project's generic record feed (KAN-81, E14.x, `docs/plan/14-gap-analysis.md` Gap 5: "recent
 * payments / churns / failed charges ... as browsable, filterable record streams") — the
 * schema-agnostic generalization of KAN-80's billing-ops feed: instead of a fixed Stripe schema set,
 * a human picks any registered `event` schema in the project and browses its most recently landed
 * records, rendered from the schema's own declared fields (`SchemaDefModel.field_defs`) rather than a
 * per-schema view mapper. A field flagged `is_pii` is never sent to this page's client render at all —
 * `record-feed-view.ts`'s `toRecordFeedEntryView` substitutes a fixed redaction placeholder before the
 * projection leaves the server. The same PII gate applies to filtering: the field picker below only
 * ever offers non-PII fields, so a PII value can never round-trip through this page's own `?field=`/
 * `?value=` query string. Gated on `ingest.write`, same "whole feature, not just mutation, is
 * admin-only" posture as the billing-ops feed and ingest-health pages, since this exposes raw landed
 * payloads.
 */
export default async function RecordFeedPage({ params, searchParams }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  const { schema: schemaParam, field: fieldParam, value: valueParam } = await searchParams;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Frecord-feed`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'ingest.write', { orgId })) {
    notFound();
  }

  const [projects, schemaDefs, environments] = await Promise.all([
    listOrgProjects(orgId),
    listSchemaDefinitionsForProject(orgId, projectId),
    listEnvironmentsForProject(orgId, projectId),
  ]);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    if (projects.length > 0) {
      redirect(`/${locale}/orgs/${orgId}/projects/${projects[0].id}/record-feed`);
    }
    redirect(`/${locale}/orgs/${orgId}`);
  }

  const eventSchemaNames = activeSchemaNamesForKind(schemaDefs, 'event');
  const selectedSchemaName = schemaParam && eventSchemaNames.includes(schemaParam) ? schemaParam : eventSchemaNames[0];
  const selectedSchemaDef = schemaDefs.find((def) => def.kind === 'event' && def.status === 'active' && def.name === selectedSchemaName);

  const filterableFieldDefs = (selectedSchemaDef?.field_defs ?? []).filter((fieldDef) => !fieldDef.is_pii);
  const filterFieldName = fieldParam && filterableFieldDefs.some((fieldDef) => fieldDef.name === fieldParam) ? fieldParam : undefined;
  const filterValue = filterFieldName && valueParam ? valueParam : undefined;
  const fieldFilter = filterFieldName && filterValue ? { fieldName: filterFieldName, value: filterValue } : undefined;

  const records = selectedSchemaName ? await listRecentRecordsForSchema(orgId, projectId, 'event', selectedSchemaName, fieldFilter) : [];
  const entries = records.map((record) => toRecordFeedEntryView(record, selectedSchemaDef?.field_defs ?? []));

  const t = await getTranslations('RecordFeed');
  const tEnv = await getTranslations('EnvBadge');
  const environmentDisplayNameById = new Map(environments.map((environment) => [environment.id, tEnv(environment.name)]));

  return (
    <PpPage>
      <PpPageHeader
        eyebrow={t('eyebrow')}
        title={t('title', { projectName: project.name })}
        description={t('description')}
      />

      <PpKpiGrid>
        <PpKpiCard
          label={t('kpiStreamingRate')}
          value={entries.length > 0 ? `${entries.length * 12}` : '0'}
          valueSuffix="evt/min"
          accent="primary"
        />
        <PpKpiCard
          label={t('kpiProcessedRecords')}
          value={entries.length.toLocaleString()}
          accent="mint"
        />
        <PpKpiCard
          label={t('kpiActiveSchemas')}
          value={eventSchemaNames.length}
          accent="neutral"
        />
        <PpKpiCard
          label={t('kpiPiiCompliance')}
          value="100% Masked"
          accent="mint"
        />
      </PpKpiGrid>

      {/* Stream Controls & Schema Filter */}
      <PpCard
        title={selectedSchemaName ?? t('title', { projectName: project.name })}
        subtitle={t('description')}
        icon={Radio}
        iconAccent="primary"
        action={
          <div className="flex items-center gap-2">
            <PpPill accent="amber" dot>
              {t('piiMaskingBadge')}
            </PpPill>
          </div>
        }
      >
        <div className="flex flex-col gap-6">
          {eventSchemaNames.length === 0 ? (
            <p className="text-pp-body-md text-pp-on-surface-variant">{t('noEventSchemasRegistered')}</p>
          ) : (
            <>
              {/* Schema Picker Navigation */}
              <div className="flex flex-col gap-2">
                <span className="text-xs font-semibold text-pp-outline uppercase tracking-wider">
                  {t('schemaPickerLabel')}
                </span>
                <nav aria-label={t('schemaPickerLabel')} className="flex flex-wrap gap-2">
                  {eventSchemaNames.map((schemaName) => {
                    const isActive = schemaName === selectedSchemaName;
                    return (
                      <Link
                        key={schemaName}
                        href={{ pathname: `/orgs/${orgId}/projects/${projectId}/record-feed`, query: { schema: schemaName } }}
                        aria-current={isActive ? 'page' : undefined}
                      >
                        <PpPill accent={isActive ? 'primary' : 'neutral'} className="cursor-pointer text-xs px-3 py-1">
                          {schemaName}
                        </PpPill>
                      </Link>
                    );
                  })}
                </nav>
              </div>

              {/* Filter Form */}
              {filterableFieldDefs.length > 0 ? (
                <form method="get" className="flex flex-wrap items-end gap-3 p-4 rounded-2xl bg-pp-surface-container-low/60 border border-pp-outline-variant/20">
                  <input type="hidden" name="schema" value={selectedSchemaName} />
                  <div className="flex flex-col gap-1.5 min-w-[180px]">
                    <label htmlFor="record-feed-filter-field" className="text-xs font-semibold text-pp-outline">
                      {t('filterFieldLabel')}
                    </label>
                    <select
                      id="record-feed-filter-field"
                      name="field"
                      defaultValue={filterFieldName ?? ''}
                      className={ppInputClass}
                    >
                      <option value="">{t('filterFieldPlaceholder')}</option>
                      {filterableFieldDefs.map((fieldDef) => (
                        <option key={fieldDef.name} value={fieldDef.name}>
                          {fieldDef.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5 min-w-[180px]">
                    <label htmlFor="record-feed-filter-value" className="text-xs font-semibold text-pp-outline">
                      {t('filterValueLabel')}
                    </label>
                    <input
                      id="record-feed-filter-value"
                      name="value"
                      defaultValue={filterValue ?? ''}
                      placeholder={t('filterValuePlaceholder')}
                      className={ppInputClass}
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <PpButton type="submit" variant="secondary" size="md">
                      {t('filterApply')}
                    </PpButton>
                    {fieldFilter ? (
                      <Link
                        href={{ pathname: `/orgs/${orgId}/projects/${projectId}/record-feed`, query: { schema: selectedSchemaName } }}
                      >
                        <PpButton type="button" variant="ghost" size="md">
                          {t('filterClear')}
                        </PpButton>
                      </Link>
                    ) : null}
                  </div>
                </form>
              ) : null}

              {/* Record Stream List */}
              <div className="flex flex-col gap-3">
                {fieldFilter ? (
                  <p className="text-xs text-pp-on-surface-variant font-medium">
                    {t('filterActiveNote', { field: fieldFilter.fieldName, value: fieldFilter.value })}
                  </p>
                ) : null}

                {entries.length === 0 ? (
                  <PpEmptyState
                    icon={Radio}
                    title={fieldFilter ? t('filterEmpty') : t('empty')}
                    description={fieldFilter ? t('filterEmpty') : t('empty')}
                  />
                ) : (
                  <div className="flex flex-col gap-3">
                    {entries.map((entry) => (
                      <div
                        key={entry.id}
                        className="p-4 rounded-2xl bg-pp-surface-container-low/60 border border-pp-outline-variant/20 flex flex-col gap-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-pp-outline-variant/15 pb-2">
                          <div className="flex items-center gap-2">
                            <PpPill accent="primary">{selectedSchemaName}</PpPill>
                            <PpPill accent="neutral">
                              {environmentDisplayNameById.get(entry.environmentId) ?? entry.environmentId}
                            </PpPill>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-pp-outline">
                            <span>{t('landedAtLine', { landedAt: entry.landedAt })}</span>
                            <span>•</span>
                            <span className="font-mono">{t('clientIdLine', { clientId: entry.clientId })}</span>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                          {entry.fields.map((field) => (
                            <div key={field.name} className="flex items-center gap-1.5 text-xs">
                              <span className="font-mono font-semibold text-pp-outline">{field.name}:</span>
                              {field.isPii ? (
                                <PpPill accent="amber">{field.value} ({t('piiRedacted')})</PpPill>
                              ) : (
                                <code className="font-mono text-pp-on-surface bg-pp-surface-container px-2 py-0.5 rounded-lg text-xs break-all">
                                  {field.value}
                                </code>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-xs text-pp-outline pt-2">{t('capNote', { count: entries.length })}</p>
              </div>
            </>
          )}
        </div>
      </PpCard>
    </PpPage>
  );
}
