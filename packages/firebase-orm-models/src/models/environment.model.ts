import { BaseModel, Field, Model } from '@arbel/firebase-orm';
import type { Environment } from '@growthos/shared';

/** dev/staging/prod slice of a project. Leaf of the tenancy hierarchy. */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/environments',
  path_id: 'environment_id',
})
export class EnvironmentModel extends BaseModel {
  @Field({ is_required: true })
  public name!: Environment;

  @Field({ is_required: true })
  public project_id!: string;
}
