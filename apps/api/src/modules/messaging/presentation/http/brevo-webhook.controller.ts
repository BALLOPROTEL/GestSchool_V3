import { Body, Controller, Headers, Inject, Post } from '@nestjs/common';
import { Public } from '../../../iam/presentation/http/security.js';
import { MessagingWebhookService } from '../../application/webhook.service.js';

@Controller('api/v1/webhooks/brevo')
export class BrevoWebhookController {
  constructor(@Inject(MessagingWebhookService) private readonly webhook: MessagingWebhookService) {}

  @Post()
  @Public()
  accept(@Headers('authorization') authorization: string | undefined, @Body() payload: unknown) {
    return this.webhook.accept(authorization, payload);
  }
}
