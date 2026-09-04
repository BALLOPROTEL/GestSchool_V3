import { Module } from '@nestjs/common';
import { loadInfrastructureConfig } from '@gestschool/config/environment';

import { InfrastructureHealthService } from './infrastructure-health.service.js';
import { INFRASTRUCTURE_CONFIGURATION } from './tokens.js';

@Module({
  exports: [InfrastructureHealthService, INFRASTRUCTURE_CONFIGURATION],
  providers: [
    {
      provide: INFRASTRUCTURE_CONFIGURATION,
      useFactory: loadInfrastructureConfig,
    },
    InfrastructureHealthService,
  ],
})
export class InfrastructureModule {}
