import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { loadInfrastructureConfig } from '@gestschool/config/environment';
import { IamRuntime } from './infrastructure/iam-runtime.js';
import { loadIamConfig } from './infrastructure/iam-config.js';
import { AuthController, IamAdminController } from './presentation/http/auth.controller.js';
import {
  AuthenticationGuard,
  BrowserSecurityGuard,
  IamExceptionFilter,
  PermissionGuard,
  SessionGuard,
  TenantGuard,
} from './presentation/http/security.js';

@Module({
  controllers: [AuthController, IamAdminController],
  providers: [
    {
      provide: IamRuntime,
      useFactory: () => {
        const infrastructure = loadInfrastructureConfig();
        return new IamRuntime(loadIamConfig(), infrastructure.databaseUrl, infrastructure.redisUrl);
      },
    },
    { provide: APP_GUARD, useClass: BrowserSecurityGuard },
    { provide: APP_GUARD, useClass: AuthenticationGuard },
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
    { provide: APP_FILTER, useClass: IamExceptionFilter },
  ],
  exports: [IamRuntime],
})
export class IamModule {}
