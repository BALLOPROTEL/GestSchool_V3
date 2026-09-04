import { Module } from '@nestjs/common';

import { AppController } from './app.controller.js';
import { InfrastructureModule } from './infrastructure/infrastructure.module.js';

@Module({
  controllers: [AppController],
  imports: [InfrastructureModule],
})
export class AppModule {}
