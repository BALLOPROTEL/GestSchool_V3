import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import type { InfrastructureConfig } from '@gestschool/config/environment';
import {
  checkInfrastructure,
  closeInfrastructureChecks,
  createInfrastructureChecks,
  isInfrastructureReady,
  type DependencyStates,
  type InfrastructureChecks,
} from '@gestschool/infrastructure';

import { WORKER_CONFIGURATION } from './tokens.js';

@Injectable()
export class EnvironmentVerifier implements OnApplicationShutdown {
  private readonly checks: InfrastructureChecks;

  constructor(
    @Inject(WORKER_CONFIGURATION)
    configuration: InfrastructureConfig,
  ) {
    this.checks = createInfrastructureChecks(configuration);
  }

  async verify(): Promise<DependencyStates> {
    const states = await checkInfrastructure(this.checks);
    if (!isInfrastructureReady(states)) {
      const unavailable = Object.entries(states)
        .filter(([, state]) => state === 'down')
        .map(([name]) => name)
        .join(', ');
      throw new Error(`Worker dependencies unavailable: ${unavailable}`);
    }
    return states;
  }

  async onApplicationShutdown(): Promise<void> {
    await closeInfrastructureChecks(this.checks);
  }
}
