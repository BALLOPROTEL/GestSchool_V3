import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MessagingConfig } from '@gestschool/config/messaging';
import {
  BrevoMessagingProvider,
  LocalMessagingProvider,
  createMessagingProvider,
} from './provider.js';

const config: MessagingConfig = {
  mode: 'brevo',
  appPublicOrigin: 'https://app.example.invalid',
  apiKey: 'test-only-not-a-real-key',
  emailSender: 'sender@example.invalid',
  emailSenderName: 'GestSchool',
  whatsAppSender: '33612345678',
  whatsAppTemplateIds: { fr: 10, en: 11, ar: 12 },
  webhookSecret: 'test-only-webhook-secret-32-bytes-long',
  tokenKey: Buffer.alloc(32).toString('base64'),
};

afterEach(() => vi.unstubAllGlobals());

describe('messaging providers', () => {
  it('forces local mode under NODE_ENV=test even with Brevo configuration', () => {
    vi.stubEnv('NODE_ENV', 'test');
    expect(createMessagingProvider(config).name).toBe('LOCAL');
    vi.unstubAllEnvs();
  });

  it('captures locally in an owner-only file without a network call', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'gestschool-messaging-'));
    const path = new URL(`file://${directory}/capture.jsonl`);
    const network = vi.fn();
    vi.stubGlobal('fetch', network);
    try {
      const provider = new LocalMessagingProvider(path);
      const receipt = await provider.sendEmail({
        messageId: 'message-1',
        idempotencyKey: 'message-1',
        to: 'someone@example.invalid',
        subject: 'Test',
        html: '<p>Local</p>',
      });
      expect(receipt.providerMessageId).toBe('local:message-1');
      expect(network).not.toHaveBeenCalled();
      expect((await stat(path)).mode & 0o777).toBe(0o600);
      expect(await readFile(path, 'utf8')).toContain('someone@example.invalid');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('uses documented Brevo email and approved WhatsApp template contracts', async () => {
    const network = vi.fn(
      async (_url: string, _request: RequestInit) =>
        new Response(JSON.stringify({ messageId: 'provider-123' }), { status: 201 }),
    );
    vi.stubGlobal('fetch', network);
    const provider = new BrevoMessagingProvider(config);
    await provider.sendEmail({
      messageId: 'one',
      idempotencyKey: 'one',
      to: 'recipient@example.invalid',
      subject: 'Safe',
      html: '<p>Safe</p>',
    });
    await provider.sendWhatsApp({
      messageId: 'two',
      to: '+33612345678',
      text: 'Safe',
      locale: 'ar',
    });
    expect(network).toHaveBeenCalledTimes(2);
    const [emailUrl, emailRequest] = network.mock.calls[0] ?? [];
    const [whatsAppUrl, whatsAppRequest] = network.mock.calls[1] ?? [];
    expect(emailUrl).toBe('https://api.brevo.com/v3/smtp/email');
    expect(JSON.parse(String(emailRequest?.body ?? '{}'))).toMatchObject({
      to: [{ email: 'recipient@example.invalid' }],
      headers: { idempotencyKey: 'one' },
    });
    expect(whatsAppUrl).toBe('https://api.brevo.com/v3/whatsapp/sendMessage');
    expect(JSON.parse(String(whatsAppRequest?.body ?? '{}'))).toMatchObject({
      contactNumbers: ['33612345678'],
      templateId: 12,
    });
  });
});
