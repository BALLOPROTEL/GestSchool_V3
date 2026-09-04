import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import type { DependencyStates } from '@gestschool/infrastructure';
import { isInfrastructureReady } from '@gestschool/infrastructure';

import { InfrastructureHealthService } from './infrastructure/infrastructure-health.service.js';

export type LiveHealth = Readonly<{
  status: 'ok';
}>;

export type ReadyHealth = Readonly<{
  dependencies: DependencyStates;
  status: 'error' | 'ok';
}>;

type ReadinessProvider = Pick<InfrastructureHealthService, 'check'>;

@Controller('health')
export class AppController {
  constructor(
    @Inject(InfrastructureHealthService)
    private readonly readiness: ReadinessProvider,
  ) {}

  @Get('live')
  getLiveHealth(): LiveHealth {
    return { status: 'ok' };
  }

  @Get('ready')
  async getReadyHealth(): Promise<ReadyHealth> {
    const dependencies = await this.readiness.check();
    const response: ReadyHealth = {
      dependencies,
      status: isInfrastructureReady(dependencies) ? 'ok' : 'error',
    };

    if (response.status === 'error') throw new ServiceUnavailableException(response);
    return response;
  }
}
