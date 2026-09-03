import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';

const bootstrap = async (): Promise<void> => {
  const application = await NestFactory.create(AppModule);
  const port = Number.parseInt(process.env.API_PORT ?? '3001', 10);

  await application.listen(port, '0.0.0.0');
};

await bootstrap();
