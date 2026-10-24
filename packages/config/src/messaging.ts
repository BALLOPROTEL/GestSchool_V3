import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import {
  parseSecretJson,
  requireEncryptionKey,
  requirePublicHttps,
  requireStrongSecret,
  validateDeploymentEnvironment,
} from './security.js';

const origin = z.url().refine((value) => new URL(value).origin === value);
const email = z.email();
const locale = z.enum(['fr', 'en', 'ar']);

export interface MessagingConfig {
  mode: 'local' | 'brevo';
  appPublicOrigin: string;
  emailSender: string | null;
  emailSenderName: string;
  whatsAppSender: string | null;
  whatsAppTemplateIds: Partial<Record<'fr' | 'en' | 'ar', number>>;
  apiKey: string | null;
  webhookSecret: string | null;
  tokenKey: string;
  // Present only for staging: null disables all real sends until a test inbox is authorized.
  stagingEmailRecipient?: string | null;
}

export function loadMessagingConfig(environment: NodeJS.ProcessEnv = process.env): MessagingConfig {
  validateDeploymentEnvironment(environment);
  const nodeEnvironment = z
    .enum(['development', 'test', 'production'])
    .parse(environment['NODE_ENV'] ?? 'development');
  const configuredMode = z
    .enum(['local', 'brevo'])
    .parse(
      environment['MESSAGING_PROVIDER'] ?? (nodeEnvironment === 'production' ? 'brevo' : 'local'),
    );
  const mode = nodeEnvironment === 'test' ? 'local' : configuredMode;
  if (nodeEnvironment === 'production' && mode !== 'brevo')
    throw new Error('Production messaging requires Brevo');

  const appPublicOrigin = origin.parse(
    environment['APP_PUBLIC_ORIGIN'] ??
      (nodeEnvironment === 'production' ? undefined : 'http://127.0.0.1:3000'),
  );
  if (nodeEnvironment === 'production' && !appPublicOrigin.startsWith('https://'))
    throw new Error('Production messaging links require HTTPS');
  if (nodeEnvironment === 'production')
    requirePublicHttps(appPublicOrigin, 'APP_PUBLIC_ORIGIN', true);

  const templateIdsInput: unknown = JSON.parse(
    environment['BREVO_WHATSAPP_TEMPLATE_IDS_JSON'] ?? '{}',
  );
  const whatsAppTemplateIds = z
    .partialRecord(locale, z.number().int().positive())
    .parse(templateIdsInput);
  const apiKey = environment['BREVO_API_KEY'] ?? null;
  const tokenKey =
    environment['MESSAGING_TOKEN_KEY'] ??
    (nodeEnvironment === 'production'
      ? ''
      : readFileSync(new URL('../../../.local/messaging.key', import.meta.url), 'utf8').trim());
  if (Buffer.from(tokenKey, 'base64').length !== 32)
    throw new Error('Messaging token encryption requires a 256-bit key');
  const webhookSecret =
    environment['BREVO_WEBHOOK_SECRET'] ??
    (mode === 'local'
      ? createHmac('sha256', Buffer.from(tokenKey, 'base64'))
          .update('gestschool-local-webhook-v1')
          .digest('hex')
      : null);
  const emailSender = environment['BREVO_EMAIL_SENDER'] ?? null;
  const whatsAppSender = environment['BREVO_WHATSAPP_SENDER'] ?? null;
  if (mode === 'brevo') {
    z.string().min(20).parse(apiKey);
    z.string().min(32).parse(webhookSecret);
    email.parse(emailSender);
    z.string()
      .regex(/^[1-9]\d{7,14}$/)
      .parse(whatsAppSender);
    if (!whatsAppTemplateIds.fr || !whatsAppTemplateIds.en || !whatsAppTemplateIds.ar)
      throw new Error('Brevo requires approved FR/EN/AR WhatsApp template IDs');
  }
  if (nodeEnvironment === 'production') {
    requireEncryptionKey(tokenKey, 'MESSAGING_TOKEN_KEY');
    requireStrongSecret(apiKey ?? undefined, 'BREVO_API_KEY');
    requireStrongSecret(webhookSecret ?? undefined, 'BREVO_WEBHOOK_SECRET');
    if (emailSender?.endsWith('.invalid'))
      throw new Error('Production forbids example sender credentials');
    if (
      environment['IAM_CSRF_KEY'] === tokenKey ||
      Object.values(
        parseSecretJson(environment['IAM_MFA_KEYS_JSON'] ?? '{}', 'IAM_MFA_KEYS_JSON') as Record<
          string,
          unknown
        >,
      ).includes(tokenKey)
    )
      throw new Error('Messaging and IAM encryption keys must be independent');
  }

  return {
    mode,
    appPublicOrigin,
    emailSender,
    emailSenderName: environment['BREVO_EMAIL_SENDER_NAME'] ?? 'GestSchool',
    whatsAppSender,
    whatsAppTemplateIds,
    apiKey,
    webhookSecret,
    tokenKey,
    ...(environment['APP_ENV'] === 'staging'
      ? {
          stagingEmailRecipient: (() => {
            const result = email.safeParse(
              environment['BREVO_TEST_RECIPIENT']?.trim().toLowerCase(),
            );
            return result.success && !result.data.endsWith('.invalid') ? result.data : null;
          })(),
        }
      : {}),
  };
}
