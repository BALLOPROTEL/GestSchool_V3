import { Module } from '@nestjs/common';
import { NotificationsService } from './application/notifications.service.js';
import { NotificationsDatabase } from './infrastructure/notifications.database.js';
import { NotificationsController } from './presentation/http/notifications.controller.js';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsDatabase, NotificationsService],
})
export class NotificationsModule {}
