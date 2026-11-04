import { Module } from '@nestjs/common';
import { loadInfrastructureConfig } from '@gestschool/config/environment';

import { AvatarStorageService } from './avatar-storage.service.js';
import { InfrastructureHealthService } from './infrastructure-health.service.js';
import { INFRASTRUCTURE_CONFIGURATION } from './tokens.js';

@Module({
  exports: [AvatarStorageService, InfrastructureHealthService, INFRASTRUCTURE_CONFIGURATION],
  providers: [
    {
      provide: INFRASTRUCTURE_CONFIGURATION,
      useFactory: loadInfrastructureConfig,
    },
    AvatarStorageService,
    InfrastructureHealthService,
  ],
})
export class InfrastructureModule {}
