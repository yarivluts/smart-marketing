import { getTranslations } from 'next-intl/server';
import type { ProjectModel } from '@growthos/firebase-orm-models';
import type { Environment } from '@growthos/shared';
import { Link } from '@/i18n/navigation';

export interface ProjectSwitcherProps {
  orgId: string;
  projects: ProjectModel[];
  currentProjectId?: string;
  currentEnv: Environment;
}

/** Renders every project in the org as a link-pill — no client JS needed, switching is just navigation. */
export async function ProjectSwitcher({
  orgId,
  projects,
  currentProjectId,
  currentEnv,
}: ProjectSwitcherProps): Promise<React.ReactElement> {
  const t = await getTranslations('ProjectSwitcher');

  return (
    <nav aria-label={t('label')} className="flex flex-wrap gap-2">
      {projects.map((project) => {
        const isActive = project.id === currentProjectId;
        return (
          <Link
            key={project.id}
            href={{ pathname: `/orgs/${orgId}`, query: { project: project.id, env: currentEnv } }}
            aria-current={isActive ? 'page' : undefined}
            className={
              isActive
                ? 'rounded-full border border-primary bg-primary px-3 py-1 text-sm text-primary-foreground'
                : 'rounded-full border border-input px-3 py-1 text-sm hover:bg-accent'
            }
          >
            {project.name}
          </Link>
        );
      })}
    </nav>
  );
}
