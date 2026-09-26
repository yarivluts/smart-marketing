import { Controller, Get, Header } from '@nestjs/common';
import { HealthService, type HealthStatus } from './health.service';
import { DbtRefreshBuildService, type DbtRefreshBuildStatus } from './dbt-refresh-build.service';
import { Public } from '../authz/public.decorator';

@Controller('health')
@Public()
export class HealthController {
  constructor(
    private readonly healthService: HealthService,
    private readonly dbtRefreshBuild: DbtRefreshBuildService,
  ) {}

  @Get()
  getHealth(): HealthStatus {
    return this.healthService.getHealth();
  }

  /**
   * The build the scheduled dbt-refresh job last ran (KAN-204). Public for the same
   * reason `/v1/health` is: the drift check reads it with no credentials. See
   * {@link DbtRefreshBuildService} for why the API reports on the job's behalf.
   * The service caches the warehouse read; `no-store` stops anything in between
   * from adding a second, unbounded layer of staleness on top.
   */
  @Get('dbt-refresh')
  @Header('Cache-Control', 'no-store')
  getDbtRefreshBuild(): Promise<DbtRefreshBuildStatus> {
    return this.dbtRefreshBuild.getBuild();
  }
}
