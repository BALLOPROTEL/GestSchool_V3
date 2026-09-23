import { Module } from '@nestjs/common';
import { MessagingWebhookService } from './application/webhook.service.js';
import { BrevoWebhookController } from './presentation/http/brevo-webhook.controller.js';
import { CommunicationsService } from './application/communications.service.js';
import { MessagingDatabase } from './infrastructure/messaging.database.js';
import { CommunicationsController } from './presentation/http/communications.controller.js';
import { TemplatesService } from './application/templates.service.js';
import { TemplatesController } from './presentation/http/templates.controller.js';

@Module({
  controllers: [CommunicationsController, TemplatesController, BrevoWebhookController],
  providers: [MessagingDatabase, CommunicationsService, TemplatesService, MessagingWebhookService],
})
export class MessagingModule {}
