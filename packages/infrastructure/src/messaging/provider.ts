import { chmod, mkdir, open } from 'node:fs/promises';
import type { MessagingConfig } from '@gestschool/config/messaging';

export interface OutgoingEmail {
  messageId: string;
  idempotencyKey: string;
  to: string;
  subject: string;
  html: string;
}
export interface OutgoingWhatsApp {
  messageId: string;
  to: string;
  text: string;
  locale: 'fr' | 'en' | 'ar';
}
export interface ProviderReceipt {
  providerMessageId: string;
}
export interface MessagingProvider {
  readonly name: 'LOCAL' | 'BREVO';
  sendEmail(message: OutgoingEmail): Promise<ProviderReceipt>;
  sendWhatsApp(message: OutgoingWhatsApp): Promise<ProviderReceipt>;
}

// Captures only in the ignored, owner-only local fixture. It is intentionally
// outside API responses and logs because IAM links may contain one-time tokens.
export class LocalMessagingProvider implements MessagingProvider {
  readonly name = 'LOCAL' as const;
  constructor(
    private readonly path = new URL('../../../../.local/messaging-delivery.jsonl', import.meta.url),
  ) {
    if (process.env['NODE_ENV'] === 'production') throw new Error('LOCAL_PROVIDER_FORBIDDEN');
  }

  private async capture(channel: 'EMAIL' | 'WHATSAPP', message: OutgoingEmail | OutgoingWhatsApp) {
    if (process.env['NODE_ENV'] === 'production') throw new Error('LOCAL_PROVIDER_FORBIDDEN');
    const directory = new URL('./', this.path);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700);
    const handle = await open(this.path, 'a', 0o600);
    try {
      await handle.chmod(0o600);
      await handle.appendFile(
        `${JSON.stringify({ channel, capturedAt: new Date().toISOString(), ...message })}\n`,
      );
    } finally {
      await handle.close();
    }
    return { providerMessageId: `local:${message.messageId}` };
  }
  sendEmail(message: OutgoingEmail): Promise<ProviderReceipt> {
    return this.capture('EMAIL', message);
  }
  sendWhatsApp(message: OutgoingWhatsApp): Promise<ProviderReceipt> {
    return this.capture('WHATSAPP', message);
  }
}

export class MessagingProviderError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export class BrevoMessagingProvider implements MessagingProvider {
  readonly name = 'BREVO' as const;
  constructor(private readonly config: MessagingConfig) {
    if (config.mode !== 'brevo' || !config.apiKey || !config.emailSender)
      throw new Error('Brevo provider configuration is incomplete');
  }
  private async send(path: string, payload: unknown): Promise<ProviderReceipt> {
    const response = await fetch(`https://api.brevo.com/v3/${path}`, {
      method: 'POST',
      redirect: 'error',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'api-key': this.config.apiKey!,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    }).catch(() => {
      throw new MessagingProviderError('BREVO_CONNECTION_UNCERTAIN');
    });
    if (response.status !== 201) {
      // Never include a provider response: it may echo API keys, addresses or bodies.
      throw new MessagingProviderError(`BREVO_HTTP_${response.status}`);
    }
    const receipt: unknown = await response.json().catch(() => null);
    if (
      typeof receipt !== 'object' ||
      receipt === null ||
      !('messageId' in receipt) ||
      typeof receipt.messageId !== 'string' ||
      receipt.messageId.length === 0 ||
      receipt.messageId.length > 255
    )
      throw new MessagingProviderError('BREVO_RESPONSE_UNCERTAIN');
    return { providerMessageId: receipt.messageId };
  }
  sendEmail(message: OutgoingEmail): Promise<ProviderReceipt> {
    if (
      this.config.stagingEmailRecipient !== undefined &&
      message.to.trim().toLowerCase() !== this.config.stagingEmailRecipient
    )
      throw new MessagingProviderError('STAGING_RECIPIENT_NOT_AUTHORIZED');
    return this.send('smtp/email', {
      sender: { email: this.config.emailSender, name: this.config.emailSenderName },
      to: [{ email: message.to }],
      subject: message.subject,
      htmlContent: message.html,
      headers: { idempotencyKey: message.idempotencyKey },
    });
  }
  sendWhatsApp(message: OutgoingWhatsApp): Promise<ProviderReceipt> {
    if (this.config.stagingEmailRecipient !== undefined)
      throw new MessagingProviderError('STAGING_CHANNEL_NOT_AUTHORIZED');
    if (this.config.whatsAppEnabled !== true)
      throw new MessagingProviderError('WHATSAPP_NOT_AUTHORIZED');
    if (!this.config.whatsAppSender)
      throw new MessagingProviderError('BREVO_WHATSAPP_SENDER_MISSING');
    const templateId = this.config.whatsAppTemplateIds[message.locale];
    if (!templateId) throw new MessagingProviderError('BREVO_WHATSAPP_TEMPLATE_MISSING');
    // Brevo requires an approved utility template for the first contact. The
    // configured FR/EN/AR templates announce a GestSchool notification; detail
    // remains available only after authenticated in-app navigation.
    return this.send('whatsapp/sendMessage', {
      senderNumber: this.config.whatsAppSender,
      contactNumbers: [message.to.replace(/^\+/, '')],
      templateId,
    });
  }
}

export function createMessagingProvider(config: MessagingConfig): MessagingProvider {
  if (process.env['NODE_ENV'] === 'test' || config.mode === 'local')
    return new LocalMessagingProvider();
  return new BrevoMessagingProvider(config);
}
