import 'reflect-metadata';

import type { Server } from 'node:http';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';
import { configureIamHttp } from './modules/iam/presentation/http/security.js';
import { runStagingBootstrapStartup } from './infrastructure/staging-bootstrap-startup.js';
import {
  INFRASTRUCTURE_CONFIGURATION,
  type InfrastructureConfiguration,
} from './infrastructure/tokens.js';

const bootstrap = async (): Promise<void> => {
  const application = await NestFactory.create(AppModule);
  configureIamHttp(application);

  // Keep the upstream proxy from reusing a socket while Node is closing it.
  const httpServer = application.getHttpServer() as Server;
  httpServer.keepAliveTimeout = 65_000;
  httpServer.keepAliveTimeoutBuffer = 5_000;
  httpServer.headersTimeout = 75_000;
  httpServer.requestTimeout = 120_000;
  httpServer.maxHeadersCount = 100;

  const configuration = application.get<InfrastructureConfiguration>(INFRASTRUCTURE_CONFIGURATION);

  await application.listen(configuration.apiPort, configuration.apiHost);
};

try {
  await runStagingBootstrapStartup();
} catch {
  process.stderr.write(
    '{"check":"LOT14_BOOTSTRAP_STARTUP","status":"FAIL","code":"LOT14_BOOTSTRAP_STARTUP_FAILED"}\n',
  );
  process.exit(1);
}

await bootstrap();
