import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { listOrgProjects, listSchemaDefinitionsForProject } from '@/lib/orgs/queries';
import { toSchemaDefView, type SchemaDefView } from '@/lib/orgs/schema-def-view';
import { RegisterSchemaDefForm } from '@/components/orgs/register-schema-def-form';
import { SchemaFamilyCard, type SchemaVersionView } from '@/components/orgs/schema-family-card';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'SchemaRegistry' });
  return { title: t('metaTitle') };
}

interface SchemaFamily {
  kind: string;
  name: string;
  versions: SchemaVersionView[];
}

// Client components only ever receive plain serializable data (never an
// `@arbel/firebase-orm` model instance) — reuses the same field mapping the
// API routes use (`toSchemaDefView`) rather than a second, independently
// maintained copy of it.
function groupIntoFamilies(views: readonly SchemaDefView[]): SchemaFamily[] {
  const familiesByKey = new Map<string, SchemaFamily>();
  for (const view of views) {
    const key = `${view.kind}:${view.name}`;
    const family = familiesByKey.get(key) ?? { kind: view.kind, name: view.name, versions: [] };
    family.versions.push({ id: view.id, version: view.version, status: view.status, fields: view.fields });
    familiesByKey.set(key, family);
  }
  return [...familiesByKey.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
}

/**
 * A project's Schema Registry (KAN-31): every registered entity/event/measure
 * schema, every version of each ("register v1 -> evolve to v2 -> both
 * queryable"), and a form to register a new one or evolve an existing family
 * to its next version. Gated on `schema.write` for the whole page — same
 * "whole feature, not just mutation, is admin-only" posture as KAN-30's keys
 * page, since a schema's field list (including which fields carry PII) is
 * sensitive enough to keep to roles trusted to manage it.
 */
export default async function SchemaRegistryPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Fschema-defs`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'schema.write', { orgId })) {
    notFound();
  }

  const [projects, schemaDefs] = await Promise.all([
    listOrgProjects(orgId),
    listSchemaDefinitionsForProject(orgId, projectId),
  ]);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    notFound();
  }

  const families = groupIntoFamilies(schemaDefs.map(toSchemaDefView));

  const t = await getTranslations('SchemaRegistry');

  return (
    <main className="container mx-auto flex max-w-3xl flex-col gap-8 py-16">
      <h1 className="text-3xl font-bold tracking-tight">{t('title', { projectName: project.name })}</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('registeredHeading')}</h2>
        {families.length === 0 ? (
          <p className="text-muted-foreground">{t('noSchemas')}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {families.map((family) => (
              <SchemaFamilyCard
                key={`${family.kind}:${family.name}`}
                orgId={orgId}
                projectId={projectId}
                kind={family.kind}
                name={family.name}
                versions={family.versions}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('registerHeading')}</h2>
        <RegisterSchemaDefForm orgId={orgId} projectId={projectId} />
      </section>
    </main>
  );
}
