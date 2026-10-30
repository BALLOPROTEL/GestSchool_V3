import { Module } from '@nestjs/common';
import { SettingsService } from './application/settings.service.js';
import { SettingsRepository } from './domain/settings.repository.js';
import { SettingsDatabase } from './infrastructure/database.js';
import { PrismaSettingsRepository } from './infrastructure/settings.repository.js';
import { SettingsController } from './presentation/http/settings.controller.js';

@Module({
  controllers: [SettingsController],
  providers: [
    SettingsDatabase,
    SettingsService,
    { provide: SettingsRepository, useClass: PrismaSettingsRepository },
  ],
})
export class SettingsModule {}
