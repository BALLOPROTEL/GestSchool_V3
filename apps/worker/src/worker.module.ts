import { Module } from '@nestjs/common';
import { loadInfrastructureConfig } from '@gestschool/config/environment';

import { EnvironmentVerifier } from './infrastructure/environment-verifier.service.js';
import { WORKER_CONFIGURATION } from './infrastructure/tokens.js';
import { DocumentsRuntime } from './jobs/documents-runtime.js';

@Module({
  providers: [
    {
      provide: WORKER_CONFIGURATION,
      useFactory: loadInfrastructureConfig,
    },
    EnvironmentVerifier,
    DocumentsRuntime,
  ],
})
export class WorkerModule {}
