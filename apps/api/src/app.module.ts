import { Module } from '@nestjs/common';

import { AppController } from './app.controller.js';
import { InfrastructureModule } from './infrastructure/infrastructure.module.js';
import { IamModule } from './modules/iam/iam.module.js';

@Module({
  controllers: [AppController],
  imports: [InfrastructureModule, IamModule],
})
export class AppModule {}
