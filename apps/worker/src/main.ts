import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { EnvironmentVerifier } from './infrastructure/environment-verifier.service.js';
import { WorkerModule } from './worker.module.js';

const logger = new Logger('Worker');

const waitForShutdown = (): Promise<void> =>
  new Promise((resolve) => {
    const keepAliveTimer = setInterval(() => undefined, 60_000);
    const shutdown = () => {
      clearInterval(keepAliveTimer);
      process.off('SIGINT', shutdown);
      process.off('SIGTERM', shutdown);
      resolve();
    };

    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  });

const bootstrap = async (): Promise<void> => {
  const application = await NestFactory.createApplicationContext(WorkerModule);

  try {
    const dependencies = await application.get(EnvironmentVerifier).verify();
    logger.log(
      `Dependencies ready (postgres=${dependencies.postgres}, redis=${dependencies.redis}, storage=${dependencies.storage})`,
    );
    logger.log('GestSchool worker is ready');
    await waitForShutdown();
  } finally {
    await application.close();
  }
};

try {
  await bootstrap();
} catch (error) {
  logger.error(error instanceof Error ? error.message : 'Worker startup failed');
  process.exitCode = 1;
}
