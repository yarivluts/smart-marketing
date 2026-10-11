import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import type { EnvironmentModel } from '@growthos/firebase-orm-models';
import { environmentCookieName, pickSelectedEnvironment } from './environment-selection';
import { listEnvironmentsForProject } from './queries';

export interface SelectedEnvironmentResolution {
  /** The environment every data read on the current project page should be scoped to, or `null` if the project has none. */
  selected: EnvironmentModel | null;
  environments: EnvironmentModel[];
}

/**
 * The project environment the viewer picked in the project shell's environment picker (KAN-196),
 * read from its `gos_env_<projectId>` cookie. See `pickSelectedEnvironment` for the fallback order.
 *
 * Wrapped in React's `cache()` because the project layout (to render the picker) and the page it
 * wraps (to scope its reads) both call this for the same request, same reasoning as
 * `getServerSession`'s own doc comment.
 */
export const resolveSelectedEnvironment = cache(async (organizationId: string, projectId: string): Promise<SelectedEnvironmentResolution> => {
  const [cookieStore, environments] = await Promise.all([cookies(), listEnvironmentsForProject(organizationId, projectId)]);
  const cookieValue = cookieStore.get(environmentCookieName(projectId))?.value;
  return { selected: pickSelectedEnvironment(environments, cookieValue), environments };
});
