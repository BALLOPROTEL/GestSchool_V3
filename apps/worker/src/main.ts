import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { WorkerModule } from './worker.module.js';

const bootstrap = async (): Promise<void> => {
  const application = await NestFactory.createApplicationContext(WorkerModule);

  application.enableShutdownHooks();
  new Logger('Worker').log('GestSchool worker is ready');
};

await bootstrap();
