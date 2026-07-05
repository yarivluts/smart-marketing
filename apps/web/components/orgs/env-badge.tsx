import { getTranslations } from 'next-intl/server';
import { ENVIRONMENTS, type Environment } from '@growthos/shared';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

export interface EnvBadgeProps {
  orgId: string;
  projectId: string;
  currentEnv: Environment;
}

const ENV_ACTIVE_CLASS: Record<Environment, string> = {
  dev: 'bg-slate-500 text-white',
  staging: 'bg-amber-500 text-white',
  prod: 'bg-red-600 text-white',
};

/** Fixed dev/staging/prod pills — switching is a plain navigation, no client state to manage. */
export async function EnvBadge({ orgId, projectId, currentEnv }: EnvBadgeProps): Promise<React.ReactElement> {
  const t = await getTranslations('EnvBadge');

  return (
    <div role="group" aria-label={t('label')} className="flex gap-2">
      {ENVIRONMENTS.map((env) => {
        const isActive = env === currentEnv;
        return (
          <Link
            key={env}
            href={{ pathname: `/orgs/${orgId}`, query: { project: projectId, env } }}
            aria-current={isActive ? 'true' : undefined}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-semibold uppercase',
              isActive ? ENV_ACTIVE_CLASS[env] : 'bg-muted text-muted-foreground hover:bg-accent',
            )}
          >
            {t(env)}
          </Link>
        );
      })}
    </div>
  );
}
