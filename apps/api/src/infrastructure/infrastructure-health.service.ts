import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import {
  checkInfrastructure,
  closeInfrastructureChecks,
  createInfrastructureChecks,
  type DependencyStates,
  type InfrastructureChecks,
} from '@gestschool/infrastructure';

import { INFRASTRUCTURE_CONFIGURATION, type InfrastructureConfiguration } from './tokens.js';

@Injectable()
export class InfrastructureHealthService implements OnApplicationShutdown {
  private readonly checks: InfrastructureChecks;

  constructor(
    @Inject(INFRASTRUCTURE_CONFIGURATION)
    configuration: InfrastructureConfiguration,
  ) {
    this.checks = createInfrastructureChecks(configuration);
  }

  async check(): Promise<DependencyStates> {
    return checkInfrastructure(this.checks);
  }

  async onApplicationShutdown(): Promise<void> {
    await closeInfrastructureChecks(this.checks);
  }
}
