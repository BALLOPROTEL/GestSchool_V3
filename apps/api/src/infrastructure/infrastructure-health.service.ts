import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import {
  checkInfrastructure,
  closeInfrastructureChecks,
  createInfrastructureChecks,
  type DependencyStates,
  type InfrastructureChecks,
} from '@gestschool/infrastructure';

import { INFRASTRUCTURE_CONFIGURATION, type InfrastructureConfiguration } from './tokens.js';

const readinessCacheMilliseconds = 60_000;

@Injectable()
export class InfrastructureHealthService implements OnApplicationShutdown {
  private readonly checks: InfrastructureChecks;
  private cached: { states: DependencyStates; until: number } | undefined;
  private checking: Promise<DependencyStates> | undefined;

  constructor(
    @Inject(INFRASTRUCTURE_CONFIGURATION)
    configuration: InfrastructureConfiguration,
  ) {
    this.checks = createInfrastructureChecks(configuration);
  }

  async check(): Promise<DependencyStates> {
    if (this.cached && this.cached.until > Date.now()) return this.cached.states;
    this.checking ??= checkInfrastructure(this.checks)
      .then((states) => {
        this.cached = { states, until: Date.now() + readinessCacheMilliseconds };
        return states;
      })
      .finally(() => {
        this.checking = undefined;
      });
    return this.checking;
  }

  async onApplicationShutdown(): Promise<void> {
    await closeInfrastructureChecks(this.checks);
  }
}
