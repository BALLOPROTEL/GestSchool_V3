import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';
import {
  INFRASTRUCTURE_CONFIGURATION,
  type InfrastructureConfiguration,
} from './infrastructure/tokens.js';

const bootstrap = async (): Promise<void> => {
  const application = await NestFactory.create(AppModule);
  const configuration = application.get<InfrastructureConfiguration>(INFRASTRUCTURE_CONFIGURATION);

  await application.listen(configuration.apiPort, '127.0.0.1');
};

await bootstrap();
