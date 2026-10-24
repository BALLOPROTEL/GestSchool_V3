import { describe, expect, it } from 'vitest';
import { loadMessagingConfig } from './messaging.js';
import { randomBytes } from 'node:crypto';

const key = Buffer.alloc(32, 1).toString('base64');

describe('messaging environment boundaries', () => {
  it('always forces the private local provider during tests', () => {
    expect(
      loadMessagingConfig({
        NODE_ENV: 'test',
        MESSAGING_PROVIDER: 'brevo',
        APP_PUBLIC_ORIGIN: 'http://127.0.0.1:3000',
        MESSAGING_TOKEN_KEY: key,
      }).mode,
    ).toBe('local');
  });

  it('rejects incomplete production Brevo configuration and non-HTTPS links', () => {
    expect(() =>
      loadMessagingConfig({
        NODE_ENV: 'production',
        MESSAGING_PROVIDER: 'brevo',
        APP_PUBLIC_ORIGIN: 'http://app.example.invalid',
        MESSAGING_TOKEN_KEY: key,
      }),
    ).toThrow('Production messaging links require HTTPS');
    expect(() =>
      loadMessagingConfig({
        NODE_ENV: 'production',
        MESSAGING_PROVIDER: 'brevo',
        APP_PUBLIC_ORIGIN: 'https://app.example.invalid',
        MESSAGING_TOKEN_KEY: key,
      }),
    ).toThrow();
  });

  it('accepts production only with explicit secrets and approved locale templates', () => {
    const environment = {
      NODE_ENV: 'production',
      MESSAGING_PROVIDER: 'brevo',
      APP_PUBLIC_ORIGIN: 'https://app.example.com',
      MESSAGING_TOKEN_KEY: randomBytes(32).toString('base64'),
      BREVO_API_KEY: randomBytes(32).toString('hex'),
      BREVO_EMAIL_SENDER: 'sender@example.com',
      BREVO_EMAIL_SENDER_NAME: 'GestSchool',
      BREVO_WHATSAPP_SENDER: '33612345678',
      BREVO_WHATSAPP_TEMPLATE_IDS_JSON: '{"fr":1,"en":2,"ar":3}',
      BREVO_WEBHOOK_SECRET: randomBytes(32).toString('hex'),
    };
    const config = loadMessagingConfig(environment);
    expect(config.mode).toBe('brevo');
    expect(config.appPublicOrigin).toBe('https://app.example.com');
    for (const recipient of [
      undefined,
      '<EMAIL_TEST>',
      'not-an-email',
      'fixture@example.invalid',
    ]) {
      expect(
        loadMessagingConfig({
          ...environment,
          APP_ENV: 'staging',
          IAM_ENV: 'staging',
          BREVO_TEST_RECIPIENT: recipient,
        }).stagingEmailRecipient,
      ).toBeNull();
    }
    expect(
      loadMessagingConfig({
        ...environment,
        APP_ENV: 'staging',
        IAM_ENV: 'staging',
        BREVO_TEST_RECIPIENT: 'controlled@example.com',
      }).stagingEmailRecipient,
    ).toBe('controlled@example.com');
  });
});
