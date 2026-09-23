import { describe, expect, it } from 'vitest';
import { loadMessagingConfig } from './messaging.js';

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
    const config = loadMessagingConfig({
      NODE_ENV: 'production',
      MESSAGING_PROVIDER: 'brevo',
      APP_PUBLIC_ORIGIN: 'https://app.example.invalid',
      MESSAGING_TOKEN_KEY: key,
      BREVO_API_KEY: 'xkeysib-test-value-long-enough',
      BREVO_EMAIL_SENDER: 'sender@example.invalid',
      BREVO_EMAIL_SENDER_NAME: 'GestSchool',
      BREVO_WHATSAPP_SENDER: '33612345678',
      BREVO_WHATSAPP_TEMPLATE_IDS_JSON: '{"fr":1,"en":2,"ar":3}',
      BREVO_WEBHOOK_SECRET: 'test-webhook-secret-at-least-32-bytes',
    });
    expect(config.mode).toBe('brevo');
    expect(config.appPublicOrigin).toBe('https://app.example.invalid');
  });
});
