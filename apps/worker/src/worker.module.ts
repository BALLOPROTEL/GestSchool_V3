import { Module } from '@nestjs/common';
import { loadInfrastructureConfig } from '@gestschool/config/environment';

import { EnvironmentVerifier } from './infrastructure/environment-verifier.service.js';
import { WORKER_CONFIGURATION } from './infrastructure/tokens.js';

@Module({
  providers: [
    {
      provide: WORKER_CONFIGURATION,
      useFactory: loadInfrastructureConfig,
    },
    EnvironmentVerifier,
  ],
})
export class WorkerModule {}
